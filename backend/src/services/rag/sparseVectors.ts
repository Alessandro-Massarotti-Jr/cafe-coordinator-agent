import { tokenize } from "./tokenizer";

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export type SparseVector = {
  indices: number[];
  values: number[];
};

export function hashToken(token: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function termFrequencies(tokens: string[]): Map<number, number> {
  const frequencies = new Map<number, number>();
  for (const token of tokens) {
    const index = hashToken(token);
    frequencies.set(index, (frequencies.get(index) ?? 0) + 1);
  }
  return frequencies;
}

function toSparse(weights: Map<number, number>): SparseVector {
  const entries = [...weights.entries()].sort((a, b) => a[0] - b[0]);
  return {
    indices: entries.map(([index]) => index),
    values: entries.map(([, value]) => value),
  };
}

export function documentSparseVectors(texts: string[]): SparseVector[] {
  const documents = texts.map(tokenize);
  const averageLength =
    documents.reduce((sum, tokens) => sum + tokens.length, 0) /
    Math.max(documents.length, 1);

  return documents.map((tokens) => {
    const weights = new Map<number, number>();
    for (const [index, frequency] of termFrequencies(tokens)) {
      weights.set(
        index,
        (frequency * (BM25_K1 + 1)) /
          (frequency +
            BM25_K1 * (1 - BM25_B + (BM25_B * tokens.length) / averageLength)),
      );
    }
    return toSparse(weights);
  });
}

export function querySparseVector(text: string): SparseVector {
  return toSparse(termFrequencies(tokenize(text)));
}
