import { Product } from "../../../domain/Product";
import { IProductsRepository } from "../IProductsRepository";

export class MemoryProductsRepository implements IProductsRepository {
  private products: Product[];
  private static instance: MemoryProductsRepository;

  private constructor() {
    this.products = [
      {
        id: "PROD-001",
        name: "Focaccia Italiana",
        category: "Panificação",
        price: 12.0,
        stock: 30,
        description:
          "Focaccia de fermentação natural de 12 horas, azeite extravirgem italiano, alecrim e sal grosso. Crocante por fora e aerada por dentro. Peso 200g.",
        availability: "Todos os dias a partir das 8h.",
      },
      {
        id: "PROD-002",
        name: "Torta Tiramisù",
        category: "Doces",
        price: 85.0,
        stock: 5,
        description:
          "Tiramisù tradicional montado em camadas de biscoito savoiardi embebido em espresso da casa, creme de mascarpone e cacau em pó. Serve de 10 a 12 pessoas. Peso 1,2kg.",
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
        availability: "Todos os dias a partir das 7h, até esgotar o estoque.",
      },
      {
        id: "PROD-004",
        name: "Café Espresso",
        category: "Bebidas",
        price: 6.0,
        stock: 200,
        description:
          "Espresso encorpado feito com blend italiano de grãos 100% arábica torrados na nossa própria torrefação. Servido em xícara de 50ml.",
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
        name: "Panini Caprese",
        category: "Salgados",
        price: 24.0,
        stock: 0,
        description:
          "Panini prensado na chapa com mussarela de búfala, tomate italiano, manjericão fresco e azeite extravirgem, no pão ciabatta.",
        availability: "Disponível a partir das 11h (temporariamente esgotado).",
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
