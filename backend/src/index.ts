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
import { InMemoryEscalationsRepository } from "./repositories/escalationsRepository/implementations/InMemoryEscalationsRepository";
import { OllamaEmbeddingProvider } from "./providers/EmbeddingProvider/implementations/OllamaEmbeddingProvider";
import { LangSmithAgentTracingProvider } from "./providers/AgentTracingProvider/implementations/LangSmithAgentTracingProvider";
import { McpToolProvider } from "./providers/McpToolProvider/McpToolProvider";
import { AgentRunner } from "./services/AgentRunner";
import { ContextCompactor } from "./services/ContextCompactor";
import { ConversationStore } from "./services/ConversationStore";
import { CustomerMemoryStore } from "./services/CustomerMemoryStore";
import { createPostToolUseHook } from "./services/hooks/postToolUse";
import { AgentToolEvent } from "./agents/Tool";
import { ToolSession } from "./agents/ToolSession";
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
const escalationsRepository = InMemoryEscalationsRepository.getInstance();

const runner = new AgentRunner(provider, tracer, {
  postToolUse: createPostToolUseHook(),
});

const compactor = new ContextCompactor(provider);
const conversations = new ConversationStore(compactor);
const customerMemory = new CustomerMemoryStore();

const productsMcp = new McpToolProvider({
  url: process.env["PRODUCTS_MCP_URL"] ?? "http://products-mcp:3001/mcp",
});

let coordinatorAgent: Agent;

const TOOL_STATUS_LABELS: Record<string, string> = {
  askAttendant: "Consultando informações da cafeteria...",
  askProducts: "Consultando o cardápio...",
  manageOrders: "Processando o pedido...",
  askRecommendation: "Preparando uma recomendação...",
  escalateToHuman: "Transferindo para um atendente...",
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
const CONVERSATION_PRUNE_MS = 15 * 60_000;

type PendingChat = {
  messages: Message[];
  sessionId: string;
  customerId: string | null;
  createdAt: number;
};

const pendingChats = new Map<string, PendingChat>();

setInterval(() => {
  const now = Date.now();
  for (const [id, pending] of pendingChats) {
    if (now - pending.createdAt > PENDING_CHAT_TTL_MS) pendingChats.delete(id);
  }
}, PENDING_CHAT_TTL_MS).unref();

setInterval(() => conversations.prune(), CONVERSATION_PRUNE_MS).unref();

app.post("/api/chat", (req, res) => {
  const { messages, sessionId, customerId } = req.body as {
    messages?: Message[];
    sessionId?: string;
    customerId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages é obrigatório" });
    return;
  }

  const streamId = randomUUID();
  const resolvedSessionId = sessionId ?? randomUUID();

  pendingChats.set(streamId, {
    messages,
    sessionId: resolvedSessionId,
    customerId: customerId ?? null,
    createdAt: Date.now(),
  });

  res.status(201).json({ streamId, sessionId: resolvedSessionId });
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

  const { messages, sessionId, customerId } = pending;
  const isNewConversation = conversations.isNew(sessionId);

  let requestRunId = "";
  try {
    ({ runId: requestRunId } = await tracer.startRun({
      name: "ChatRequest",
      runType: "chain",
      inputs: { messages, sessionId },
      tags: ["chat", "coordinator"],
    }));

    const stored = conversations.getOrCreate(sessionId, customerId ?? undefined);

    if (stored.messages.length === 0 && !stored.summary) {
      conversations.replaceTurns(sessionId, messages);
    } else {
      const lastTurn = messages[messages.length - 1];
      if (lastTurn) conversations.append(sessionId, [lastTurn]);
    }

    await conversations.compactIfNeeded(sessionId);

    const memory =
      isNewConversation && customerId
        ? customerMemory.asContext(customerId)
        : null;

    const conversation = conversations.buildContext({
      sessionId,
      systemPrompt: coordinatorAgent.getInstructions(),
      customerMemory: memory,
    });

    const result = await runner.run({
      agent: coordinatorAgent,
      messages: conversation,
      parentRunId: requestRunId,
      label: "Coordenador",
      onEvent,
      session: new ToolSession(sessionId),
    });

    const finalMessage = result.content;

    conversations.append(sessionId, [
      { role: "assistant", content: finalMessage },
    ]);

    if (customerId) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");
      if (lastUserMessage) {
        customerMemory.remember(
          customerId,
          `Pediu: "${lastUserMessage.content}". Resposta: "${finalMessage.slice(0, 240)}"`,
        );
      }
    }

    await tracer.endRun({
      runId: requestRunId,
      outputs: { message: finalMessage },
    });

    if (result.degraded || result.limitReached) {
      emit("degraded", {
        type: "degraded",
        partial: true,
        reason: result.limitReached
          ? "limite de iterações atingido"
          : "parte das consultas falhou",
        failures: result.failures,
      });
    }

    emit("done", {
      type: "done",
      message: finalMessage,
      sessionId,
      partial: result.degraded || result.limitReached,
    });
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

app.get("/api/escalations", (_req, res) => {
  res.json({ escalations: escalationsRepository.findAll() });
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
    escalationsRepository,
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar o servidor:", error);
  process.exit(1);
});
