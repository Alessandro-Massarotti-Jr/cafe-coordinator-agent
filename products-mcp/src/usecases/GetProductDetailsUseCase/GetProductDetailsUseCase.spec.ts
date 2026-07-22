import { CustomError } from "../../errors/CustomError";
import { IProductsRepository } from "../../repositories/ProductsRepository/IProductsRepository";
import { GetProductDetailsUseCase } from "./GetProductDetailsUseCase";

const productsRepository: jest.Mocked<IProductsRepository> = {
  findAll: jest.fn().mockReturnValue([]),
  findAvailable: jest.fn().mockReturnValue([]),
  findById: jest.fn().mockReturnValue(undefined),
  search: jest.fn().mockReturnValue([]),
};

const getProductDetailsUseCase = new GetProductDetailsUseCase(
  productsRepository,
);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GetProductDetailsUseCase", () => {
  it("Should return the product found by the repository", async () => {
    const product = { id: "PROD-001", name: "Focaccia Italiana" };
    productsRepository.findById = jest.fn().mockReturnValue(product);

    const result = await getProductDetailsUseCase.execute({
      productId: "PROD-001",
    });

    expect(productsRepository.findById).toHaveBeenCalledTimes(1);
    expect(productsRepository.findById).toHaveBeenNthCalledWith(1, "PROD-001");
    expect(result).toEqual({ product });
  });

  it("Should throw a business CustomError if the product is not found", async () => {
    productsRepository.findById = jest.fn().mockReturnValue(undefined);

    const promise = getProductDetailsUseCase.execute({
      productId: "PROD-999",
    });

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      name: "NotFoundError",
      message: 'Product "PROD-999" not found.',
    });
  });

  it("Should rethrow the same CustomError if the repository throws a CustomError", async () => {
    const customError = new CustomError({ message: "repository is down" });
    productsRepository.findById = jest.fn().mockImplementation(() => {
      throw customError;
    });

    await expect(
      getProductDetailsUseCase.execute({ productId: "PROD-001" }),
    ).rejects.toBe(customError);
  });

  it("Should throw a CustomError if the repository throws a generic Error", async () => {
    productsRepository.findById = jest.fn().mockImplementation(() => {
      throw new Error("unexpected failure");
    });

    const promise = getProductDetailsUseCase.execute({
      productId: "PROD-001",
    });

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: "unexpected failure",
    });
  });

  it("Should throw a CustomError with a default message if the thrown value is not an Error", async () => {
    productsRepository.findById = jest.fn().mockImplementation(() => {
      throw "string failure";
    });

    const promise = getProductDetailsUseCase.execute({
      productId: "PROD-001",
    });

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: "Error trying to get product details.",
    });
  });
});
