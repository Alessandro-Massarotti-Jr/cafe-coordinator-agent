import { chunkCompanyDocument, deriveTitle, splitSentences } from "./seedCompany";

const DOC = [
  "Informações da Empresa",
  "",
  "Wi-Fi: rede gratuita e ilimitada para clientes. A senha fica no balcão. Há tomadas no mezanino.",
  "",
  "Pets: aceitamos animais apenas no terraço externo. Cães-guia são bem-vindos em todas as áreas.",
  "",
  `História: ${"Uma frase longa sobre a torrefação da casa. ".repeat(40)}`,
].join("\n");

describe("chunkCompanyDocument", () => {
  const chunks = chunkCompanyDocument(DOC);

  it("gera ao menos um chunk", () => {
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("nunca começa nem termina no meio de uma palavra", () => {
    for (const chunk of chunks) {
      const body = chunk.text.split("\n\n").slice(1).join("\n\n");
      expect(body).toMatch(/^\S/);
      expect(body.trim()).toMatch(/[.!?:)"\d]$/);
    }
  });

  it("não corta frases ao meio dentro do corpo", () => {
    for (const chunk of chunks) {
      const body = chunk.text.split("\n\n").slice(1).join("\n\n").trim();
      const lastSentence = splitSentences(body).at(-1) ?? "";
      expect(lastSentence.length).toBeGreaterThan(0);
    }
  });

  it("enriquece o payload com seção e título", () => {
    for (const chunk of chunks) {
      expect(chunk.section).toBe("Informações da Empresa");
      expect(chunk.title.length).toBeGreaterThan(0);
    }
  });

  it("indexa índices sequenciais", () => {
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
  });
});

describe("deriveTitle", () => {
  it("usa o rótulo do início do trecho", () => {
    expect(deriveTitle("Pets: aceitamos animais.", "Geral")).toBe("Pets");
  });

  it("cai no fallback quando não há rótulo", () => {
    expect(deriveTitle("Aceitamos animais.", "Geral")).toBe("Geral");
  });
});

describe("splitSentences", () => {
  it("separa por pontuação final", () => {
    expect(splitSentences("Uma. Duas! Três?")).toEqual([
      "Uma.",
      "Duas!",
      "Três?",
    ]);
  });
});
