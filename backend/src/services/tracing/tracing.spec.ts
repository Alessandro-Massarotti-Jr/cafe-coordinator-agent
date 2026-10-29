import { Agent } from "../../agents/Agent";
import { AgentModel } from "../../agents/AgentModel";
import { Tool, ToolContext } from "../../agents/Tool";
import { ToolResponse, toolError, toolSuccess } from "../../agents/ToolResponse";
import { DelegateAgentTool } from "../../agents/coordinator/tools/DelegateAgentTool";
import {
  ILlmProvider,
  LlmChatResult,
  Message,
} from "../../providers/LlmProvider/interfaces/ILlmProvider";
import { AgentRunner } from "../AgentRunner";
import { InMemoryTracer } from "./InMemoryTracer";
import { traceSpan } from "./traceSpan";

class QueueLlmProvider implements ILlmProvider {
  constructor(private readonly queue: LlmChatResult[]) {}

  async chat(_data: { agent: Agent; messages: Message[] }) {
    const next = this.queue.shift();
    if (!next) throw new Error("fila vazia");
    return next;
  }
}

const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };

const text = (content: string): LlmChatResult => ({
  message: { role: "assistant", content },
  usage,
  stopReason: "end_turn",
});

const call = (name: string, args: Record<string, unknown>): LlmChatResult => ({
  message: {
    role: "assistant",
    content: "",
    tool_calls: [{ id: `${name}-call`, function: { name, arguments: args } }],
  },
  usage,
  stopReason: "tool_calls",
});

class StubTool extends Tool {
  public lastContext: ToolContext | undefined;

  constructor(
    name: string,
    private readonly response: ToolResponse = toolSuccess({
      message: "ok",
      userFriendlyMessage: "ok",
    }),
  ) {
    super({ name, description: name });
  }

  async execute(_params: unknown, context?: ToolContext) {
    this.lastContext = context;
    return this.response;
  }
}

function agent(name: string, tools: Tool[] = []): Agent {
  const created = Agent.create({
    name,
    model: AgentModel.Gemma4,
    instruction: "teste",
  });
  tools.forEach((tool) => created.addTool(tool));
  return created;
}

describe("traceSpan", () => {
  it("executa sem tracer e sem abrir spans", async () => {
    const result = await traceSpan(
      { context: undefined, name: "X", runType: "chain", inputs: {} },
      async () => 42,
    );
    expect(result).toBe(42);
  });

  it("encerra o span com erro e propaga a exceção", async () => {
    const tracer = new InMemoryTracer();
    const { runId } = await tracer.startRun({
      name: "root",
      runType: "chain",
      inputs: {},
    });

    await expect(
      traceSpan(
        {
          context: { tracer, parentRunId: runId },
          name: "Falha",
          runType: "tool",
          inputs: {},
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    const [span] = tracer.byName("Falha");
    expect(span?.ended).toBe(true);
    expect(span?.error).toBe("boom");
  });
});

describe("AgentRunner tracing", () => {
  it("monta a árvore agente → LLM → tool call → sub-agente", async () => {
    const tracer = new InMemoryTracer();
    const listProducts = new StubTool("listProducts");
    const specialist = agent("Produtos", [listProducts]);

    const provider = new QueueLlmProvider([
      call("askProducts", { task: "liste o cardápio" }),
      call("listProducts", {}),
      text("cardápio"),
      text("resposta final"),
    ]);
    const runner = new AgentRunner(provider, tracer);

    const coordinator = agent("Coordenador", [
      DelegateAgentTool.create({
        name: "askProducts",
        description: "delega",
        agent: specialist,
        runner,
      }),
    ]);

    const { runId } = await tracer.startRun({
      name: "ChatRequest",
      runType: "chain",
      inputs: {},
    });

    await runner.run({
      agent: coordinator,
      messages: [{ role: "user", content: "oi" }],
      parentRunId: runId,
    });

    const [root] = tracer.byName("ChatRequest");
    const [coordinatorSpan] = tracer.byName("Agent/Coordenador");
    const [delegation] = tracer.byName("ToolCall/askProducts");
    const [specialistSpan] = tracer.byName("Agent/Produtos");
    const [mcpLikeCall] = tracer.byName("ToolCall/listProducts");

    expect(coordinatorSpan?.parentId).toBe(root?.id);
    expect(tracer.childrenOf(coordinatorSpan!).map((span) => span.name)).toEqual([
      "LLM/Coordenador",
      "ToolCall/askProducts",
      "LLM/Coordenador",
    ]);

    expect(delegation?.tags).toContain("kind:delegation");
    expect(specialistSpan?.parentId).toBe(delegation?.id);
    expect(specialistSpan?.tags).toEqual(
      expect.arrayContaining(["sub-agent", "delegated", "via:askProducts"]),
    );
    expect(specialistSpan?.metadata).toMatchObject({
      agentPath: "Coordenador > Produtos",
      depth: 1,
      delegatedBy: "Coordenador",
    });

    expect(mcpLikeCall?.parentId).toBe(specialistSpan?.id);
    expect(listProducts.lastContext?.parentRunId).toBe(mcpLikeCall?.id);
    expect(listProducts.lastContext?.agentPath).toEqual([
      "Coordenador",
      "Produtos",
    ]);

    expect(
      tracer.spans.filter((span) => span !== root).every((span) => span.ended),
    ).toBe(true);
  });

  it("registra tokens no formato usage_metadata do LangSmith", async () => {
    const tracer = new InMemoryTracer();
    const { runId } = await tracer.startRun({
      name: "root",
      runType: "chain",
      inputs: {},
    });

    await new AgentRunner(new QueueLlmProvider([text("oi")]), tracer).run({
      agent: agent("Atendente"),
      messages: [],
      parentRunId: runId,
    });

    const [llm] = tracer.byName("LLM/Atendente");
    expect(llm?.runType).toBe("llm");
    expect(llm?.metadata).toMatchObject({ ls_model_name: AgentModel.Gemma4 });
    expect(llm?.outputs?.["usage_metadata"]).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    });
  });

  it("marca tool calls com erro e o motivo da rejeição", async () => {
    const tracer = new InMemoryTracer();
    const { runId } = await tracer.startRun({
      name: "root",
      runType: "chain",
      inputs: {},
    });

    const failing = new StubTool(
      "createOrder",
      toolError({
        errorCategory: "business",
        message: "sem estoque",
        userFriendlyMessage: "sem estoque",
      }),
    );

    await new AgentRunner(
      new QueueLlmProvider([
        call("createOrder", {}),
        call("naoExiste", {}),
        text("fim"),
      ]),
      tracer,
    ).run({
      agent: agent("Pedidos", [failing]),
      messages: [],
      parentRunId: runId,
    });

    const [business] = tracer.byName("ToolCall/createOrder");
    expect(business?.error).toBe("[business] sem estoque");
    expect(business?.endMetadata).toMatchObject({ outcome: "executed" });

    const [missing] = tracer.byName("ToolCall/naoExiste");
    expect(missing?.tags).toContain("kind:unknown");
    expect(missing?.endMetadata).toMatchObject({ outcome: "tool_not_found" });
  });
});
