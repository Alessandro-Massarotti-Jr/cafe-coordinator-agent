import { MemoryProductsRepository } from "./MemoryProductsRepository";

const productsRepository = MemoryProductsRepository.getInstance();

describe("MemoryProductsRepository", () => {
  it("Should always return the same instance", () => {
    expect(MemoryProductsRepository.getInstance()).toBe(productsRepository);
  });

  describe("findAll", () => {
    it("Should return every product of the catalog", () => {
      const products = productsRepository.findAll();

      expect(products).toHaveLength(6);
      expect(products.map((product) => product.id)).toEqual([
        "PROD-001",
        "PROD-002",
        "PROD-003",
        "PROD-004",
        "PROD-005",
        "PROD-006",
      ]);
    });

    it("Should return copies so the caller cannot mutate the catalog", () => {
      const products = productsRepository.findAll();
      products[0]!.name = "mutated";

      expect(productsRepository.findAll()[0]!.name).toBe("Pão Artesanal");
    });
  });

  describe("findAvailable", () => {
    it("Should return only the products with stock", () => {
      const products = productsRepository.findAvailable();

      expect(products).toHaveLength(5);
      expect(products.every((product) => product.stock > 0)).toBe(true);
      expect(products.map((product) => product.id)).not.toContain("PROD-006");
    });

    it("Should return copies so the caller cannot mutate the catalog", () => {
      const products = productsRepository.findAvailable();
      products[0]!.stock = 999;

      expect(productsRepository.findAvailable()[0]!.stock).toBe(30);
    });
  });

  describe("findById", () => {
    it("Should return the product matching the id", () => {
      const product = productsRepository.findById("PROD-002");

      expect(product).toMatchObject({
        id: "PROD-002",
        name: "Bolo de Chocolate Belga",
      });
    });

    it("Should ignore case and surrounding spaces", () => {
      expect(productsRepository.findById("  prod-002  ")).toMatchObject({
        id: "PROD-002",
      });
    });

    it("Should return undefined if the id doesn't exist", () => {
      expect(productsRepository.findById("PROD-999")).toBeUndefined();
    });

    it("Should return a copy so the caller cannot mutate the catalog", () => {
      const product = productsRepository.findById("PROD-002")!;
      product.price = 0;

      expect(productsRepository.findById("PROD-002")!.price).toBe(85.0);
    });
  });

  describe("search", () => {
    it("Should find products by name", () => {
      const products = productsRepository.search("croissant");

      expect(products.map((product) => product.id)).toEqual(["PROD-003"]);
    });

    it("Should find products by category", () => {
      const products = productsRepository.search("Bebidas");

      expect(products.map((product) => product.id)).toEqual([
        "PROD-004",
        "PROD-005",
      ]);
    });

    it("Should find products by a word in the description", () => {
      const products = productsRepository.search("fermentação natural");

      expect(products.map((product) => product.id)).toEqual(["PROD-001"]);
    });

    it("Should ignore case and surrounding spaces", () => {
      expect(
        productsRepository.search("  CROISSANT  ").map((p) => p.id),
      ).toEqual(["PROD-003"]);
    });

    it("Should return every product if the term is empty", () => {
      expect(productsRepository.search("   ")).toHaveLength(6);
    });

    it("Should return an empty list if nothing matches the term", () => {
      expect(productsRepository.search("sushi")).toEqual([]);
    });

    it("Should return copies so the caller cannot mutate the catalog", () => {
      const products = productsRepository.search("croissant");
      products[0]!.name = "mutated";

      expect(productsRepository.search("croissant")[0]!.name).toBe(
        "Croissant de Manteiga",
      );
    });
  });
});
