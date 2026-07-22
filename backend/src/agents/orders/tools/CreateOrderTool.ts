import { Tool } from "../../Tool";
import { IProductsRepository } from "../../../repositories/productsRepository/interfaces/IProductsRepository";
import { IOrdersRepository } from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";
import { OrderItem } from "../../../repositories/ordersRepository/interfaces/IOrdersRepository";

type RawItem = { productId: string; quantity: number };

/**
 * Cria um pedido validando produtos e estoque. Debita o estoque dos produtos
 * pedidos e registra o pedido no repositório em memória.
 */
export class CreateOrderTool extends Tool {
  private products: IProductsRepository;
  private orders: IOrdersRepository;

  private constructor(
    products: IProductsRepository,
    orders: IOrdersRepository,
  ) {
    super({
      name: "createOrder",
      description:
        "Cria um novo pedido para o cliente. Valida a existência dos produtos e o estoque disponível, calcula o total e registra o pedido. Use apenas quando o cliente confirmar o que deseja pedir.",
    });

    this.products = products;
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
    products: IProductsRepository,
    orders: IOrdersRepository,
  ): CreateOrderTool {
    return new CreateOrderTool(products, orders);
  }

  public execute({
    customerName,
    items,
  }: {
    customerName: string;
    items: RawItem[];
  }) {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        message: "O pedido precisa ter ao menos um item.",
      };
    }

    const orderItems: OrderItem[] = [];

    // Valida todos os itens antes de debitar qualquer estoque.
    for (const item of items) {
      const product = this.products.findById(item.productId ?? "");
      if (!product) {
        return {
          success: false,
          message: `Produto "${item.productId}" não encontrado no catálogo.`,
        };
      }
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return {
          success: false,
          message: `Quantidade inválida para "${product.name}".`,
        };
      }
      if (product.stock < quantity) {
        return {
          success: false,
          message: `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}.`,
        };
      }

      orderItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        unitPrice: product.price,
        subtotal: Number((product.price * quantity).toFixed(2)),
      });
    }

    // Debita o estoque agora que todos os itens são válidos.
    for (const item of orderItems) {
      this.products.decrementStock(item.productId, item.quantity);
    }

    const total = Number(
      orderItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
    );

    const order = this.orders.create({
      customerName,
      items: orderItems,
      total,
    });

    return { success: true, order };
  }
}
