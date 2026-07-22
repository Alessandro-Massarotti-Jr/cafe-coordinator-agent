import { MemoryProductsRepository } from "../../repositories/ProductsRepository/implementations/MemoryProductsRepository";
import { FindProductController } from "./FindProductController";
import { FindProductUseCase } from "./FindProductUseCase";

const productsRepository = MemoryProductsRepository.getInstance();

const findProductUseCase = new FindProductUseCase(productsRepository);
const findProductController = new FindProductController(findProductUseCase);

export { findProductController };
