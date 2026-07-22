import { Tool } from "../../Tool";
import { IProductsRepository } from "../../../repositories/productsRepository/interfaces/IProductsRepository";

/**
 * Lista os produtos do catálogo. Por padrão retorna apenas os disponíveis
 * (com estoque), mas pode incluir os esgotados quando solicitado.
 */
export class ListProductsTool extends Tool {
  private repository: IProductsRepository;

  private constructor(repository: IProductsRepository) {
    super({
      name: "listProducts",
      description:
        "Lista os produtos do cardápio da padaria com preço, estoque e disponibilidade. Use para responder 'o que vocês têm?' ou mostrar o catálogo.",
    });

    this.repository = repository;

    this.addParameter({
      name: "includeUnavailable",
      type: "boolean",
      description:
        "Se true, inclui também os produtos sem estoque. Padrão: false (apenas disponíveis).",
      required: false,
    });
  }

  public static create(repository: IProductsRepository): ListProductsTool {
    return new ListProductsTool(repository);
  }

  public execute({ includeUnavailable }: { includeUnavailable?: boolean }) {
    const products = includeUnavailable
      ? this.repository.findAll()
      : this.repository.findAvailable();

    return { count: products.length, products };
  }
}
