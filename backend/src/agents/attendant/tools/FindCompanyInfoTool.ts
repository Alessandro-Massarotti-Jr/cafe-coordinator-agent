import { Tool } from "../../Tool";
import { ToolResponse, toolSuccess } from "../../ToolResponse";
import { ICompanyRepository } from "../../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";

export class FindCompanyInfoTool extends Tool {
  private repository: ICompanyRepository;
  private embedding: IEmbeddingProvider;

  private constructor(
    repository: ICompanyRepository,
    embedding: IEmbeddingProvider,
  ) {
    super({
      name: "findCompanyInfo",
      description:
        "Busca informações gerais sobre a cafeteria: endereço e localização, horário de funcionamento, se aceita animais/pets, se tem wifi, formas de pagamento, estacionamento, acessibilidade, programa de fidelidade, política de entrega, encomendas e outras informações institucionais.",
    });

    this.repository = repository;
    this.embedding = embedding;

    this.addParameter({
      name: "query",
      type: "string",
      description: "Assunto ou pergunta sobre a empresa que deseja consultar",
      required: true,
    });
  }

  public static create(
    repository: ICompanyRepository,
    embedding: IEmbeddingProvider,
  ): FindCompanyInfoTool {
    return new FindCompanyInfoTool(repository, embedding);
  }

  public async execute({
    query,
  }: {
    query: string;
  }): Promise<ToolResponse<CompanyInfoResult[]>> {
    const vector = await this.embedding.embed({ text: query });
    const results = await this.repository.search({ vector });

    const passages: CompanyInfoResult[] = results.map((result) => ({
      score: Number(result.score.toFixed(4)),
      confidence: confidenceOf(result.score),
      section: result.payload.section ?? null,
      title: result.payload.title ?? null,
      source: result.payload.source ?? null,
      text: result.payload.text,
    }));

    if (passages.length === 0) {
      return toolSuccess<CompanyInfoResult[]>({
        message: `Nenhum trecho indexado corresponde a "${query}".`,
        userFriendlyMessage: "Não tenho essa informação no momento.",
        data: [],
      });
    }

    const best = passages[0]!;

    return toolSuccess({
      message: `${passages.length} trecho(s) encontrados para "${query}". Melhor similaridade: ${best.score} (${best.confidence}). Se a confiança for "baixa", não afirme a informação: diga que não tem esse dado.`,
      userFriendlyMessage:
        best.confidence === "baixa"
          ? "Não tenho essa informação no momento."
          : "Encontrei essa informação sobre a cafeteria.",
      data: passages,
    });
  }
}

type CompanyInfoResult = {
  score: number;
  confidence: "alta" | "media" | "baixa";
  section: string | null;
  title: string | null;
  source: string | null;
  text: string;
};

const HIGH_CONFIDENCE_SCORE = 0.7;
const LOW_CONFIDENCE_SCORE = 0.45;

function confidenceOf(score: number): "alta" | "media" | "baixa" {
  if (score >= HIGH_CONFIDENCE_SCORE) return "alta";
  if (score >= LOW_CONFIDENCE_SCORE) return "media";
  return "baixa";
}
