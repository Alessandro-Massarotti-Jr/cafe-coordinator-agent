import { QdrantClient } from "@qdrant/js-client-rest";
import {
  CompanyChunkPayload,
  CompanySearchResult,
  ICompanyRepository,
} from "../interfaces/ICompanyRepository";
import { withRetry } from "../../../services/retry";
import { cosine } from "../../../services/rag/cosine";
import { SparseVector } from "../../../services/rag/sparseVectors";

const VECTOR_SIZE = 768;
const DENSE_VECTOR = "dense";
const SPARSE_VECTOR = "sparse";
const PREFETCH_LIMIT = 50;
const RRF_K = 60;

export class QdrantCompanyRepository implements ICompanyRepository {
  private static instance: QdrantCompanyRepository;

  private constructor(
    private readonly client: QdrantClient,
    private readonly collection: string,
  ) {}

  public static getInstance(): QdrantCompanyRepository {
    if (!QdrantCompanyRepository.instance) {
      QdrantCompanyRepository.instance = new QdrantCompanyRepository(
        new QdrantClient({
          host: process.env.QDRANT_HOST as string,
          port: Number(process.env.QDRANT_PORT as string),
        }),
        process.env.QDRANT_COMPANY_COLLECTION as string,
      );
    }
    return QdrantCompanyRepository.instance;
  }

  public static create({
    url,
    collection,
  }: {
    url: string;
    collection: string;
  }): QdrantCompanyRepository {
    return new QdrantCompanyRepository(
      new QdrantClient({ url, checkCompatibility: false }),
      collection,
    );
  }

  async ensureCollection(): Promise<void> {
    const { exists } = await this.client.collectionExists(this.collection);

    if (exists) {
      if (await this.hasHybridSchema()) return;
      await this.client.deleteCollection(this.collection);
    }

    await this.client.createCollection(this.collection, {
      vectors: { [DENSE_VECTOR]: { size: VECTOR_SIZE, distance: "Cosine" } },
      sparse_vectors: { [SPARSE_VECTOR]: { modifier: "idf" } },
    });
  }

  async deleteCollection(): Promise<void> {
    await this.client.deleteCollection(this.collection);
  }

  async upsert({
    id,
    vector,
    sparseVector,
    payload,
  }: {
    id: number;
    vector: number[];
    sparseVector: SparseVector;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.client.upsert(this.collection, {
      wait: true,
      points: [
        {
          id,
          vector: { [DENSE_VECTOR]: vector, [SPARSE_VECTOR]: sparseVector },
          payload,
        },
      ],
    });
  }

  async deleteBySource({ source }: { source: string }): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: {
        must: [{ key: "source", match: { value: source } }],
      },
    });
  }

  async hybridSearch({
    vector,
    sparseVector,
    limit = 3,
  }: {
    vector: number[];
    sparseVector: SparseVector;
    limit?: number;
  }): Promise<CompanySearchResult[]> {
    const prefetch = [
      { query: vector, using: DENSE_VECTOR, limit: PREFETCH_LIMIT },
      ...(sparseVector.indices.length > 0
        ? [{ query: sparseVector, using: SPARSE_VECTOR, limit: PREFETCH_LIMIT }]
        : []),
    ];

    const response = await withRetry(() =>
      this.client.query(this.collection, {
        prefetch,
        query: { rrf: { k: RRF_K } },
        limit,
        with_payload: true,
        with_vector: [DENSE_VECTOR],
      }),
    );

    return response.points.map((point) => ({
      score: point.score,
      similarity: cosine(vector, denseVectorOf(point.vector)),
      payload: point.payload as unknown as CompanyChunkPayload,
    }));
  }

  private async hasHybridSchema(): Promise<boolean> {
    const info = await this.client.getCollection(this.collection);
    const vectors = info.config.params.vectors as Record<string, unknown> | undefined;
    const sparseVectors = info.config.params.sparse_vectors ?? {};
    return Boolean(vectors && DENSE_VECTOR in vectors && SPARSE_VECTOR in sparseVectors);
  }
}

function denseVectorOf(vector: unknown): number[] {
  if (vector && typeof vector === "object" && DENSE_VECTOR in vector) {
    const dense = (vector as Record<string, unknown>)[DENSE_VECTOR];
    if (Array.isArray(dense)) return dense as number[];
  }
  return [];
}
