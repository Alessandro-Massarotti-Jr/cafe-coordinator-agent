import {
  documentSparseVectors,
  hashToken,
  querySparseVector,
} from "./sparseVectors";

describe("hashToken", () => {
  it("gera sempre o mesmo índice inteiro positivo para o mesmo termo", () => {
    expect(hashToken("pix")).toBe(hashToken("pix"));
    expect(hashToken("pix")).not.toBe(hashToken("pox"));
    expect(hashToken("pix")).toBeGreaterThanOrEqual(0);
    expect(hashToken("pix")).toBeLessThan(2 ** 32);
  });
});

describe("querySparseVector", () => {
  it("usa os termos normalizados da pergunta com peso pela frequência", () => {
    const vector = querySparseVector("Aceita PIX? pix mesmo");

    const weights = new Map(
      vector.indices.map((index, position) => [index, vector.values[position]]),
    );
    expect(weights.get(hashToken("pix"))).toBe(2);
    expect(weights.get(hashToken("aceita"))).toBe(1);
    expect(weights.has(hashToken("mesmo"))).toBe(false);
  });

  it("retorna índices ordenados", () => {
    const { indices } = querySparseVector("wifi tomada senha balcão");
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it("retorna vetor vazio quando só há palavras comuns", () => {
    expect(querySparseVector("você tem?")).toEqual({ indices: [], values: [] });
  });
});

describe("documentSparseVectors", () => {
  it("dá mais peso ao termo repetido e penaliza documentos longos", () => {
    const [short, repeated, long] = documentSparseVectors([
      "pix cartão",
      "pix pix cartão",
      "pix cartão dinheiro vale refeição alimentação cheque débito crédito",
    ]);
    const weightOf = (vector: typeof short) =>
      vector!.values[vector!.indices.indexOf(hashToken("pix"))]!;

    expect(weightOf(repeated)).toBeGreaterThan(weightOf(short));
    expect(weightOf(short)).toBeGreaterThan(weightOf(long));
  });
});
