import { Product } from "../../domain/Product";

export interface IProductsRepository {
  findAll(): Product[];
  findAvailable(): Product[];
  findById(id: string): Product | undefined;
  search(term: string): Product[];
}
