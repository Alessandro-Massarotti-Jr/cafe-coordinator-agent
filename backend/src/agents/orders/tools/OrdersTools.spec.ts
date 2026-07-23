import { CreateOrderTool } from "./CreateOrderTool";
import { GetOrderTool } from "./GetOrderTool";
import { ListOrdersTool } from "./ListOrdersTool";
import { UpdateOrderStatusTool } from "./UpdateOrderStatusTool";
import { ToolSession } from "../../ToolSession";
import {
  CreateOrderInput,
  IOrdersRepository,
  Order,
  OrderStatus,
} from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";
import { McpToolProvider } from "../../../providers/McpToolProvider/McpToolProvider";

class FakeOrdersRepository implements IOrdersRepository {
  public orders: Order[] = [];
  private sequence = 1;

  create(input: CreateOrderInput): Order {
    const order: Order = {
      id: `ORD-${String(this.sequence++).padStart(4, "0")}`,
      customerName: input.customerName,
      items: input.items,
      total: input.total,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    this.orders.push(order);
    return order;
  }

  findById(id: string): Order | undefined {
    return this.orders.find((order) => order.id === id);
  }

  findAll(): Order[] {
    return [...this.orders];
  }

  findByCustomer(customerName: string): Order[] {
    return this.orders.filter((order) =>
      order.customerName.toLowerCase().includes(customerName.toLowerCase()),
    );
  }

  updateStatus(id: string, status: OrderStatus): Order | undefined {
    const order = this.findById(id);
    if (!order) return undefined;
    order.status = status;
    return order;
  }
}

function fakeMcp(products: Record<string, unknown>): McpToolProvider {
  return {
    callTool: async (_name: string, args: Record<string, unknown>) => {
      const product = products[String(args["productId"])];
      if (!product) return { isError: true, data: null };
      return { isError: false, data: { product } };
    },
  } as unknown as McpToolProvider;
}

describe("CreateOrderTool", () => {
  const catalog = {
    "PROD-001": { id: "PROD-001", name: "Espresso", price: 8, stock: 10 },
    "PROD-002": { id: "PROD-002", name: "Bolo", price: 12, stock: 1 },
  };

  it("cria o pedido e calcula o total", async () => {
    const repository = new FakeOrdersRepository();
    const tool = CreateOrderTool.create(fakeMcp(catalog), repository);

    const result = await tool.execute({
      customerName: "Ana",
      items: [{ productId: "PROD-001", quantity: 2 }],
    });

    expect(result.isError).toBe(false);
    expect(result.data?.total).toBe(16);
    expect(repository.orders).toHaveLength(1);
  });

  it("trata produto inexistente como validation", async () => {
    const tool = CreateOrderTool.create(
      fakeMcp(catalog),
      new FakeOrdersRepository(),
    );

    const result = await tool.execute({
      customerName: "Ana",
      items: [{ productId: "PROD-999", quantity: 1 }],
    });

    expect(result.isError).toBe(true);
    expect(result.errorCategory).toBe("validation");
  });

  it("trata quantidade inválida como validation", async () => {
    const tool = CreateOrderTool.create(
      fakeMcp(catalog),
      new FakeOrdersRepository(),
    );

    const result = await tool.execute({
      customerName: "Ana",
      items: [{ productId: "PROD-001", quantity: 0 }],
    });

    expect(result.errorCategory).toBe("validation");
  });

  it("trata estoque insuficiente como business não retentável", async () => {
    const tool = CreateOrderTool.create(
      fakeMcp(catalog),
      new FakeOrdersRepository(),
    );

    const result = await tool.execute({
      customerName: "Ana",
      items: [{ productId: "PROD-002", quantity: 5 }],
    });

    expect(result.errorCategory).toBe("business");
    expect(result.isRetryable).toBe(false);
  });

  it("exige nome do cliente e itens", async () => {
    const tool = CreateOrderTool.create(
      fakeMcp(catalog),
      new FakeOrdersRepository(),
    );

    await expect(
      tool.execute({ customerName: "", items: [{ productId: "PROD-001", quantity: 1 }] }),
    ).resolves.toMatchObject({ errorCategory: "validation" });

    await expect(
      tool.execute({ customerName: "Ana", items: [] }),
    ).resolves.toMatchObject({ errorCategory: "validation" });
  });
});

describe("GetOrderTool", () => {
  it("trata pedido inexistente como sucesso com data nula", async () => {
    const tool = GetOrderTool.create(new FakeOrdersRepository());

    const result = await tool.execute({ orderId: "ORD-9999" });

    expect(result.isError).toBe(false);
    expect(result.data).toBeNull();
  });

  it("retorna o pedido encontrado", async () => {
    const repository = new FakeOrdersRepository();
    repository.create({ customerName: "Ana", items: [], total: 0 });

    const result = await GetOrderTool.create(repository).execute({
      orderId: "ORD-0001",
    });

    expect(result.isError).toBe(false);
    expect(result.data?.id).toBe("ORD-0001");
  });
});

describe("ListOrdersTool", () => {
  it("lista vazia é sucesso, não erro", async () => {
    const result = await ListOrdersTool.create(
      new FakeOrdersRepository(),
    ).execute({});

    expect(result.isError).toBe(false);
    expect(result.data?.count).toBe(0);
  });

  it("filtra por cliente", async () => {
    const repository = new FakeOrdersRepository();
    repository.create({ customerName: "Ana", items: [], total: 0 });
    repository.create({ customerName: "Bruno", items: [], total: 0 });

    const result = await ListOrdersTool.create(repository).execute({
      customerName: "Ana",
    });

    expect(result.data?.count).toBe(1);
  });
});

describe("UpdateOrderStatusTool", () => {
  function setup() {
    const repository = new FakeOrdersRepository();
    repository.create({ customerName: "Ana", items: [], total: 0 });
    return { repository, tool: UpdateOrderStatusTool.create(repository) };
  }

  it("bloqueia a alteração sem consulta prévia do mesmo pedido", () => {
    const { tool } = setup();
    const session = new ToolSession("s1");

    const guard = tool.checkPrecondition({ orderId: "ORD-0001" }, session);

    expect(guard?.errorCategory).toBe("permission");
    expect(guard?.isRetryable).toBe(false);
  });

  it("libera a alteração depois de getOrder do mesmo pedido", () => {
    const { tool } = setup();
    const session = new ToolSession("s1");
    session.record("getOrder", { orderId: "ORD-0001" });

    expect(tool.checkPrecondition({ orderId: "ORD-0001" }, session)).toBeNull();
  });

  it("não libera quando o getOrder foi de outro pedido", () => {
    const { tool } = setup();
    const session = new ToolSession("s1");
    session.record("getOrder", { orderId: "ORD-0002" });

    expect(
      tool.checkPrecondition({ orderId: "ORD-0001" }, session),
    ).not.toBeNull();
  });

  it("status fora do enum é validation", async () => {
    const { tool } = setup();

    const result = await tool.execute({
      orderId: "ORD-0001",
      status: "entregue",
    });

    expect(result.errorCategory).toBe("validation");
  });

  it("pedido inexistente é business", async () => {
    const { tool } = setup();

    const result = await tool.execute({
      orderId: "ORD-9999",
      status: "cancelled",
    });

    expect(result.errorCategory).toBe("business");
  });

  it("atualiza o status quando tudo é válido", async () => {
    const { tool } = setup();

    const result = await tool.execute({
      orderId: "ORD-0001",
      status: "cancelled",
    });

    expect(result.isError).toBe(false);
    expect(result.data?.status).toBe("cancelled");
  });
});
