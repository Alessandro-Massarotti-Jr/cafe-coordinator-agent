import { CustomError } from "../../errors/CustomError";
import { IProductsRepository } from "../../repositories/ProductsRepository/IProductsRepository";
import { FindProductUseCaseDTO } from "./FindProductUseCaseDTO";

export class FindProductUseCase {
  constructor(private readonly productRepository: IProductsRepository) {}

  public async execute(input: FindProductUseCaseDTO) {
    try {
      const products = await this.productRepository.search(input.term);
      return { count: products.length, products };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError({
        message:
          error instanceof Error
            ? error.message
            : "Error trying to find products.",
        friendlyMessage: "Error trying to find products.",
      });
    }
  }
}
