import { CustomError } from "../../errors/CustomError";
import { GetProductDetailsController } from "./GetProductDetailsController";
import { GetProductDetailsUseCase } from "./GetProductDetailsUseCase";

const getProductDetailsUseCase = {
  execute: jest
    .fn()
    .mockResolvedValue({ product: { id: "PROD-001", name: "Pão Artesanal" } }),
} as unknown as jest.Mocked<GetProductDetailsUseCase>;

const getProductDetailsController = new GetProductDetailsController(
  getProductDetailsUseCase,
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GetProductDetailsController", () => {
  it("Should return a success response with the product details", async () => {
    const product = { id: "PROD-001", name: "Pão Artesanal" };
    getProductDetailsUseCase.execute = jest.fn().mockResolvedValue({ product });

    const response = await getProductDetailsController.handle({
      productId: "PROD-001",
    });

    expect(getProductDetailsUseCase.execute).toHaveBeenCalledTimes(1);
    expect(getProductDetailsUseCase.execute).toHaveBeenNthCalledWith(1, {
      productId: "PROD-001",
    });
    expect(response).toEqual({
      data: { product },
      isError: false,
      message: 'Details for product "PROD-001".',
      userFriendlyMessage: "Here are the details for Pão Artesanal.",
    });
  });

  it("Should trim the productId before calling the usecase", async () => {
    await getProductDetailsController.handle({ productId: "  PROD-001  " });

    expect(getProductDetailsUseCase.execute).toHaveBeenNthCalledWith(1, {
      productId: "PROD-001",
    });
  });

  it("Should return a validation error response if the productId is empty", async () => {
    const response = await getProductDetailsController.handle({
      productId: "   ",
    });

    expect(getProductDetailsUseCase.execute).not.toHaveBeenCalled();
    expect(response).toEqual({
      isError: true,
      errorCategory: "validation",
      isRetryable: false,
      message: "Validation error occurred on field: productId.",
      userFriendlyMessage:
        "There was a validation error. Please check your input and try again.",
    });
  });

  it("Should return a validation error response if the productId is not provided", async () => {
    const response = await getProductDetailsController.handle(
      {} as { productId: string },
    );

    expect(getProductDetailsUseCase.execute).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      isError: true,
      errorCategory: "validation",
    });
  });

  it("Should return the tool response of a CustomError thrown by the usecase", async () => {
    getProductDetailsUseCase.execute = jest.fn().mockRejectedValue(
      new CustomError({
        message: 'Product "PROD-999" not found.',
        friendlyMessage: "I couldn't find that product.",
        kind: "business",
        name: "NotFoundError",
      }),
    );

    const response = await getProductDetailsController.handle({
      productId: "PROD-999",
    });

    expect(response).toEqual({
      isError: true,
      errorCategory: "business",
      isRetryable: false,
      message: 'Product "PROD-999" not found.',
      userFriendlyMessage: "I couldn't find that product.",
    });
  });

  it("Should return a generic error response if the usecase throws a generic Error", async () => {
    getProductDetailsUseCase.execute = jest
      .fn()
      .mockRejectedValue(new Error("unexpected failure"));

    const response = await getProductDetailsController.handle({
      productId: "PROD-001",
    });

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "unexpected failure",
      userFriendlyMessage: "Error getting product details from the catalog.",
    });
  });

  it("Should return a generic error response if the thrown value is not an Error", async () => {
    getProductDetailsUseCase.execute = jest
      .fn()
      .mockRejectedValue("string failure");

    const response = await getProductDetailsController.handle({
      productId: "PROD-001",
    });

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "Error getting product details from the catalog.",
      userFriendlyMessage: "Error getting product details from the catalog.",
    });
  });
});
