import { QdrantClient } from "@qdrant/js-client-rest";
import { IEmbeddingProvider } from "../../providers/EmbeddingProvider/interfaces/IEmbeddingProvider";
import { QdrantCompanyRepository } from "../../repositories/companyRepository/implementations/QdrantCompanyRepository";
import { hybridCompanySearch } from "../../services/rag/hybridCompanySearch";
import {
  documentSparseVectors,
  querySparseVector,
} from "../../services/rag/sparseVectors";
import { RagChunk } from "./chunkers";
import type { Retriever } from "./retrievers";

const SPARSE = "sparse";
const SOURCE = "company.txt";

type Mode = "sparse" | "sparse-hybrid";

let collectionCounter = 0;

function qdrantUrl(): string {
  return process.env.RAG_QDRANT_URL ?? "http://localhost:6333";
}

function collectionName(mode: Mode): string {
  return `rag_eval_${mode.replace("-", "_")}_${process.pid}_${collectionCounter++}`;
}

function createSparseOnlyRetriever(): Retriever {
  const client = new QdrantClient({ url: qdrantUrl(), checkCompatibility: false });
  const collection = collectionName("sparse");
  const chunksById = new Map<number, RagChunk>();

  return {
    name: "sparse",
    async index(input) {
      chunksById.clear();
      if ((await client.collectionExists(collection)).exists) {
        await client.deleteCollection(collection);
      }
      await client.createCollection(collection, {
        sparse_vectors: { [SPARSE]: { modifier: "idf" } },
      });

      const sparseVectors = documentSparseVectors(input.map((chunk) => chunk.text));
      const points = input.map((chunk, position) => {
        chunksById.set(chunk.id, chunk);
        return { id: chunk.id, vector: { [SPARSE]: sparseVectors[position]! } };
      });
      await client.upsert(collection, { wait: true, points });
    },
    async search(query, limit) {
      const sparse = querySparseVector(query);
      if (sparse.indices.length === 0) return [];

      const response = await client.query(collection, {
        query: sparse,
        using: SPARSE,
        limit,
        with_payload: false,
      });
      return response.points.map((point) => ({
        chunk: chunksById.get(Number(point.id))!,
        score: point.score,
      }));
    },
    async dispose() {
      await client.deleteCollection(collection).catch(() => undefined);
    },
  };
}

function createProductionHybridRetriever(embedding: IEmbeddingProvider): Retriever {
  const repository = QdrantCompanyRepository.create({
    url: qdrantUrl(),
    collection: collectionName("sparse-hybrid"),
  });
  const chunksByText = new Map<string, RagChunk>();

  return {
    name: "sparse-hybrid",
    async index(input) {
      chunksByText.clear();
      await repository.ensureCollection();
      await repository.deleteBySource({ source: SOURCE });

      const sparseVectors = documentSparseVectors(input.map((chunk) => chunk.text));
      for (const [position, chunk] of input.entries()) {
        chunksByText.set(chunk.text, chunk);
        await repository.upsert({
          id: chunk.id,
          vector: await embedding.embed({ text: chunk.text }),
          sparseVector: sparseVectors[position]!,
          payload: { text: chunk.text, source: SOURCE, chunkIndex: chunk.id },
        });
      }
    },
    async search(query, limit) {
      const results = await hybridCompanySearch({ query, repository, embedding, limit });
      return results.map(({ payload, score, similarity }) => ({
        chunk: chunksByText.get(payload.text)!,
        score,
        similarity,
      }));
    },
    async dispose() {
      await repository.deleteCollection().catch(() => undefined);
    },
  };
}

export function createQdrantRetriever(
  mode: Mode,
  embedding: IEmbeddingProvider,
): Retriever {
  return mode === "sparse"
    ? createSparseOnlyRetriever()
    : createProductionHybridRetriever(embedding);
}
