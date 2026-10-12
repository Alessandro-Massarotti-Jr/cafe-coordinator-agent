import {
  CompanySearchResult,
  ICompanyRepository,
} from "../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { querySparseVector } from "./sparseVectors";

export async function hybridCompanySearch({
  query,
  repository,
  embedding,
  limit,
}: {
  query: string;
  repository: ICompanyRepository;
  embedding: IEmbeddingProvider;
  limit: number;
}): Promise<CompanySearchResult[]> {
  const vector = await embedding.embed({ text: query });

  return repository.hybridSearch({
    vector,
    sparseVector: querySparseVector(query),
    limit,
  });
}
