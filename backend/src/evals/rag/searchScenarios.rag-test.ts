import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { OllamaEmbeddingProvider } from "../../providers/EmbeddingProvider/implementations/OllamaEmbeddingProvider";
import { CHUNKERS, Chunker, RagChunk } from "./chunkers";
import {
  CachedEmbeddingProvider,
  RETRIEVERS,
  RetrievedChunk,
  RetrieverFactory,
  normalizeText,
} from "./retrievers";
import scenarios from "./search-scenarios.json";

type SearchScenario = {
  input: string;
  output: string;
};

type ScenarioResult = {
  input: string;
  output: string;
  hit: boolean;
  rank: number | null;
  similarity: number | null;
  passed: boolean;
  retrieved: Array<{
    id: number;
    score: number;
    similarity: number | null;
    text: string;
  }>;
};

type CombinationReport = {
  chunker: string;
  retriever: string;
  chunks: number;
  results: ScenarioResult[];
};

const TOP_K = Number(process.env.RAG_TOP_K ?? 3);
const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.45);
const DOCUMENT = fs.readFileSync(
  path.join(__dirname, "../../samples/company.txt"),
  "utf-8",
);
const REPORT_PATH = path.join(__dirname, "../../../reports/rag-report.json");
const SCENARIOS = scenarios as SearchScenario[];

function selected<T extends { name: string }>(items: T[], filter?: string): T[] {
  if (!filter) return items;
  const names = filter.split(",").map((name) => name.trim());
  return items.filter((item) => names.includes(item.name));
}

function comparable(text: string): string {
  return normalizeText(text).replace(/\s+/g, " ").trim();
}

function rankOf(output: string, retrieved: RetrievedChunk[]): number | null {
  const expected = comparable(output);
  const index = retrieved.findIndex(({ chunk }) =>
    comparable(chunk.text).includes(expected),
  );
  return index === -1 ? null : index + 1;
}

function describeFailure(result: ScenarioResult, chunks: RagChunk[]): string {
  const holders = chunks
    .filter((chunk) => comparable(chunk.text).includes(comparable(result.output)))
    .map((chunk) => chunk.id);

  const retrieved = result.retrieved
    .map(
      (item, position) =>
        `  #${position + 1} chunk=${item.id} score=${item.score.toFixed(4)}${item.similarity === null ? "" : ` similaridade=${item.similarity.toFixed(4)}`}\n    ${item.text.replace(/\s+/g, " ").slice(0, 220)}`,
    )
    .join("\n");

  const reason = result.hit
    ? `Encontrado em #${result.rank}, mas a similaridade ${result.similarity?.toFixed(4)} está abaixo do mínimo ${MIN_SCORE}`
    : `Dado não retornado no top ${TOP_K}`;

  return [
    reason,
    `Pergunta: "${result.input}"`,
    `Esperado: "${result.output}"`,
    holders.length > 0
      ? `Chunks que contêm o dado: [${holders.join(", ")}]`
      : "Nenhum chunk contém o dado inteiro (o chunking quebrou a informação)",
    `Top ${TOP_K} retornado:`,
    retrieved || "  (nenhum resultado)",
  ].join("\n");
}

const embedding = new CachedEmbeddingProvider(new OllamaEmbeddingProvider());
const chunkers = selected(CHUNKERS, process.env.RAG_CHUNKERS);
const retrievers = selected(RETRIEVERS, process.env.RAG_RETRIEVERS);
const combinations: Array<[string, string, Chunker, RetrieverFactory]> =
  chunkers.flatMap((chunker) =>
    retrievers.map(
      (retriever) =>
        [chunker.name, retriever.name, chunker, retriever] as [
          string,
          string,
          Chunker,
          RetrieverFactory,
        ],
    ),
  );
const reports: CombinationReport[] = [];

describe("search-scenarios.json", () => {
  it.each(SCENARIOS)("output de \"$input\" existe no company.txt", ({ output }) => {
    expect(comparable(DOCUMENT)).toContain(comparable(output));
  });
});

if (combinations.length > 0) {
  describe.each(combinations)(
    "RAG chunking=%s | search=%s",
    (_chunkerName, _retrieverName, chunker, retrieverFactory) => {
      const chunks = chunker.chunk(DOCUMENT);
      const retriever = retrieverFactory.create(embedding);
      const report: CombinationReport = {
        chunker: chunker.name,
        retriever: retrieverFactory.name,
        chunks: chunks.length,
        results: [],
      };
      reports.push(report);

      beforeAll(async () => {
        await retriever.index(chunks);
      });

      afterAll(async () => {
        await retriever.dispose?.();
      });

      it.each(SCENARIOS)("\"$input\" → \"$output\"", async (scenario) => {
        const retrieved = await retriever.search(scenario.input, TOP_K);
        const rank = rankOf(scenario.output, retrieved);
        const similarity =
          rank === null ? null : (retrieved[rank - 1]?.similarity ?? null);
        const result: ScenarioResult = {
          input: scenario.input,
          output: scenario.output,
          hit: rank !== null,
          rank,
          similarity,
          passed:
            rank !== null && (similarity === null || similarity >= MIN_SCORE),
          retrieved: retrieved.map(({ chunk, score, similarity }) => ({
            id: chunk.id,
            score,
            similarity: similarity ?? null,
            text: chunk.text,
          })),
        };
        report.results.push(result);

        if (!result.passed) throw new Error(describeFailure(result, chunks));
      });
    },
  );
}

afterAll(() => {
  const summary = reports
    .filter((report) => report.results.length > 0)
    .map((report) => {
      const total = report.results.length;
      const hits = report.results.filter((result) => result.hit).length;
      const passed = report.results.filter((result) => result.passed).length;
      const similarities = report.results
        .map((result) => result.similarity)
        .filter((similarity): similarity is number => similarity !== null)
        .sort((a, b) => a - b);
      const median = similarities[Math.floor(similarities.length / 2)];
      const reciprocalRank =
        report.results.reduce(
          (sum, result) => sum + (result.rank ? 1 / result.rank : 0),
          0,
        ) / total;
      return {
        chunking: report.chunker,
        search: report.retriever,
        chunks: report.chunks,
        [`hit@${TOP_K}`]: `${hits}/${total} (${((hits / total) * 100).toFixed(1)}%)`,
        mrr: Number(reciprocalRank.toFixed(3)),
        [`aprovados sim>=${MIN_SCORE}`]: `${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`,
        "mediana sim": median === undefined ? "-" : Number(median.toFixed(3)),
      };
    });

  if (summary.length === 0) return;

  console.table(summary);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify({ topK: TOP_K, minScore: MIN_SCORE, summary, combinations: reports }, null, 2),
  );
  console.log(`Relatório completo salvo em ${REPORT_PATH}`);
});
