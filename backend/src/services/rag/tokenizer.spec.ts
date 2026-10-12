import { normalizeText, tokenize } from "./tokenizer";

describe("normalizeText", () => {
  it("remove acentos e deixa minúsculo", () => {
    expect(normalizeText("Cafés Especiais à Vontade")).toBe("cafes especiais a vontade");
  });
});

describe("tokenize", () => {
  it("remove palavras comuns e pontuação", () => {
    expect(tokenize("Vocês aceitam PIX no balcão?")).toEqual([
      "aceitam",
      "pix",
      "balcao",
    ]);
  });
});
