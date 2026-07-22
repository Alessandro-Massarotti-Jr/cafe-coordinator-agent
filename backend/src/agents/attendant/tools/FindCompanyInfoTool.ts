import { Tool } from "../../Tool";
import { ICompanyRepository } from "../../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";

/**
 * Busca informações institucionais da empresa no banco vetorial:
 * endereço, horário, wifi, aceitação de pets, formas de pagamento, entregas etc.
 */
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
        "Busca informações gerais sobre a padaria: endereço e localização, horário de funcionamento, se aceita animais/pets, se tem wifi, formas de pagamento, política de entrega, encomendas e outras informações institucionais.",
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

  public async execute({ query }: { query: string }) {
    const vector = await this.embedding.embed({ text: query });
    return this.repository.search({ vector });
  }
}
