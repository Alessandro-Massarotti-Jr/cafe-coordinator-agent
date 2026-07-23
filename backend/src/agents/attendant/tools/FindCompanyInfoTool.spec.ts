import { FindCompanyInfoTool } from "./FindCompanyInfoTool";
import {
  CompanySearchResult,
  ICompanyRepository,
} from "../../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";

const embedding: IEmbeddingProvider = {
  embed: async () => [0.1, 0.2],
};

function repositoryWith(results: CompanySearchResult[]): ICompanyRepository {
  return {
    upsert: async () => {},
    deleteBySource: async () => {},
    search: async () => results,
  };
}

describe("FindCompanyInfoTool", () => {
  it("busca vazia é sucesso com data vazia", async () => {
    const tool = FindCompanyInfoTool.create(repositoryWith([]), embedding);

    const result = await tool.execute({ query: "sala de cinema" });

    expect(result.isError).toBe(false);
    expect(result.data).toEqual([]);
    expect(result.userFriendlyMessage).toContain("Não tenho essa informação");
  });

  it("retorna score, confiança e metadados do trecho", async () => {
    const tool = FindCompanyInfoTool.create(
      repositoryWith([
        {
          score: 0.83,
          payload: {
            text: "Wi-Fi: rede gratuita",
            source: "company.txt",
            section: "Informações da Empresa",
            title: "Wi-Fi",
          },
        },
      ]),
      embedding,
    );

    const result = await tool.execute({ query: "tem wifi?" });

    expect(result.data?.[0]).toMatchObject({
      score: 0.83,
      confidence: "alta",
      title: "Wi-Fi",
      section: "Informações da Empresa",
    });
  });

  it("marca confiança baixa quando a similaridade é fraca", async () => {
    const tool = FindCompanyInfoTool.create(
      repositoryWith([
        {
          score: 0.2,
          payload: { text: "qualquer coisa", source: "company.txt" },
        },
      ]),
      embedding,
    );

    const result = await tool.execute({ query: "helicóptero" });

    expect(result.data?.[0]?.confidence).toBe("baixa");
    expect(result.userFriendlyMessage).toContain("Não tenho essa informação");
  });
});
