import { CustomError } from "../../errors/CustomError";
import { FindProductController } from "./FindProductController";
import { FindProductUseCase } from "./FindProductUseCase";

const findProductUseCase = {
  execute: jest.fn().mockResolvedValue({ count: 0, products: [] }),
} as unknown as jest.Mocked<FindProductUseCase>;

const findProductController = new FindProductController(findProductUseCase);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("FindProductController", () => {
  it("Should return a success response with the products found", async () => {
    const products = [{ id: "PROD-001" }];
    findProductUseCase.execute = jest
      .fn()
      .mockResolvedValue({ count: 1, products });

    const response = await findProductController.handle({ term: "test" });

    expect(findProductUseCase.execute).toHaveBeenCalledTimes(1);
    expect(findProductUseCase.execute).toHaveBeenNthCalledWith(1, {
      term: "test",
    });
    expect(response).toEqual({
      data: { count: 1, products },
      isError: false,
      message: "1 product(s) found.",
      userFriendlyMessage: "Here is our menu.",
    });
  });

  it("Should return a success response with an empty message when nothing is found", async () => {
    findProductUseCase.execute = jest
      .fn()
      .mockResolvedValue({ count: 0, products: [] });

    const response = await findProductController.handle({ term: "test" });

    expect(response).toEqual({
      data: { count: 0, products: [] },
      isError: false,
      message: "0 product(s) found.",
      userFriendlyMessage:
        "We currently have no products available for that condition.",
    });
  });

  it("Should trim the term before calling the usecase", async () => {
    await findProductController.handle({ term: "   test   " });

    expect(findProductUseCase.execute).toHaveBeenNthCalledWith(1, {
      term: "test",
    });
  });

  it("Should return a validation error response if the term is empty", async () => {
    const response = await findProductController.handle({ term: "   " });

    expect(findProductUseCase.execute).not.toHaveBeenCalled();
    expect(response).toEqual({
      isError: true,
      errorCategory: "validation",
      isRetryable: false,
      message: "Validation error occurred on field: term.",
      userFriendlyMessage:
        "There was a validation error. Please check your input and try again.",
    });
  });

  it("Should return a validation error response if the term is not provided", async () => {
    const response = await findProductController.handle({} as { term: string });

    expect(findProductUseCase.execute).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      isError: true,
      errorCategory: "validation",
    });
  });

  it("Should return the tool response of a CustomError thrown by the usecase", async () => {
    findProductUseCase.execute = jest.fn().mockRejectedValue(
      new CustomError({
        message: "not found",
        friendlyMessage: "I couldn't find it.",
        kind: "business",
      }),
    );

    const response = await findProductController.handle({ term: "test" });

    expect(response).toEqual({
      isError: true,
      errorCategory: "business",
      isRetryable: false,
      message: "not found",
      userFriendlyMessage: "I couldn't find it.",
    });
  });

  it("Should return a generic error response if the usecase throws a generic Error", async () => {
    findProductUseCase.execute = jest
      .fn()
      .mockRejectedValue(new Error("unexpected failure"));

    const response = await findProductController.handle({ term: "test" });

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "unexpected failure",
      userFriendlyMessage: "Error searching for products in the catalog.",
    });
  });

  it("Should return a generic error response if the thrown value is not an Error", async () => {
    findProductUseCase.execute = jest.fn().mockRejectedValue("string failure");

    const response = await findProductController.handle({ term: "test" });

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "Error searching for products in the catalog.",
      userFriendlyMessage: "Error searching for products in the catalog.",
    });
  });
});
