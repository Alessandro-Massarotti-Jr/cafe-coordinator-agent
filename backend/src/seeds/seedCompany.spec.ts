import { chunkCompanyDocument, splitSentences } from "./seedCompany";

const DOC = [
  "Informações da Empresa",
  "",
  "Nome: Cafeteria Teste",
  "CNPJ: 00.000.000/0001-00",
  "",
  "Wi-Fi: rede gratuita e ilimitada para clientes. A senha fica no balcão. Há tomadas no mezanino.",
  "",
  "Pets: aceitamos animais apenas no terraço externo. Cães-guia são bem-vindos em todas as áreas.",
  "",
  "Realizamos entregas em toda a cidade.",
  "",
  `História: ${"Uma frase longa sobre a torrefação da casa. ".repeat(20)}`,
].join("\n");

describe("chunkCompanyDocument", () => {
  const chunks = chunkCompanyDocument(DOC);

  it("ignora o título do documento e o usa como seção", () => {
    expect(chunks.some((chunk) => chunk.text === "Informações da Empresa")).toBe(false);
    for (const chunk of chunks) {
      expect(chunk.section).toBe("Informações da Empresa");
    }
  });

  it("gera um trecho por assunto", () => {
    expect(chunks.find((chunk) => chunk.title === "Wi-Fi")?.text).toBe(
      "Wi-Fi: rede gratuita e ilimitada para clientes. A senha fica no balcão. Há tomadas no mezanino.",
    );
    expect(chunks.find((chunk) => chunk.title === "Pets")?.text).toContain(
      "Cães-guia",
    );
  });

  it("mantém blocos de várias linhas inteiros", () => {
    const block = chunks.find((chunk) => chunk.title === "Nome");
    expect(block?.text).toBe("Nome: Cafeteria Teste\nCNPJ: 00.000.000/0001-00");
  });

  it("usa a seção como título quando o parágrafo não tem rótulo", () => {
    const delivery = chunks.find((chunk) => chunk.text.startsWith("Realizamos"));
    expect(delivery?.title).toBe("Informações da Empresa");
  });

  it("divide parágrafos longos sem cortar frases e repete o rótulo", () => {
    const history = chunks.filter((chunk) => chunk.title === "História");
    expect(history.length).toBeGreaterThan(1);
    for (const chunk of history) {
      expect(chunk.text.startsWith("História: ")).toBe(true);
      expect(chunk.text).toMatch(/\.$/);
      expect(chunk.text.length).toBeLessThanOrEqual(300 + "História: ".length);
    }
  });

  it("indexa índices sequenciais", () => {
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
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
