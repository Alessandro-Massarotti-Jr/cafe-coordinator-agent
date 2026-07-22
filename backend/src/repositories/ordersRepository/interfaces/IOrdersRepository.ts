export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "delivered"
  | "cancelled";

export type Order = {
  id: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
};

export type CreateOrderInput = {
  customerName: string;
  items: OrderItem[];
  total: number;
};

export interface IOrdersRepository {
  create(input: CreateOrderInput): Order;
  findById(id: string): Order | undefined;
  findAll(): Order[];
  findByCustomer(customerName: string): Order[];
  updateStatus(id: string, status: OrderStatus): Order | undefined;
}
