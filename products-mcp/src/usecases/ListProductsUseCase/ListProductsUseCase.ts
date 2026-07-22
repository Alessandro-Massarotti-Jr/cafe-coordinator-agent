import { CustomError } from "../../errors/CustomError";
import { IProductsRepository } from "../../repositories/ProductsRepository/IProductsRepository";
import { ListProductsUseCaseDTO } from "./ListProductsUseCaseDTO";

export class ListProductsUseCase {
  constructor(private readonly repository: IProductsRepository) {}

  public async execute(input: ListProductsUseCaseDTO) {
    try {
      const products = input.includeUnavailable
        ? this.repository.findAll()
        : this.repository.findAvailable();

      return { count: products.length, products };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError({
        message:
          error instanceof Error
            ? error.message
            : "Error trying to list products.",
        friendlyMessage: "Error trying to list products.",
      });
    }
  }
}
