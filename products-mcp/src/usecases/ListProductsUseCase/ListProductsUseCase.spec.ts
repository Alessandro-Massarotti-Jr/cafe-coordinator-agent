import { CustomError } from "../../errors/CustomError";
import { IProductsRepository } from "../../repositories/ProductsRepository/IProductsRepository";
import { ListProductsUseCase } from "./ListProductsUseCase";

const productsRepository: jest.Mocked<IProductsRepository> = {
  findAll: jest.fn().mockReturnValue([]),
  findAvailable: jest.fn().mockReturnValue([]),
  findById: jest.fn().mockReturnValue(undefined),
  search: jest.fn().mockReturnValue([]),
};

const listProductsUseCase = new ListProductsUseCase(productsRepository);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ListProductsUseCase", () => {
  it("Should return only the available products by default", async () => {
    productsRepository.findAvailable = jest
      .fn()
      .mockReturnValue([{ id: "PROD-001" }]);

    const result = await listProductsUseCase.execute({});

    expect(productsRepository.findAvailable).toHaveBeenCalledTimes(1);
    expect(productsRepository.findAll).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 1, products: [{ id: "PROD-001" }] });
  });

  it("Should return only the available products when includeUnavailable is false", async () => {
    productsRepository.findAvailable = jest
      .fn()
      .mockReturnValue([{ id: "PROD-001" }]);

    const result = await listProductsUseCase.execute({
      includeUnavailable: false,
    });

    expect(productsRepository.findAvailable).toHaveBeenCalledTimes(1);
    expect(productsRepository.findAll).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 1, products: [{ id: "PROD-001" }] });
  });

  it("Should return every product when includeUnavailable is true", async () => {
    productsRepository.findAll = jest
      .fn()
      .mockReturnValue([{ id: "PROD-001" }, { id: "PROD-006" }]);

    const result = await listProductsUseCase.execute({
      includeUnavailable: true,
    });

    expect(productsRepository.findAll).toHaveBeenCalledTimes(1);
    expect(productsRepository.findAvailable).not.toHaveBeenCalled();
    expect(result).toEqual({
      count: 2,
      products: [{ id: "PROD-001" }, { id: "PROD-006" }],
    });
  });

  it("Should return an empty list if the repository didn't find anything", async () => {
    productsRepository.findAvailable = jest.fn().mockReturnValue([]);

    const result = await listProductsUseCase.execute({});

    expect(result).toEqual({ count: 0, products: [] });
  });

  it("Should rethrow the same CustomError if the repository throws a CustomError", async () => {
    const customError = new CustomError({ message: "repository is down" });
    productsRepository.findAvailable = jest.fn().mockImplementation(() => {
      throw customError;
    });

    await expect(listProductsUseCase.execute({})).rejects.toBe(customError);
  });

  it("Should throw a CustomError if the repository throws a generic Error", async () => {
    productsRepository.findAvailable = jest.fn().mockImplementation(() => {
      throw new Error("unexpected failure");
    });

    const promise = listProductsUseCase.execute({});

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: "unexpected failure",
    });
  });

  it("Should throw a CustomError with a default message if the thrown value is not an Error", async () => {
    productsRepository.findAvailable = jest.fn().mockImplementation(() => {
      throw "string failure";
    });

    const promise = listProductsUseCase.execute({});

    await expect(promise).rejects.toBeInstanceOf(CustomError);
    await expect(promise).rejects.toMatchObject({
      message: "Error trying to list products.",
    });
  });
});
