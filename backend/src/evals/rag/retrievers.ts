import { IEmbeddingProvider } from "../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { cosine } from "../../services/rag/cosine";
import { Bm25Index } from "./bm25";
import { RagChunk } from "./chunkers";
import { createQdrantRetriever } from "./qdrantRetrievers";
import { reciprocalRankFusion } from "./reciprocalRankFusion";

export { normalizeText } from "../../services/rag/tokenizer";

export type RetrievedChunk = {
  chunk: RagChunk;
  score: number;
  similarity?: number;
};

export type Retriever = {
  name: string;
  index(chunks: RagChunk[]): Promise<void>;
  search(query: string, limit: number): Promise<RetrievedChunk[]>;
  dispose?(): Promise<void>;
};

export type RetrieverFactory = {
  name: string;
  requiresEmbedding: boolean;
  create(embedding: IEmbeddingProvider): Retriever;
};

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

function createVectorRetriever(embedding: IEmbeddingProvider): Retriever {
  let indexed: Array<{ chunk: RagChunk; vector: number[] }> = [];

  return {
    name: "vector",
    async index(input) {
      indexed = [];
      for (const chunk of input) {
        indexed.push({ chunk, vector: await embedding.embed({ text: chunk.text }) });
      }
    },
    async search(query, limit) {
      const vector = await embedding.embed({ text: query });
      return indexed
        .map(({ chunk, vector: chunkVector }) => {
          const similarity = cosine(vector, chunkVector);
          return { chunk, score: similarity, similarity };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}

function createHybridRetriever(embedding: IEmbeddingProvider): Retriever {
  const keyword = createKeywordRetriever();
  const vector = createVectorRetriever(embedding);
  const chunksById = new Map<number, RagChunk>();

  return {
    name: "hybrid",
    async index(input) {
      chunksById.clear();
      for (const chunk of input) chunksById.set(chunk.id, chunk);
      await keyword.index(input);
      await vector.index(input);
    },
    async search(query, limit) {
      const vectorRanking = await vector.search(query, chunksById.size);
      const keywordRanking = await keyword.search(query, chunksById.size);
      const similarities = new Map(
        vectorRanking.map(({ chunk, score }) => [chunk.id, score]),
      );

      return reciprocalRankFusion([
        keywordRanking.map(({ chunk }) => chunk.id),
        vectorRanking.map(({ chunk }) => chunk.id),
      ])
        .slice(0, limit)
        .map(({ key, score }) => ({
          chunk: chunksById.get(key)!,
          score,
          similarity: similarities.get(key) ?? 0,
        }));
    },
  };
}

export const RETRIEVERS: RetrieverFactory[] = [
  { name: "keyword", requiresEmbedding: false, create: () => createKeywordRetriever() },
  { name: "vector", requiresEmbedding: true, create: createVectorRetriever },
  { name: "hybrid", requiresEmbedding: true, create: createHybridRetriever },
  {
    name: "sparse",
    requiresEmbedding: false,
    create: (embedding) => createQdrantRetriever("sparse", embedding),
  },
  {
    name: "sparse-hybrid",
    requiresEmbedding: true,
    create: (embedding) => createQdrantRetriever("sparse-hybrid", embedding),
  },
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
