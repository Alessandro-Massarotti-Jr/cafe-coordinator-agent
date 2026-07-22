import { CustomError } from "../../errors/CustomError";
import { ListProductsController } from "./ListProductsController";
import { ListProductsUseCase } from "./ListProductsUseCase";

const listProductsUseCase = {
  execute: jest.fn().mockResolvedValue({ count: 0, products: [] }),
} as unknown as jest.Mocked<ListProductsUseCase>;

const listProductsController = new ListProductsController(listProductsUseCase);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ListProductsController", () => {
  it("Should return a success response with the listed products", async () => {
    const products = [{ id: "PROD-001" }];
    listProductsUseCase.execute = jest
      .fn()
      .mockResolvedValue({ count: 1, products });

    const response = await listProductsController.handle({});

    expect(listProductsUseCase.execute).toHaveBeenCalledTimes(1);
    expect(listProductsUseCase.execute).toHaveBeenNthCalledWith(1, {});
    expect(response).toEqual({
      data: { count: 1, products },
      isError: false,
      message: "1 product(s) found.",
      userFriendlyMessage: "Here is our menu.",
    });
  });

  it("Should forward the includeUnavailable flag to the usecase", async () => {
    await listProductsController.handle({ includeUnavailable: true });

    expect(listProductsUseCase.execute).toHaveBeenNthCalledWith(1, {
      includeUnavailable: true,
    });
  });

  it("Should return a success response with an empty message when nothing is found", async () => {
    listProductsUseCase.execute = jest
      .fn()
      .mockResolvedValue({ count: 0, products: [] });

    const response = await listProductsController.handle({});

    expect(response).toEqual({
      data: { count: 0, products: [] },
      isError: false,
      message: "0 product(s) found.",
      userFriendlyMessage:
        "We currently have no products available for that condition.",
    });
  });

  it("Should return the tool response of a CustomError thrown by the usecase", async () => {
    listProductsUseCase.execute = jest.fn().mockRejectedValue(
      new CustomError({
        message: "catalog is down",
        friendlyMessage: "Try again in a moment.",
        kind: "transient",
      }),
    );

    const response = await listProductsController.handle({});

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "catalog is down",
      userFriendlyMessage: "Try again in a moment.",
    });
  });

  it("Should return a generic error response if the usecase throws a generic Error", async () => {
    listProductsUseCase.execute = jest
      .fn()
      .mockRejectedValue(new Error("unexpected failure"));

    const response = await listProductsController.handle({});

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "unexpected failure",
      userFriendlyMessage: "Error listing products from the catalog.",
    });
  });

  it("Should return a generic error response if the thrown value is not an Error", async () => {
    listProductsUseCase.execute = jest.fn().mockRejectedValue("string failure");

    const response = await listProductsController.handle({});

    expect(response).toEqual({
      isError: true,
      errorCategory: "transient",
      isRetryable: true,
      message: "Error listing products from the catalog.",
      userFriendlyMessage: "Error listing products from the catalog.",
    });
  });
});
