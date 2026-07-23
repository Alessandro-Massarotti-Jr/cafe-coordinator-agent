import { parseVerdict } from "./ResponseJudge";

describe("parseVerdict", () => {
  it("lê o JSON do veredito", () => {
    const verdict = parseVerdict(
      '{"approved":true,"score":9,"issues":[],"reason":"cobriu tudo"}',
    );

    expect(verdict).toEqual({
      approved: true,
      score: 9,
      issues: [],
      reason: "cobriu tudo",
    });
  });

  it("extrai o JSON mesmo com texto ao redor", () => {
    const verdict = parseVerdict(
      'Segue: {"approved":false,"score":3,"issues":["faltou o horário"],"reason":"incompleta"} fim',
    );

    expect(verdict.approved).toBe(false);
    expect(verdict.issues).toEqual(["faltou o horário"]);
  });

  it("reprova quando não há JSON", () => {
    expect(parseVerdict("achei boa").approved).toBe(false);
  });

  it("reprova quando o JSON é inválido", () => {
    expect(parseVerdict('{"approved": tru}').approved).toBe(false);
  });
});
