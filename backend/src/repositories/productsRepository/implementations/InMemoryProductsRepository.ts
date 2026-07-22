import {
  IProductsRepository,
  Product,
} from "../interfaces/IProductsRepository";
import { CATALOG_SEED } from "../../../data/catalog";

export class InMemoryProductsRepository implements IProductsRepository {
  private products: Product[];
  private static instance: InMemoryProductsRepository;

  private constructor() {
    // Clona a semente para que alterações de estoque não mutem o dado original.
    this.products = CATALOG_SEED.map((product) => ({ ...product }));
  }

  public static getInstance(): InMemoryProductsRepository {
    if (!InMemoryProductsRepository.instance) {
      InMemoryProductsRepository.instance = new InMemoryProductsRepository();
    }
    return InMemoryProductsRepository.instance;
  }

  public findAll(): Product[] {
    return this.products.map((product) => ({ ...product }));
  }

  public findAvailable(): Product[] {
    return this.products
      .filter((product) => product.stock > 0)
      .map((product) => ({ ...product }));
  }

  public findById(id: string): Product | undefined {
    const product = this.products.find(
      (p) => p.id.toLowerCase() === id.trim().toLowerCase(),
    );
    return product ? { ...product } : undefined;
  }

  public search(term: string): Product[] {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return this.findAll();

    return this.products
      .filter((product) =>
        [product.name, product.category, product.description]
          .join(" ")
          .toLowerCase()
          .includes(normalized),
      )
      .map((product) => ({ ...product }));
  }

  public decrementStock(id: string, quantity: number): void {
    const product = this.products.find(
      (p) => p.id.toLowerCase() === id.trim().toLowerCase(),
    );

    if (!product) {
      throw new Error(`Produto "${id}" não encontrado.`);
    }
    if (product.stock < quantity) {
      throw new Error(
        `Estoque insuficiente para "${product.name}". Disponível: ${product.stock}, solicitado: ${quantity}.`,
      );
    }

    product.stock -= quantity;
  }
}
