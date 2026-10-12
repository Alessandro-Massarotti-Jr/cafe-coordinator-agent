const RRF_K = 60;

export type FusedResult<K> = {
  key: K;
  score: number;
};

export function reciprocalRankFusion<K>(rankings: K[][]): FusedResult<K>[] {
  const fused = new Map<K, FusedResult<K>>();

  for (const ranking of rankings) {
    ranking.forEach((key, position) => {
      const current = fused.get(key) ?? { key, score: 0 };
      current.score += 1 / (RRF_K + position + 1);
      fused.set(key, current);
    });
  }

  return [...fused.values()].sort((a, b) => b.score - a.score);
}
