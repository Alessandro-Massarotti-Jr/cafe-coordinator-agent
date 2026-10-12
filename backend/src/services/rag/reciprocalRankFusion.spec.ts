import { reciprocalRankFusion } from "./reciprocalRankFusion";

describe("reciprocalRankFusion", () => {
  it("prioriza itens bem posicionados nas duas listas", () => {
    const fused = reciprocalRankFusion([
      ["b", "a"],
      ["a", "c", "b"],
    ]);

    expect(fused.map((result) => result.key)).toEqual(["a", "b", "c"]);
  });

  it("inclui itens que aparecem em apenas uma lista", () => {
    const fused = reciprocalRankFusion([["a"], ["b"]]);

    expect(fused.map((result) => result.key).sort()).toEqual(["a", "b"]);
  });

  it("retorna vazio sem rankings", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});
