import { MemoryProductsRepository } from "../../repositories/ProductsRepository/implementations/MemoryProductsRepository";
import { GetProductDetailsController } from "./GetProductDetailsController";
import { GetProductDetailsUseCase } from "./GetProductDetailsUseCase";

const productsRepository = MemoryProductsRepository.getInstance();

const getProductDetailsUseCase = new GetProductDetailsUseCase(
  productsRepository,
);
const getProductDetailsController = new GetProductDetailsController(
  getProductDetailsUseCase,
);

export { getProductDetailsController };
