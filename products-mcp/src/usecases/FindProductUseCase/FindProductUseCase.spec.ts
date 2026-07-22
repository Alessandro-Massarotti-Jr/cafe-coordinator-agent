import { CustomError } from "../../errors/CustomError";
import { IProductsRepository } from "../../repositories/ProductsRepository/IProductsRepository";
import { FindProductUseCase } from "./FindProductUseCase";

const productsRepository: jest.Mocked<IProductsRepository> = {
  findAll: jest.fn().mockReturnValue([]),
  findAvailable: jest.fn().mockReturnValue([]),
  findById: jest.fn().mockReturnValue(undefined),
  search: jest.fn().mockReturnValue([]),
};

const findProductUseCase = new FindProductUseCase(productsRepository);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("FindProductUseCase", () => {
  it("Should return the products found by the repository", async () => {
    productsRepository.search = jest.fn().mockReturnValue([{ id: "PROD-001" }]);

    const result = await findProductUseCase.execute({ term: "test" });

    expect(productsRepository.search).toHaveBeenCalledTimes(1);
    expect(productsRepository.search).toHaveBeenNthCalledWith(1, "test");
    expect(result).toEqual({ count: 1, products: [{ id: "PROD-001" }] });
  });

  it("Should return an empty list if repository didn't find anything", async () => {
    productsRepository.search = jest.fn().mockReturnValue([]);

    const result = await findProductUseCase.execute({ term: "test" });

    expect(productsRepository.search).toHaveBeenCalledTimes(1);
    expect(productsRepository.search).toHaveBeenNthCalledWith(1, "test");
    expect(result).toEqual({ count: 0, products: [] });
  });

  it("Should rethrow the same CustomError if the repository throws a CustomError", async () => {
    const customError = new CustomError({
      message: "repository is down",
      code: "REPOSITORY_ERROR",
    });
    productsRepository.search = jest.fn().mockImplementation(() => {
      throw customError;
    });

    await expect(findProductUseCase.execute({ term: "test" })).rejects.toBe(
      customError,
    );
    expect(productsRepository.search).toHaveBeenCalledTimes(1);
  });

  it("Should throw a CustomError if the repository throws a generic Error", async () => {
    productsRepository.search = jest.fn().mockImplementation(() => {
      throw new Error("unexpected failure");
    });

    const promise = findProductUseCase.execute({ term: "test" });

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: "unexpected failure",
    });
  });

  it("Should throw a CustomError with a default message if the thrown value is not an Error", async () => {
    productsRepository.search = jest.fn().mockImplementation(() => {
      throw "string failure";
    });

    const promise = findProductUseCase.execute({ term: "test" });

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: "Error trying to find products.",
    });
  });
});
