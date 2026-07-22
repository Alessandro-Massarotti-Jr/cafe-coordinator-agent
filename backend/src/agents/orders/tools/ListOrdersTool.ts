import { Tool } from "../../Tool";
import { IOrdersRepository } from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

/**
 * Lista pedidos, opcionalmente filtrando pelo nome do cliente.
 */
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

  public execute({ customerName }: { customerName?: string }) {
    const orders = customerName
      ? this.orders.findByCustomer(customerName)
      : this.orders.findAll();

    return { count: orders.length, orders };
  }
}
