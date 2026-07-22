import { ToolResponse } from "../../domain/ToolResponse";
import { CustomError } from "../../errors/CustomError";
import { ValidationError } from "../../errors/ValidationError";
import { FindProductUseCase } from "./FindProductUseCase";
import { FindProductUseCaseDTO } from "./FindProductUseCaseDTO";

export class FindProductController {
  constructor(private readonly findProductUseCase: FindProductUseCase) {}

  public async handle(input: FindProductUseCaseDTO) {
    try {
      const term = (input.term ?? "").trim();

      if (!term) {
        throw new ValidationError({
          fields: ["term"],
        });
      }

      const data = await this.findProductUseCase.execute({ term });

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
            : "Error searching for products in the catalog.",
        friendlyMessage: "Error searching for products in the catalog.",
      }).toToolResponse();
    }
  }
}
