import { CustomError } from "../../errors/CustomError";
import { IProductsRepository } from "../../repositories/ProductsRepository/IProductsRepository";
import { GetProductDetailsUseCaseDTO } from "./GetProductDetailsUseCaseDTO";

export class GetProductDetailsUseCase {
  constructor(private readonly repository: IProductsRepository) {}

  public async execute(input: GetProductDetailsUseCaseDTO) {
    try {
      const product = this.repository.findById(input.productId);

      if (!product) {
        throw new CustomError({
          message: `Product "${input.productId}" not found.`,
          friendlyMessage: `I couldn't find the product "${input.productId}" in our catalog. Would you like me to list the available options?`,
          code: "NOT_FOUND",
          kind: "business",
          severity: "medium",
          httpStatusCode: 404,
          name: "NotFoundError",
        });
      }

      return { product };
    } catch (error) {
      if (error instanceof CustomError) {
        throw error;
      }

      throw new CustomError({
        message:
          error instanceof Error
            ? error.message
            : "Error trying to get product details.",
        friendlyMessage: "Error trying to get product details.",
      });
    }
  }
}
