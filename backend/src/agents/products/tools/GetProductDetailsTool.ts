import { Tool } from "../../Tool";
import { IProductsRepository } from "../../../repositories/productsRepository/interfaces/IProductsRepository";

/**
 * Retorna os detalhes completos de um produto a partir do seu código.
 */
export class GetProductDetailsTool extends Tool {
  private repository: IProductsRepository;

  private constructor(repository: IProductsRepository) {
    super({
      name: "getProductDetails",
      description:
        "Retorna os detalhes completos de um produto específico a partir do seu código (ex.: 'PROD-001'): preço, estoque, descrição e disponibilidade.",
    });

    this.repository = repository;

    this.addParameter({
      name: "productId",
      type: "string",
      description: "Código do produto (ex.: PROD-001)",
      required: true,
    });
  }

  public static create(repository: IProductsRepository): GetProductDetailsTool {
    return new GetProductDetailsTool(repository);
  }

  public execute({ productId }: { productId: string }) {
    const product = this.repository.findById(productId ?? "");
    if (!product) {
      return {
        found: false,
        message: `Produto "${productId}" não encontrado.`,
      };
    }
    return { found: true, product };
  }
}
