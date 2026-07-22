import { Tool } from "../../Tool";
import { IOrdersRepository } from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

/**
 * Consulta um pedido específico pelo seu código.
 */
export class GetOrderTool extends Tool {
  private orders: IOrdersRepository;

  private constructor(orders: IOrdersRepository) {
    super({
      name: "getOrder",
      description:
        "Consulta os detalhes e o status de um pedido a partir do seu código (ex.: 'ORD-0001').",
    });

    this.orders = orders;

    this.addParameter({
      name: "orderId",
      type: "string",
      description: "Código do pedido (ex.: ORD-0001)",
      required: true,
    });
  }

  public static create(orders: IOrdersRepository): GetOrderTool {
    return new GetOrderTool(orders);
  }

  public execute({ orderId }: { orderId: string }) {
    const order = this.orders.findById(orderId ?? "");
    if (!order) {
      return { found: false, message: `Pedido "${orderId}" não encontrado.` };
    }
    return { found: true, order };
  }
}
