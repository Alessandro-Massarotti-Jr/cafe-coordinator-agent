import { Tool } from "../../Tool";
import { ToolResponse, toolSuccess } from "../../ToolResponse";
import {
  IOrdersRepository,
  Order,
} from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

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

  public async execute({
    orderId,
  }: {
    orderId: string;
  }): Promise<ToolResponse<Order | null>> {
    const order = this.orders.findById(orderId ?? "");

    if (!order) {
      return toolSuccess<Order | null>({
        message: `Nenhum pedido encontrado com o código "${orderId}".`,
        userFriendlyMessage: `Não encontrei nenhum pedido com o código ${orderId}. Confira se o código está correto.`,
        data: null,
      });
    }

    return toolSuccess<Order>({
      message: `Pedido ${order.id} encontrado com status "${order.status}".`,
      userFriendlyMessage: `Encontrei o pedido ${order.id}.`,
      data: order,
    });
  }
}
