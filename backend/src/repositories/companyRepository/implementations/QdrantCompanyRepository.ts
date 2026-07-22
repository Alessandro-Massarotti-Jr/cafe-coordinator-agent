import { QdrantClient } from "@qdrant/js-client-rest";
import { ICompanyRepository } from "../interfaces/ICompanyRepository";

const VECTOR_SIZE = 768;

export class QdrantCompanyRepository implements ICompanyRepository {
  private client: QdrantClient;
  private collection: string;
  private static instance: QdrantCompanyRepository;

  private constructor() {
    this.client = new QdrantClient({
      host: process.env.QDRANT_HOST as string,
      port: Number(process.env.QDRANT_PORT as string),
    });
    this.collection = process.env.QDRANT_COMPANY_COLLECTION as string;
  }

  public static getInstance(): QdrantCompanyRepository {
    if (!QdrantCompanyRepository.instance) {
      QdrantCompanyRepository.instance = new QdrantCompanyRepository();
    }
    return QdrantCompanyRepository.instance;
  }

  async ensureCollection(): Promise<void> {
    const collections = await this.client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === this.collection,
    );

    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: { size: VECTOR_SIZE, distance: "Cosine" },
      });
    }
  }

  async upsert({
    id,
    vector,
    payload,
  }: {
    id: number;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.client.upsert(this.collection, {
      points: [{ id, vector, payload }],
    });
  }

  async deleteBySource({ source }: { source: string }): Promise<void> {
    await this.client.delete(this.collection, {
      filter: {
        must: [{ key: "source", match: { value: source } }],
      },
    });
  }

  async search({
    vector,
    limit = 3,
  }: {
    vector: number[];
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const results = await this.client.search(this.collection, {
      vector,
      limit,
      with_payload: true,
    });
    return results.map((r) => r.payload as Record<string, unknown>);
  }
}
