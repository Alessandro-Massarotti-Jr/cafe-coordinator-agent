import {
  CompanySearchResult,
  ICompanyRepository,
} from "../../repositories/companyRepository/interfaces/ICompanyRepository";
import { IEmbeddingProvider } from "../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { TraceContext } from "../../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";
import { traceSpan } from "../tracing/traceSpan";
import { querySparseVector } from "./sparseVectors";

export async function hybridCompanySearch({
  query,
  repository,
  embedding,
  limit,
  trace,
}: {
  query: string;
  repository: ICompanyRepository;
  embedding: IEmbeddingProvider;
  limit: number;
  trace?: TraceContext | undefined;
}): Promise<CompanySearchResult[]> {
  return traceSpan<CompanySearchResult[]>(
    {
      context: trace,
      name: "RAG/CompanyHybridSearch",
      runType: "retriever",
      inputs: { query, limit },
      tags: ["rag", "retriever", "qdrant"],
      metadata: { collection: "company", strategy: "hybrid-dense-sparse" },
      describe: (results) => ({
        outputs: {
          documents: results.map((result) => ({
            type: "Document",
            page_content: result.payload.text,
            metadata: {
              score: result.score,
              similarity: result.similarity,
              section: result.payload.section ?? null,
              title: result.payload.title ?? null,
              source: result.payload.source,
              chunkIndex: result.payload.chunkIndex ?? null,
            },
          })),
        },
        metadata: {
          hits: results.length,
          bestSimilarity: results[0]?.similarity ?? null,
        },
      }),
    },
    async (searchTrace) => {
      const vector = await traceSpan<number[]>(
        {
          context: searchTrace,
          name: "Embedding/query",
          runType: "embedding",
          inputs: { text: query },
          tags: ["embedding"],
          describe: (result) => ({
            outputs: { dimensions: result.length },
          }),
        },
        () => embedding.embed({ text: query }),
      );

      const sparseVector = querySparseVector(query);

      return traceSpan<CompanySearchResult[]>(
        {
          context: searchTrace,
          name: "Qdrant/hybridSearch",
          runType: "retriever",
          inputs: {
            limit,
            denseDimensions: vector.length,
            sparseTerms: sparseVector.indices.length,
          },
          tags: ["qdrant"],
          describe: (results) => ({
            outputs: {
              hits: results.map((result) => ({
                score: result.score,
                similarity: result.similarity,
                section: result.payload.section ?? null,
              })),
            },
          }),
        },
        () => repository.hybridSearch({ vector, sparseVector, limit }),
      );
    },
  );
}
