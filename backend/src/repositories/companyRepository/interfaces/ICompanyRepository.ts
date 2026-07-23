export type CompanyChunkPayload = {
  text: string;
  source: string;
  section?: string;
  title?: string;
  chunkIndex?: number;
};

export type CompanySearchResult = {
  score: number;
  payload: CompanyChunkPayload;
};

export interface ICompanyRepository {
  upsert(params: {
    id: number;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void>;

  deleteBySource(params: { source: string }): Promise<void>;

  search(params: {
    vector: number[];
    limit?: number;
  }): Promise<CompanySearchResult[]>;
}
