import { Tool } from "../../Tool";
import { IProductsRepository } from "../../../repositories/productsRepository/interfaces/IProductsRepository";

/**
 * Busca produtos por um termo (nome, categoria ou descrição).
 */
export class FindProductTool extends Tool {
  private repository: IProductsRepository;

  private constructor(repository: IProductsRepository) {
    super({
      name: "findProduct",
      description:
        "Busca produtos do cardápio por nome, categoria ou palavra-chave (ex.: 'chocolate', 'café', 'pão'). Retorna os produtos que combinam com o termo.",
    });

    this.repository = repository;

    this.addParameter({
      name: "term",
      type: "string",
      description: "Termo de busca (nome, categoria ou palavra-chave)",
      required: true,
    });
  }

  public static create(repository: IProductsRepository): FindProductTool {
    return new FindProductTool(repository);
  }

  public execute({ term }: { term: string }) {
    const products = this.repository.search(term ?? "");
    return { count: products.length, products };
  }
}
