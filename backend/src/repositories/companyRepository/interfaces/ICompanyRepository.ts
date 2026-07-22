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
  }): Promise<Array<Record<string, unknown>>>;
}
