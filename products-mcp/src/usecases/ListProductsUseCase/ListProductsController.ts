import { ToolResponse } from "../../domain/ToolResponse";
import { CustomError } from "../../errors/CustomError";
import { ListProductsUseCase } from "./ListProductsUseCase";
import { ListProductsUseCaseDTO } from "./ListProductsUseCaseDTO";

export class ListProductsController {
  constructor(private readonly listProductsUseCase: ListProductsUseCase) {}

  public async handle(input: ListProductsUseCaseDTO) {
    try {
      const data = await this.listProductsUseCase.execute(input);

      const response: ToolResponse = {
        data: data,
        isError: false,
        message: `${data.count} product(s) found.`,
        userFriendlyMessage:
          data.count > 0
            ? "Here is our menu."
            : "We currently have no products available for that condition.",
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
            : "Error listing products from the catalog.",
        friendlyMessage: "Error listing products from the catalog.",
      }).toToolResponse();
    }
  }
}
