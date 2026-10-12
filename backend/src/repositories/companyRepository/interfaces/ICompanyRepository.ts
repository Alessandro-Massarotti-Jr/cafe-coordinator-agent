import { SparseVector } from "../../../services/rag/sparseVectors";

export type CompanyChunkPayload = {
  text: string;
  source: string;
  section?: string;
  title?: string;
  chunkIndex?: number;
};

export type CompanySearchResult = {
  score: number;
  similarity: number;
  payload: CompanyChunkPayload;
};

export interface ICompanyRepository {
  upsert(params: {
    id: number;
    vector: number[];
    sparseVector: SparseVector;
    payload: Record<string, unknown>;
  }): Promise<void>;

  deleteBySource(params: { source: string }): Promise<void>;

  hybridSearch(params: {
    vector: number[];
    sparseVector: SparseVector;
    limit?: number;
  }): Promise<CompanySearchResult[]>;
}
