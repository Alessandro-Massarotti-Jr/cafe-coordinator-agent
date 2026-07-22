import { ToolResponse } from "../../domain/ToolResponse";
import { CustomError } from "../../errors/CustomError";
import { ValidationError } from "../../errors/ValidationError";
import { GetProductDetailsUseCase } from "./GetProductDetailsUseCase";
import { GetProductDetailsUseCaseDTO } from "./GetProductDetailsUseCaseDTO";

export class GetProductDetailsController {
  constructor(
    private readonly getProductDetailsUseCase: GetProductDetailsUseCase,
  ) {}

  public async handle(input: GetProductDetailsUseCaseDTO) {
    try {
      const productId = (input.productId ?? "").trim();

      if (!productId) {
        throw new ValidationError({
          fields: ["productId"],
        });
      }

      const data = await this.getProductDetailsUseCase.execute({ productId });

      const response: ToolResponse = {
        data: data,
        isError: false,
        message: `Details for product "${data.product.id}".`,
        userFriendlyMessage: `Here are the details for ${data.product.name}.`,
      };

      return response;
    } catch (error) {
      if (error instanceof CustomError) {
        return error.toToolResponse();
      }

      return new CustomError({
        message:
          error instanceof Error
            ? error.message
            : "Error getting product details from the catalog.",
        friendlyMessage: "Error getting product details from the catalog.",
      }).toToolResponse();
    }
  }
}
