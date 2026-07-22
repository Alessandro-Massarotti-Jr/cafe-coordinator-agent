import {
  CreateOrderInput,
  IOrdersRepository,
  Order,
  OrderStatus,
} from "../interfaces/IOrdersRepository";

export class InMemoryOrdersRepository implements IOrdersRepository {
  private orders: Order[] = [];
  private sequence = 1;
  private static instance: InMemoryOrdersRepository;

  private constructor() {}

  public static getInstance(): InMemoryOrdersRepository {
    if (!InMemoryOrdersRepository.instance) {
      InMemoryOrdersRepository.instance = new InMemoryOrdersRepository();
    }
    return InMemoryOrdersRepository.instance;
  }

  public create(input: CreateOrderInput): Order {
    const order: Order = {
      id: `ORD-${String(this.sequence++).padStart(4, "0")}`,
      customerName: input.customerName,
      items: input.items,
      total: input.total,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };

    this.orders.push(order);
    return { ...order };
  }

  public findById(id: string): Order | undefined {
    const order = this.orders.find(
      (o) => o.id.toLowerCase() === id.trim().toLowerCase(),
    );
    return order ? { ...order } : undefined;
  }

  public findAll(): Order[] {
    return this.orders.map((order) => ({ ...order }));
  }

  public findByCustomer(customerName: string): Order[] {
    const normalized = customerName.trim().toLowerCase();
    return this.orders
      .filter((o) => o.customerName.toLowerCase().includes(normalized))
      .map((order) => ({ ...order }));
  }

  public updateStatus(id: string, status: OrderStatus): Order | undefined {
    const order = this.orders.find(
      (o) => o.id.toLowerCase() === id.trim().toLowerCase(),
    );
    if (!order) return undefined;

    order.status = status;
    return { ...order };
  }
}
