import { Tool } from "../../Tool";
import { ToolSession } from "../../ToolSession";
import { ToolResponse, toolError, toolSuccess } from "../../ToolResponse";
import {
  IOrdersRepository,
  Order,
  OrderStatus,
} from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "delivered",
  "cancelled",
];

export class UpdateOrderStatusTool extends Tool {
  private orders: IOrdersRepository;

  private constructor(orders: IOrdersRepository) {
    super({
      name: "updateOrderStatus",
      description:
        "Atualiza o status de um pedido. Status válidos: pending, confirmed, preparing, delivered, cancelled. Use, por exemplo, para cancelar um pedido. Consulte o pedido com 'getOrder' antes de alterar o status.",
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

  public override checkPrecondition(
    params: { orderId?: string },
    session?: ToolSession,
  ): ToolResponse<unknown> | null {
    const orderId = params?.orderId ?? "";

    const consulted = session?.usedWith(
      "getOrder",
      (args) => args["orderId"] === orderId,
    );

    if (consulted) return null;

    return toolError({
      errorCategory: "permission",
      isRetryable: false,
      message: `Pré-condição não atendida: consulte o pedido "${orderId}" com a ferramenta 'getOrder' antes de alterar o status dele.`,
      userFriendlyMessage:
        "Preciso confirmar os dados do pedido antes de alterá-lo.",
    });
  }

  public async execute({
    orderId,
    status,
  }: {
    orderId: string;
    status: string;
  }): Promise<ToolResponse<Order>> {
    if (!VALID_STATUSES.includes(status as OrderStatus)) {
      return toolError({
        errorCategory: "validation",
        isRetryable: true,
        message: `Status "${status}" inválido. Use um destes: ${VALID_STATUSES.join(", ")}.`,
        userFriendlyMessage:
          "Esse status de pedido não existe. Os status possíveis são: pendente, confirmado, em preparo, entregue e cancelado.",
      });
    }

    const order = this.orders.updateStatus(orderId ?? "", status as OrderStatus);

    if (!order) {
      return toolError({
        errorCategory: "business",
        isRetryable: false,
        message: `Pedido "${orderId}" não encontrado.`,
        userFriendlyMessage: `Não encontrei o pedido ${orderId} para atualizar.`,
      });
    }

    return toolSuccess({
      message: `Pedido ${order.id} atualizado para o status "${order.status}".`,
      userFriendlyMessage: `O pedido ${order.id} foi atualizado para "${order.status}".`,
      data: order,
    });
  }
}
