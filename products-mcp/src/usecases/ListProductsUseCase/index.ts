import { MemoryProductsRepository } from "../../repositories/ProductsRepository/implementations/MemoryProductsRepository";
import { ListProductsController } from "./ListProductsController";
import { ListProductsUseCase } from "./ListProductsUseCase";

const productsRepository = MemoryProductsRepository.getInstance();

const listProductsUseCase = new ListProductsUseCase(productsRepository);
const listProductsController = new ListProductsController(
  listProductsUseCase,
);

export { listProductsController };
