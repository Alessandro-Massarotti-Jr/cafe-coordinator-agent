import { Bm25Index } from "./bm25";

describe("Bm25Index", () => {
  const index = new Bm25Index([
    "Pets: aceitamos animais no terraço.",
    "Pagamento: dinheiro, PIX e cartão.",
    "Wi-Fi: rede gratuita para clientes.",
  ]);

  it("ordena pelo documento que contém os termos da busca", () => {
    expect(index.search("aceita pix?")[0]?.index).toBe(1);
  });

  it("ignora diferença de acentos", () => {
    expect(index.search("terraco")[0]?.index).toBe(0);
  });

  it("não retorna documentos sem nenhum termo em comum", () => {
    expect(index.search("helicóptero")).toEqual([]);
  });
});
