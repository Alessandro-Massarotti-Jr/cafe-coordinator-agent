import { FindCompanyInfoTool } from "./FindCompanyInfoTool";
import {
  CompanySearchResult,
  ICompanyRepository,
} from "../../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { hashToken } from "../../../services/rag/sparseVectors";

const embedding: IEmbeddingProvider = {
  embed: async () => [0.1, 0.2],
};

function repositoryWith(
  results: CompanySearchResult[],
  calls: Array<Parameters<ICompanyRepository["hybridSearch"]>[0]> = [],
): ICompanyRepository {
  return {
    upsert: async () => {},
    deleteBySource: async () => {},
    hybridSearch: async (params) => {
      calls.push(params);
      return results;
    },
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

  it("retorna similaridade, confiança e metadados do trecho", async () => {
    const tool = FindCompanyInfoTool.create(
      repositoryWith([
        {
          score: 0.03,
          similarity: 0.83,
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
          score: 0.03,
          similarity: 0.2,
          payload: { text: "qualquer coisa", source: "company.txt" },
        },
      ]),
      embedding,
    );

    const result = await tool.execute({ query: "helicóptero" });

    expect(result.data?.[0]?.confidence).toBe("baixa");
    expect(result.userFriendlyMessage).toContain("Não tenho essa informação");
  });

  it("envia o vetor denso e o vetor esparso da pergunta para a busca híbrida", async () => {
    const calls: Array<Parameters<ICompanyRepository["hybridSearch"]>[0]> = [];
    const tool = FindCompanyInfoTool.create(repositoryWith([], calls), embedding);

    await tool.execute({ query: "aceita pix?" });

    expect(calls[0]?.vector).toEqual([0.1, 0.2]);
    expect(calls[0]?.sparseVector.indices).toEqual(
      [hashToken("aceita"), hashToken("pix")].sort((a, b) => a - b),
    );
    expect(calls[0]?.limit).toBe(3);
  });
});
