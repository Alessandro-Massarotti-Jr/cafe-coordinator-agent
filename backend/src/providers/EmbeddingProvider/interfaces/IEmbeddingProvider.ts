export interface IEmbeddingProvider {
  embed(params: { text: string }): Promise<number[]>;
}
