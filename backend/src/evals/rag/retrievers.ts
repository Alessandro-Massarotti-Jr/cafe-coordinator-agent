import { IEmbeddingProvider } from "../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import {
  CompanyChunkPayload,
  CompanySearchResult,
  ICompanyRepository,
} from "../../repositories/companyRepository/interfaces/ICompanyRepository";
import { hybridCompanySearch } from "../../services/rag/hybridCompanySearch";
import { Bm25Index } from "../../services/rag/keywordSearch";
import { RagChunk } from "./chunkers";

export { normalizeText } from "../../services/rag/keywordSearch";

export type RetrievedChunk = {
  chunk: RagChunk;
  score: number;
  similarity?: number;
};

export type Retriever = {
  name: string;
  index(chunks: RagChunk[]): Promise<void>;
  search(query: string, limit: number): Promise<RetrievedChunk[]>;
};

export type RetrieverFactory = {
  name: string;
  requiresEmbedding: boolean;
  create(embedding: IEmbeddingProvider): Retriever;
};

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

class InMemoryCompanyRepository implements ICompanyRepository {
  private points: Array<{ vector: number[]; payload: CompanyChunkPayload }> = [];

  async upsert({
    vector,
    payload,
  }: {
    id: number;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    this.points.push({ vector, payload: payload as unknown as CompanyChunkPayload });
  }

  async deleteBySource(): Promise<void> {
    this.points = [];
  }

  async search({
    vector,
    limit = 3,
  }: {
    vector: number[];
    limit?: number;
  }): Promise<CompanySearchResult[]> {
    return this.points
      .map(({ vector: pointVector, payload }) => ({
        score: cosine(vector, pointVector),
        payload,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async listAll(): Promise<CompanyChunkPayload[]> {
    return this.points.map(({ payload }) => payload);
  }
}

function createKeywordRetriever(): Retriever {
  let chunks: RagChunk[] = [];
  let index = new Bm25Index([]);

  return {
    name: "keyword",
    async index(input) {
      chunks = input;
      index = new Bm25Index(input.map((chunk) => chunk.text));
    },
    async search(query, limit) {
      return index
        .search(query)
        .slice(0, limit)
        .map((match) => ({ chunk: chunks[match.index]!, score: match.score }));
    },
  };
}

function createIndexedRepository(embedding: IEmbeddingProvider) {
  const repository = new InMemoryCompanyRepository();
  const byText = new Map<string, RagChunk>();

  return {
    repository,
    chunkOf: (payload: CompanyChunkPayload) => byText.get(payload.text)!,
    async index(input: RagChunk[]) {
      await repository.deleteBySource();
      byText.clear();
      for (const chunk of input) {
        byText.set(chunk.text, chunk);
        await repository.upsert({
          id: chunk.id,
          vector: await embedding.embed({ text: chunk.text }),
          payload: { text: chunk.text, source: "company.txt", chunkIndex: chunk.id },
        });
      }
    },
  };
}

function createVectorRetriever(embedding: IEmbeddingProvider): Retriever {
  const indexed = createIndexedRepository(embedding);

  return {
    name: "vector",
    index: indexed.index,
    async search(query, limit) {
      const vector = await embedding.embed({ text: query });
      const results = await indexed.repository.search({ vector, limit });
      return results.map(({ score, payload }) => ({
        chunk: indexed.chunkOf(payload),
        score,
        similarity: score,
      }));
    },
  };
}

function createHybridRetriever(embedding: IEmbeddingProvider): Retriever {
  const indexed = createIndexedRepository(embedding);

  return {
    name: "hybrid",
    index: indexed.index,
    async search(query, limit) {
      const results = await hybridCompanySearch({
        query,
        repository: indexed.repository,
        embedding,
        limit,
      });
      return results.map(({ payload, score, similarity }) => ({
        chunk: indexed.chunkOf(payload),
        score,
        similarity,
      }));
    },
  };
}

export const RETRIEVERS: RetrieverFactory[] = [
  { name: "keyword", requiresEmbedding: false, create: () => createKeywordRetriever() },
  { name: "vector", requiresEmbedding: true, create: createVectorRetriever },
  { name: "hybrid", requiresEmbedding: true, create: createHybridRetriever },
];

export class CachedEmbeddingProvider implements IEmbeddingProvider {
  private cache = new Map<string, Promise<number[]>>();

  constructor(private readonly inner: IEmbeddingProvider) {}

  embed({ text }: { text: string }): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) return cached;
    const pending = this.inner.embed({ text });
    this.cache.set(text, pending);
    pending.catch(() => this.cache.delete(text));
    return pending;
  }
}
