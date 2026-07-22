import axios from "axios";
import { IEmbeddingProvider } from "../interfaces/IEmbeddingProvider";

export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  private ollamaUrl: string;
  private model: string;

  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL as string;
    this.model = process.env.EMBEDDING_MODEL ?? "embeddinggemma";
  }

  async embed({ text }: { text: string }): Promise<number[]> {
    const response = await axios.post(`${this.ollamaUrl}/embed`, {
      model: this.model,
      input: text,
    });
    return response.data.embeddings[0] as number[];
  }
}
