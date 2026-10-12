import { tokenize } from "../../services/rag/tokenizer";

const BM25_K1 = 1.2;
const BM25_B = 0.75;

export type KeywordMatch = {
  index: number;
  score: number;
};

export class Bm25Index {
  private documents: string[][];
  private averageLength: number;
  private documentFrequency = new Map<string, number>();

  constructor(texts: string[]) {
    this.documents = texts.map(tokenize);
    this.averageLength =
      this.documents.reduce((sum, tokens) => sum + tokens.length, 0) /
      Math.max(this.documents.length, 1);

    for (const tokens of this.documents) {
      for (const token of new Set(tokens)) {
        this.documentFrequency.set(
          token,
          (this.documentFrequency.get(token) ?? 0) + 1,
        );
      }
    }
  }

  search(query: string): KeywordMatch[] {
    const queryTokens = tokenize(query);
    const total = this.documents.length;

    return this.documents
      .map((tokens, index) => {
        let score = 0;
        for (const term of queryTokens) {
          const frequency = tokens.filter((token) => token === term).length;
          if (frequency === 0) continue;
          const df = this.documentFrequency.get(term) ?? 0;
          const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
          score +=
            idf *
            ((frequency * (BM25_K1 + 1)) /
              (frequency +
                BM25_K1 *
                  (1 - BM25_B + (BM25_B * tokens.length) / this.averageLength)));
        }
        return { index, score };
      })
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);
  }
}
