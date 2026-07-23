import "dotenv/config";
import { createCoordinatorAgent } from "../agents/coordinator";
import { createAttendantAgent } from "../agents/attendant";
import { createProductsAgent } from "../agents/products";
import { createOrdersAgent } from "../agents/orders";
import { createRecommendationAgent } from "../agents/recommendation";
import { OllamaLlmProvider } from "../providers/LlmProvider/implementations/OllamaLlmProvider";
import { OllamaEmbeddingProvider } from "../providers/EmbeddingProvider/implementations/OllamaEmbeddingProvider";
import { LangSmithAgentTracingProvider } from "../providers/AgentTracingProvider/implementations/LangSmithAgentTracingProvider";
import { QdrantCompanyRepository } from "../repositories/companyRepository/implementations/QdrantCompanyRepository";
import { InMemoryOrdersRepository } from "../repositories/ordersRepository/implementations/InMemoryOrdersRepository";
import { InMemoryEscalationsRepository } from "../repositories/escalationsRepository/implementations/InMemoryEscalationsRepository";
import { McpToolProvider } from "../providers/McpToolProvider/McpToolProvider";
import { AgentRunner } from "../services/AgentRunner";
import { ResponseJudge } from "../services/ResponseJudge";
import { ToolSession } from "../agents/ToolSession";
import { GOLDEN_DATASET, GoldenCase } from "./goldenDataset";

async function main() {
  const provider = new OllamaLlmProvider();
  const tracer = new LangSmithAgentTracingProvider();
  const embedding = new OllamaEmbeddingProvider();

  const runner = new AgentRunner(provider, tracer);
  const judge = new ResponseJudge(provider);

  const productsMcp = new McpToolProvider({
    url: process.env["PRODUCTS_MCP_URL"] ?? "http://localhost:3001/mcp",
  });

  const coordinator = createCoordinatorAgent({
    runner,
    attendantAgent: createAttendantAgent(
      QdrantCompanyRepository.getInstance(),
      embedding,
    ),
    productsAgent: await createProductsAgent(productsMcp),
    ordersAgent: createOrdersAgent(
      productsMcp,
      InMemoryOrdersRepository.getInstance(),
    ),
    recommendationAgent: createRecommendationAgent(),
    escalationsRepository: InMemoryEscalationsRepository.getInstance(),
  });

  const { runId } = await tracer.startRun({
    name: "PromptEval",
    runType: "chain",
    inputs: { cases: GOLDEN_DATASET.length },
    tags: ["eval", "golden-dataset"],
  });

  const results: Array<{ testCase: GoldenCase; score: number; approved: boolean }> =
    [];

  for (const testCase of GOLDEN_DATASET) {
    const escalations = InMemoryEscalationsRepository.getInstance();
    const escalationsBefore = escalations.findAll().length;

    const answer = await runner.run({
      agent: coordinator,
      messages: [
        { role: "system", content: coordinator.getInstructions() },
        { role: "user", content: testCase.question },
      ],
      parentRunId: runId,
      label: `Eval/${testCase.id}`,
      session: new ToolSession(`eval-${testCase.id}`),
    });

    const verdict = await judge.evaluate({
      question: testCase.question,
      answer: answer.content,
      expectations: testCase.expectations,
    });

    const escalated = escalations.findAll().length > escalationsBefore;
    const escalationOk =
      testCase.shouldEscalate === undefined ||
      testCase.shouldEscalate === escalated;

    const approved = verdict.approved && escalationOk;
    results.push({ testCase, score: verdict.score, approved });

    console.log(
      `${approved ? "PASS" : "FAIL"} ${testCase.id} score=${verdict.score} escalou=${escalated}`,
    );
    if (!approved) console.log(`  issues: ${verdict.issues.join(" | ")}`);
  }

  const passed = results.filter((result) => result.approved).length;
  const averageScore =
    results.reduce((sum, result) => sum + result.score, 0) / results.length;

  console.log(
    `\nTaxa de acerto: ${passed}/${results.length} (${((passed / results.length) * 100).toFixed(1)}%) · score médio: ${averageScore.toFixed(2)}`,
  );

  await tracer.endRun({
    runId,
    outputs: {
      passed,
      total: results.length,
      passRate: passed / results.length,
      averageScore,
    },
    extra: {
      perCase: results.map((result) => ({
        id: result.testCase.id,
        specialist: result.testCase.specialist,
        score: result.score,
        approved: result.approved,
      })),
    },
  });

  await productsMcp.close();
}

main().catch((error) => {
  console.error("Falha ao rodar a eval:", error);
  process.exit(1);
});
