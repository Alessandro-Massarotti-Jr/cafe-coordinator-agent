import { Product } from "../../domain/Product";

/**
 * Contrato do repositório de produtos consumido pelos usecases. Permite injetar
 * qualquer implementação (memória, banco, etc.) no construtor sem acoplamento.
 */
export interface IProductsRepository {
  findAll(): Product[];
  findAvailable(): Product[];
  findById(id: string): Product | undefined;
  search(term: string): Product[];
}
