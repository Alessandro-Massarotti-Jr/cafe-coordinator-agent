import {
  CompanyChunkPayload,
  ICompanyRepository,
} from "../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { Bm25Index } from "./keywordSearch";
import { reciprocalRankFusion } from "./reciprocalRankFusion";

export type HybridSearchResult = {
  payload: CompanyChunkPayload;
  score: number;
  similarity: number;
};

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
}): Promise<HybridSearchResult[]> {
  const [vector, documents] = await Promise.all([
    embedding.embed({ text: query }),
    repository.listAll(),
  ]);

  if (documents.length === 0) return [];

  const vectorResults = await repository.search({
    vector,
    limit: documents.length,
  });
  const keywordResults = new Bm25Index(
    documents.map((document) => document.text),
  ).search(query);

  const payloads = new Map(
    documents.map((document) => [document.text, document]),
  );
  const similarities = new Map<string, number>();
  for (const result of vectorResults) {
    payloads.set(result.payload.text, result.payload);
    similarities.set(result.payload.text, result.score);
  }

  return reciprocalRankFusion([
    keywordResults.map((match) => documents[match.index]!.text),
    vectorResults.map((result) => result.payload.text),
  ])
    .slice(0, limit)
    .map(({ key, score }) => ({
      payload: payloads.get(key)!,
      score,
      similarity: similarities.get(key) ?? 0,
    }));
}
