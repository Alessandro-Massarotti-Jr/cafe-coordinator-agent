import { Tool } from "../../Tool";
import { ToolResponse, toolError, toolSuccess } from "../../ToolResponse";
import { McpToolProvider } from "../../../providers/McpToolProvider/McpToolProvider";
import {
  IOrdersRepository,
  Order,
  OrderItem,
} from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

type RawItem = { productId: string; quantity: number };

type McpProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

type McpToolResponse<T> = {
  isError: boolean;
  userFriendlyMessage: string;
  data: T | null;
};

export class CreateOrderTool extends Tool {
  private productsMcp: McpToolProvider;
  private orders: IOrdersRepository;

  private constructor(productsMcp: McpToolProvider, orders: IOrdersRepository) {
    super({
      name: "createOrder",
      description:
        "Cria um novo pedido para o cliente. Valida a existência dos produtos e o estoque disponível, calcula o total e registra o pedido. Use apenas quando o cliente confirmar o que deseja pedir.",
    });

    this.productsMcp = productsMcp;
    this.orders = orders;

    this.addParameter({
      name: "customerName",
      type: "string",
      description: "Nome do cliente que está fazendo o pedido",
      required: true,
    });

    this.addParameter({
      name: "items",
      type: "array",
      required: true,
      description: "Lista de itens do pedido",
      items: {
        name: "item",
        type: "object",
        required: true,
        description: "Item do pedido com código do produto e quantidade",
        properties: [
          {
            name: "productId",
            type: "string",
            description: "Código do produto (ex.: PROD-001)",
            required: true,
          },
          {
            name: "quantity",
            type: "number",
            description: "Quantidade desejada do produto",
            required: true,
          },
        ],
      },
    });
  }

  public static create(
    productsMcp: McpToolProvider,
    orders: IOrdersRepository,
  ): CreateOrderTool {
    return new CreateOrderTool(productsMcp, orders);
  }

  public async execute({
    customerName,
    items,
  }: {
    customerName: string;
    items: RawItem[];
  }): Promise<ToolResponse<Order>> {
    if (!customerName || !String(customerName).trim()) {
      return toolError({
        errorCategory: "validation",
        isRetryable: true,
        message: "O nome do cliente é obrigatório para criar um pedido.",
        userFriendlyMessage:
          "Para registrar o pedido, preciso saber o nome do cliente.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return toolError({
        errorCategory: "validation",
        isRetryable: true,
        message: "O pedido precisa ter ao menos um item.",
        userFriendlyMessage:
          "Preciso saber quais itens o cliente deseja para registrar o pedido.",
      });
    }

    const orderItems: OrderItem[] = [];

    for (const item of items) {
      const product = await this.findProduct(item.productId ?? "");
      if (!product) {
        return toolError({
          errorCategory: "validation",
          isRetryable: true,
          message: `Produto "${item.productId}" não encontrado no catálogo. Confirme o código (formato PROD-XXX) antes de tentar novamente.`,
          userFriendlyMessage: `Não encontrei o produto ${item.productId} no cardápio.`,
        });
      }
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return toolError({
          errorCategory: "validation",
          isRetryable: true,
          message: `Quantidade inválida para "${product.name}": ${item.quantity}. Informe um número inteiro maior que zero.`,
          userFriendlyMessage: `A quantidade informada para ${product.name} não é válida.`,
        });
      }
      if (product.stock < quantity) {
        return toolError({
          errorCategory: "business",
          isRetryable: false,
          message: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}, solicitado: ${quantity}.`,
          userFriendlyMessage: `No momento temos apenas ${product.stock} unidade(s) de ${product.name} disponíveis.`,
        });
      }

      orderItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: product.price,
        subtotal: Number((product.price * quantity).toFixed(2)),
      });
    }

    const total = Number(
      orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
    );

    const order = this.orders.create({
      customerName,
      items: orderItems,
      total,
    });

    return toolSuccess({
      message: `Pedido ${order.id} criado para ${order.customerName} com ${orderItems.length} item(ns), total R$ ${total.toFixed(2)}.`,
      userFriendlyMessage: `Pedido ${order.id} registrado! Total: R$ ${total.toFixed(2)}.`,
      data: order,
    });
  }

  private async findProduct(productId: string): Promise<McpProduct | undefined> {
    if (!productId) return undefined;

    const response = (await this.productsMcp.callTool("getProductDetails", {
      productId,
    })) as McpToolResponse<{ product: McpProduct }>;

    if (!response || response.isError || !response.data) {
      return undefined;
    }

    return response.data.product;
  }
}
