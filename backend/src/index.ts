import "dotenv/config";
import { randomUUID } from "node:crypto";
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
import { openSseStream, sendEvent, startHeartbeat } from "./http/sse";

const app = express();
app.use(express.json());

const provider = new OllamaLlmProvider();
const tracer = new LangSmithAgentTracingProvider();
const embedding = new OllamaEmbeddingProvider();

const companyRepository = QdrantCompanyRepository.getInstance();
const ordersRepository = InMemoryOrdersRepository.getInstance();

const runner = new AgentRunner(provider, tracer);

const productsMcp = new McpToolProvider({
  url: process.env["PRODUCTS_MCP_URL"] ?? "http://products-mcp:3001/mcp",
});

let coordinatorAgent: Agent;

const TOOL_STATUS_LABELS: Record<string, string> = {
  askAttendant: "Consultando informações da cafeteria...",
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

const PENDING_CHAT_TTL_MS = 60_000;

const pendingChats = new Map<string, { messages: Message[]; createdAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [id, pending] of pendingChats) {
    if (now - pending.createdAt > PENDING_CHAT_TTL_MS) pendingChats.delete(id);
  }
}, PENDING_CHAT_TTL_MS).unref();

app.post("/api/chat", (req, res) => {
  const { messages } = req.body as { messages?: Message[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages é obrigatório" });
    return;
  }

  const streamId = randomUUID();
  pendingChats.set(streamId, { messages, createdAt: Date.now() });

  res.status(201).json({ streamId });
});

app.get("/api/chat/stream/:streamId", async (req, res) => {
  const streamId = req.params.streamId;
  const pending = pendingChats.get(streamId);

  if (!pending) {
    res.status(404).json({ error: "stream não encontrado ou já consumido" });
    return;
  }

  pendingChats.delete(streamId);

  openSseStream(res);

  const stopHeartbeat = startHeartbeat(res);

  let eventId = 0;
  const emit = (event: string, data: object) =>
    sendEvent(res, { id: ++eventId, event, data });

  let aborted = false;
  req.on("close", () => {
    aborted = true;
    stopHeartbeat();
  });

  const onEvent = (event: AgentToolEvent) => {
    if (aborted) return;
    if (event.type === "tool_call") {
      emit("status", {
        type: "tool_call",
        status:
          (event.name && TOOL_STATUS_LABELS[event.name]) ?? "Processando...",
      });
    } else if (event.type === "thinking") {
      emit("status", { type: "thinking", status: "Pensando..." });
    }
  };

  const { messages } = pending;

  let requestRunId = "";
  try {
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

    emit("done", { type: "done", message: finalMessage });
  } catch (error) {
    if (requestRunId) {
      await tracer.endRun({
        runId: requestRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    emit("stream_error", {
      type: "stream_error",
      message:
        "Ops, tive um problema ao processar sua solicitação. Por favor, tente novamente mais tarde.",
    });
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
  }
});

const PORT = process.env["PORT"] ?? 3000;

async function bootstrap() {
  await companyRepository.ensureCollection();
  seedCompany(companyRepository, embedding);

  const attendantAgent = createAttendantAgent(companyRepository, embedding);
  const productsAgent = await createProductsAgent(productsMcp);
  const ordersAgent = createOrdersAgent(productsMcp, ordersRepository);
  const recommendationAgent = createRecommendationAgent();

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
