import "dotenv/config";
import express from "express";
import { createCoordinatorAgent } from "./agents/coordinator";
import { createAttendantAgent } from "./agents/attendant";
import { createProductsAgent } from "./agents/products";
import { createOrdersAgent } from "./agents/orders";
import { createRecommendationAgent } from "./agents/recommendation";
import { OllamaLlmProvider } from "./providers/LlmProvider/implementations/OllamaLlmProvider";
import { Message } from "./providers/LlmProvider/interfaces/ILlmProvider";
import { QdrantCompanyRepository } from "./repositories/companyRepository/implementations/QdrantCompanyRepository";
import { InMemoryOrdersRepository } from "./repositories/ordersRepository/implementations/InMemoryOrdersRepository";
import { OllamaEmbeddingProvider } from "./providers/EmbeddingProvider/implementations/OllamaEmbeddingProvider";
import { LangSmithAgentTracingProvider } from "./providers/AgentTracingProvider/implementations/LangSmithAgentTracingProvider";
import { McpToolProvider } from "./providers/McpToolProvider/McpToolProvider";
import { AgentRunner } from "./services/AgentRunner";
import { AgentToolEvent } from "./agents/Tool";
import { Agent } from "./agents/Agent";
import { seedCompany } from "./seeds/seedCompany";

const app = express();
app.use(express.json());

const provider = new OllamaLlmProvider();
const tracer = new LangSmithAgentTracingProvider();
const embedding = new OllamaEmbeddingProvider();

// Banco vetorial (informações institucionais) usado pelo Atendente.
const companyRepository = QdrantCompanyRepository.getInstance();
// Banco em memória de Pedidos (o catálogo de Produtos agora vive no MCP).
const ordersRepository = InMemoryOrdersRepository.getInstance();

const runner = new AgentRunner(provider, tracer);

// Servidor MCP externo que expõe o catálogo de produtos ao agente de Produtos.
const productsMcp = new McpToolProvider({
  url: process.env["PRODUCTS_MCP_URL"] ?? "http://products-mcp:3001/mcp",
});

// O Coordenador é montado no bootstrap, pois o agente de Produtos depende de
// uma conexão assíncrona com o servidor MCP.
let coordinatorAgent: Agent;

// Rótulos amigáveis (SSE) para cada ferramenta acionada durante o fluxo.
const TOOL_STATUS_LABELS: Record<string, string> = {
  askAttendant: "Consultando informações da padaria...",
  askProducts: "Consultando o cardápio...",
  manageOrders: "Processando o pedido...",
  askRecommendation: "Preparando uma recomendação...",
  findCompanyInfo: "Buscando informações...",
  listProducts: "Buscando produtos...",
  findProduct: "Buscando produtos...",
  getProductDetails: "Buscando detalhes do produto...",
  createOrder: "Registrando o pedido...",
  getOrder: "Consultando o pedido...",
  listOrders: "Consultando pedidos...",
  updateOrderStatus: "Atualizando o pedido...",
};

app.post("/api/chat", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const emit = (data: object) => res.write(`${JSON.stringify(data)}\n\n`);

  const onEvent = (event: AgentToolEvent) => {
    if (event.type === "tool_call") {
      emit({
        type: "tool_call",
        status:
          (event.name && TOOL_STATUS_LABELS[event.name]) ?? "Processando...",
      });
    } else if (event.type === "thinking") {
      emit({ type: "thinking", status: "Pensando..." });
    }
  };

  let requestRunId = "";
  try {
    const { messages }: { messages: Message[] } = req.body;

    ({ runId: requestRunId } = await tracer.startRun({
      name: "ChatRequest",
      runType: "chain",
      inputs: { messages },
      tags: ["chat", "coordinator"],
    }));

    const conversation: Message[] = [
      { role: "system", content: coordinatorAgent.getInstructions() },
      ...messages,
    ];

    const { content: finalMessage } = await runner.run({
      agent: coordinatorAgent,
      messages: conversation,
      parentRunId: requestRunId,
      label: "Coordenador",
      onEvent,
    });

    await tracer.endRun({
      runId: requestRunId,
      outputs: { message: finalMessage },
    });

    emit({ type: "done", message: finalMessage });
  } catch (error) {
    if (requestRunId) {
      await tracer.endRun({
        runId: requestRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    emit({
      type: "done",
      message:
        "Ops, tive um problema ao processar sua solicitação. Por favor, tente novamente mais tarde.",
    });
  }
  res.end();
});

const PORT = process.env["PORT"] ?? 3000;

async function bootstrap() {
  // Prepara o banco vetorial institucional usado pelo Atendente.
  await companyRepository.ensureCollection();
  seedCompany(companyRepository, embedding);

  // Sub-agentes especialistas. O de Produtos descobre suas ferramentas via MCP.
  const attendantAgent = createAttendantAgent(companyRepository, embedding);
  const productsAgent = await createProductsAgent(productsMcp);
  const ordersAgent = createOrdersAgent(productsMcp, ordersRepository);
  const recommendationAgent = createRecommendationAgent();

  // Coordenador: detém o contexto e delega aos especialistas.
  coordinatorAgent = createCoordinatorAgent({
    runner,
    attendantAgent,
    productsAgent,
    ordersAgent,
    recommendationAgent,
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar o servidor:", error);
  process.exit(1);
});
