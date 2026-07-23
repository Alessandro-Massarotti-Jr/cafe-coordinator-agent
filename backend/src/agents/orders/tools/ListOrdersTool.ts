import { Tool } from "../../Tool";
import { ToolResponse, toolSuccess } from "../../ToolResponse";
import {
  IOrdersRepository,
  Order,
} from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

export class ListOrdersTool extends Tool {
  private orders: IOrdersRepository;

  private constructor(orders: IOrdersRepository) {
    super({
      name: "listOrders",
      description:
        "Lista os pedidos registrados. Pode filtrar pelo nome do cliente para ver o histórico de pedidos dele.",
    });

    this.orders = orders;

    this.addParameter({
      name: "customerName",
      type: "string",
      description:
        "Nome do cliente para filtrar os pedidos. Se omitido, lista todos.",
      required: false,
    });
  }

  public static create(orders: IOrdersRepository): ListOrdersTool {
    return new ListOrdersTool(orders);
  }

  public async execute({
    customerName,
  }: {
    customerName?: string;
  }): Promise<ToolResponse<{ count: number; orders: Order[] }>> {
    const orders = customerName
      ? this.orders.findByCustomer(customerName)
      : this.orders.findAll();

    const scope = customerName ? ` do cliente "${customerName}"` : "";

    return toolSuccess({
      message:
        orders.length > 0
          ? `${orders.length} pedido(s)${scope} encontrados.`
          : `Nenhum pedido${scope} registrado.`,
      userFriendlyMessage:
        orders.length > 0
          ? `Encontrei ${orders.length} pedido(s)${scope}.`
          : `Não há pedidos${scope} registrados até agora.`,
      data: { count: orders.length, orders },
    });
  }
}
