import { Product } from "../../../domain/Product";
import { IProductsRepository } from "../IProductsRepository";

export class MemoryProductsRepository implements IProductsRepository {
  private products: Product[];
  private static instance: MemoryProductsRepository;

  private constructor() {
    this.products = [
      {
        id: "PROD-001",
        name: "Pão Artesanal",
        category: "Pães",
        price: 12.0,
        stock: 30,
        description:
          "Pão de fermentação natural de 12 horas, farinha de trigo integral e sal marinho. Casca crocante e miolo macio. Peso 500g.",
        availability: "Todos os dias a partir das 7h.",
      },
      {
        id: "PROD-002",
        name: "Bolo de Chocolate Belga",
        category: "Bolos",
        price: 85.0,
        stock: 5,
        description:
          "Bolo úmido de chocolate belga 70% cacau, recheado com ganache e coberto com calda de chocolate. Serve de 10 a 12 pessoas. Peso 1,2kg.",
        availability: "Sob encomenda com 24 horas de antecedência.",
      },
      {
        id: "PROD-003",
        name: "Croissant de Manteiga",
        category: "Folhados",
        price: 9.5,
        stock: 50,
        description:
          "Croissant folhado com manteiga francesa AOP, massa laminada com 27 camadas. Crocante por fora e amanteigado por dentro. Peso 90g.",
        availability: "Todos os dias a partir das 6h30, até esgotar o estoque.",
      },
      {
        id: "PROD-004",
        name: "Café Espresso",
        category: "Bebidas",
        price: 6.0,
        stock: 200,
        description:
          "Espresso encorpado feito com blend de grãos arábica torrados na casa. Servido em xícara de 50ml.",
        availability: "Todos os dias durante o horário de funcionamento.",
      },
      {
        id: "PROD-005",
        name: "Cappuccino Cremoso",
        category: "Bebidas",
        price: 11.0,
        stock: 120,
        description:
          "Espresso com leite vaporizado e espuma aveludada, finalizado com canela e chocolate em pó. 200ml.",
        availability: "Todos os dias durante o horário de funcionamento.",
      },
      {
        id: "PROD-006",
        name: "Coxinha de Frango",
        category: "Salgados",
        price: 8.0,
        stock: 0,
        description:
          "Salgado frito de massa de batata com recheio cremoso de frango desfiado e requeijão.",
        availability: "Disponível a partir das 10h (temporariamente esgotado).",
      },
    ];
  }

  public static getInstance(): MemoryProductsRepository {
    if (!MemoryProductsRepository.instance) {
      MemoryProductsRepository.instance = new MemoryProductsRepository();
    }
    return MemoryProductsRepository.instance;
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
}
