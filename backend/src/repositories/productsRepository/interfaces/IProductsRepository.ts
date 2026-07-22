export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  availability: string;
};

/**
 * Repositório em memória do catálogo de produtos.
 * Usado pelos agentes de Produtos, Pedidos e Recomendação.
 */
export interface IProductsRepository {
  /** Todos os produtos cadastrados, independentemente do estoque. */
  findAll(): Product[];

  /** Apenas produtos com estoque disponível (> 0). */
  findAvailable(): Product[];

  /** Busca um produto pelo seu código (ex.: "PROD-001"). Case-insensitive. */
  findById(id: string): Product | undefined;

  /** Busca produtos por termo no nome, categoria ou descrição. */
  search(term: string): Product[];

  /** Reduz o estoque de um produto. Lança erro se não houver estoque suficiente. */
  decrementStock(id: string, quantity: number): void;
}
