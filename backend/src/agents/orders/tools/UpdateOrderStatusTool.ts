import { Tool } from "../../Tool";
import {
  IOrdersRepository,
  OrderStatus,
} from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "delivered",
  "cancelled",
];

/**
 * Atualiza o status de um pedido existente.
 */
export class UpdateOrderStatusTool extends Tool {
  private orders: IOrdersRepository;

  private constructor(orders: IOrdersRepository) {
    super({
      name: "updateOrderStatus",
      description:
        "Atualiza o status de um pedido. Status válidos: pending, confirmed, preparing, delivered, cancelled. Use, por exemplo, para cancelar um pedido.",
    });

    this.orders = orders;

    this.addParameter({
      name: "orderId",
      type: "string",
      description: "Código do pedido (ex.: ORD-0001)",
      required: true,
    });
    this.addParameter({
      name: "status",
      type: "string",
      description:
        "Novo status: pending, confirmed, preparing, delivered ou cancelled",
      required: true,
    });
  }

  public static create(orders: IOrdersRepository): UpdateOrderStatusTool {
    return new UpdateOrderStatusTool(orders);
  }

  public execute({ orderId, status }: { orderId: string; status: string }) {
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      return {
        success: false,
        message: `Status inválido. Use um destes: ${VALID_STATUSES.join(", ")}.`,
      };
    }

    const order = this.orders.updateStatus(
      orderId ?? "",
      status as OrderStatus,
    );
    if (!order) {
      return { success: false, message: `Pedido "${orderId}" não encontrado.` };
    }
    return { success: true, order };
  }
}
