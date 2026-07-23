import { Agent } from "../agents/Agent";
import { AgentModel } from "../agents/AgentModel";
import { Tool, ToolContext } from "../agents/Tool";
import { ToolSession } from "../agents/ToolSession";
import { ToolResponse, toolError, toolSuccess } from "../agents/ToolResponse";
import {
  ILlmProvider,
  LlmChatResult,
  Message,
} from "../providers/LlmProvider/interfaces/ILlmProvider";
import { AgentRunner, parseArguments } from "./AgentRunner";

class FakeLlmProvider implements ILlmProvider {
  public readonly seen: Message[][] = [];

  constructor(private readonly queue: LlmChatResult[]) {}

  async chat(data: { agent: Agent; messages: Message[] }) {
    this.seen.push([...data.messages]);
    const next = this.queue.shift();
    if (!next) throw new Error("FakeLlmProvider sem respostas na fila");
    return next;
  }
}

const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };

function textReply(content: string): LlmChatResult {
  return {
    message: { role: "assistant", content },
    usage,
    stopReason: "end_turn",
  };
}

function toolReply(
  calls: Array<{ name: string; args: Record<string, unknown> | string }>,
): LlmChatResult {
  return {
    message: {
      role: "assistant",
      content: "",
      tool_calls: calls.map((call, index) => ({
        id: `call-${index}`,
        function: { name: call.name, arguments: call.args },
      })),
    },
    usage,
    stopReason: "tool_calls",
  };
}

class FakeTool extends Tool {
  public calls = 0;

  constructor(
    name: string,
    private readonly handler: (
      params: any,
      context?: ToolContext,
    ) => Promise<ToolResponse<unknown>>,
  ) {
    super({ name, description: `ferramenta ${name}` });
  }

  public async execute(params: any, context?: ToolContext) {
    this.calls++;
    return this.handler(params, context);
  }
}

function makeAgent(tools: Tool[]): Agent {
  const agent = Agent.create({
    name: "Teste",
    model: AgentModel.Gemma4,
    instruction: "instrução de teste",
  });
  tools.forEach((tool) => agent.addTool(tool));
  return agent;
}

const baseMessages: Message[] = [{ role: "user", content: "olá" }];

describe("parseArguments", () => {
  it("aceita objeto já desserializado", () => {
    expect(parseArguments({ a: 1 })).toEqual({ a: 1 });
  });

  it("aceita string JSON válida", () => {
    expect(parseArguments('{"a":1}')).toEqual({ a: 1 });
  });

  it("falha explicitamente em JSON inválido em vez de devolver objeto vazio", () => {
    expect(() => parseArguments('{"a":')).toThrow();
  });

  it("falha quando o JSON não é um objeto", () => {
    expect(() => parseArguments("[1,2]")).toThrow();
  });
});

describe("AgentRunner", () => {
  it("devolve o conteúdo quando o modelo encerra o turno", async () => {
    const runner = new AgentRunner(new FakeLlmProvider([textReply("pronto")]));

    const result = await runner.run({
      agent: makeAgent([]),
      messages: baseMessages,
    });

    expect(result.content).toBe("pronto");
    expect(result.stopReason).toBe("end_turn");
    expect(result.degraded).toBe(false);
  });

  it("identifica a tool na mensagem de resultado", async () => {
    const tool = new FakeTool("getOrder", async () =>
      toolSuccess({ message: "ok", userFriendlyMessage: "ok", data: null }),
    );
    const provider = new FakeLlmProvider([
      toolReply([{ name: "getOrder", args: { orderId: "ORD-0001" } }]),
      textReply("fim"),
    ]);

    await new AgentRunner(provider).run({
      agent: makeAgent([tool]),
      messages: baseMessages,
    });

    const lastContext = provider.seen[provider.seen.length - 1]!;
    const toolMessage = lastContext.find((message) => message.role === "tool")!;

    expect(toolMessage.name).toBe("getOrder");
    expect(toolMessage.tool_call_id).toBe("call-0");
  });

  it("mantém a ordem das tools paralelas independente de quem termina antes", async () => {
    const slow = new FakeTool("slowTool", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return toolSuccess({ message: "lento", userFriendlyMessage: "lento" });
    });
    const fast = new FakeTool("fastTool", async () =>
      toolSuccess({ message: "rapido", userFriendlyMessage: "rapido" }),
    );

    const provider = new FakeLlmProvider([
      toolReply([
        { name: "slowTool", args: {} },
        { name: "fastTool", args: {} },
      ]),
      textReply("fim"),
    ]);

    await new AgentRunner(provider).run({
      agent: makeAgent([slow, fast]),
      messages: baseMessages,
    });

    const lastContext = provider.seen[provider.seen.length - 1]!;
    const toolNames = lastContext
      .filter((message) => message.role === "tool")
      .map((message) => message.name);

    expect(toolNames).toEqual(["slowTool", "fastTool"]);
  });

  it("interrompe o loop no limite de iterações", async () => {
    const tool = new FakeTool("loopTool", async () =>
      toolSuccess({ message: "ok", userFriendlyMessage: "ok" }),
    );
    const provider = new FakeLlmProvider(
      Array.from({ length: 10 }, () => toolReply([{ name: "loopTool", args: {} }])),
    );

    const result = await new AgentRunner(provider, undefined, {
      maxIterations: 3,
    }).run({ agent: makeAgent([tool]), messages: baseMessages });

    expect(result.limitReached).toBe(true);
    expect(result.iterations).toBe(3);
    expect(tool.calls).toBe(3);
    expect(result.content).toContain("limite de passos");
  });

  it("converte exceção de tool em erro transiente sem matar o loop", async () => {
    const tool = new FakeTool("brokenTool", async () => {
      throw new Error("qdrant fora do ar");
    });
    const provider = new FakeLlmProvider([
      toolReply([{ name: "brokenTool", args: {} }]),
      textReply("segui sem esse dado"),
    ]);

    const result = await new AgentRunner(provider).run({
      agent: makeAgent([tool]),
      messages: baseMessages,
    });

    const toolMessage = provider
      .seen[provider.seen.length - 1]!.find((message) => message.role === "tool")!;
    const payload = JSON.parse(toolMessage.content) as ToolResponse;

    expect(payload.isError).toBe(true);
    expect(payload.errorCategory).toBe("transient");
    expect(payload.isRetryable).toBe(true);
    expect(result.content).toBe("segui sem esse dado");
    expect(result.degraded).toBe(true);
  });

  it("responde com erro de validação quando a ferramenta não existe", async () => {
    const provider = new FakeLlmProvider([
      toolReply([{ name: "naoExiste", args: {} }]),
      textReply("fim"),
    ]);

    await new AgentRunner(provider).run({
      agent: makeAgent([]),
      messages: baseMessages,
    });

    const toolMessage = provider
      .seen[provider.seen.length - 1]!.find((message) => message.role === "tool")!;
    const payload = JSON.parse(toolMessage.content) as ToolResponse;

    expect(payload.errorCategory).toBe("validation");
    expect(payload.isRetryable).toBe(false);
  });

  it("não executa a tool quando os argumentos são JSON inválido", async () => {
    const tool = new FakeTool("getOrder", async () =>
      toolSuccess({ message: "ok", userFriendlyMessage: "ok" }),
    );
    const provider = new FakeLlmProvider([
      toolReply([{ name: "getOrder", args: '{"orderId":' }]),
      textReply("fim"),
    ]);

    await new AgentRunner(provider).run({
      agent: makeAgent([tool]),
      messages: baseMessages,
    });

    const toolMessage = provider
      .seen[provider.seen.length - 1]!.find((message) => message.role === "tool")!;
    const payload = JSON.parse(toolMessage.content) as ToolResponse;

    expect(tool.calls).toBe(0);
    expect(payload.errorCategory).toBe("validation");
  });

  it("bloqueia a tool quando a pré-condição não é atendida", async () => {
    class GuardedTool extends FakeTool {
      public override checkPrecondition() {
        return toolError({
          errorCategory: "permission",
          isRetryable: false,
          message: "consulte antes",
          userFriendlyMessage: "consulte antes",
        });
      }
    }

    const tool = new GuardedTool("updateOrderStatus", async () =>
      toolSuccess({ message: "ok", userFriendlyMessage: "ok" }),
    );
    const provider = new FakeLlmProvider([
      toolReply([{ name: "updateOrderStatus", args: {} }]),
      textReply("fim"),
    ]);

    await new AgentRunner(provider).run({
      agent: makeAgent([tool]),
      messages: baseMessages,
    });

    const payload = JSON.parse(
      provider.seen[provider.seen.length - 1]!.find(
        (message) => message.role === "tool",
      )!.content,
    ) as ToolResponse;

    expect(tool.calls).toBe(0);
    expect(payload.errorCategory).toBe("permission");
  });

  it("registra o uso da tool na sessão e aplica o hook PostToolUse", async () => {
    const tool = new FakeTool("getOrder", async () =>
      toolSuccess({ message: "ok", userFriendlyMessage: "ok", data: "cru" }),
    );
    const provider = new FakeLlmProvider([
      toolReply([{ name: "getOrder", args: { orderId: "ORD-0001" } }]),
      textReply("fim"),
    ]);
    const session = new ToolSession("s1");

    await new AgentRunner(provider, undefined, {
      postToolUse: ({ result }) => ({ ...result, data: "filtrado" }),
    }).run({ agent: makeAgent([tool]), messages: baseMessages, session });

    const payload = JSON.parse(
      provider.seen[provider.seen.length - 1]!.find(
        (message) => message.role === "tool",
      )!.content,
    ) as ToolResponse;

    expect(payload.data).toBe("filtrado");
    expect(session.usedWith("getOrder", (args) => args["orderId"] === "ORD-0001")).toBe(
      true,
    );
  });

  it("sinaliza resposta truncada em vez de entregá-la como final", async () => {
    const provider = new FakeLlmProvider([
      {
        message: { role: "assistant", content: "o horário é das 7h às" },
        usage,
        stopReason: "truncated",
      },
    ]);

    const result = await new AgentRunner(provider).run({
      agent: makeAgent([]),
      messages: baseMessages,
    });

    expect(result.degraded).toBe(true);
    expect(result.content).toContain("interrompida");
  });

  it("retenta quando o modelo devolve resposta vazia de load/unload", async () => {
    const empty: LlmChatResult = {
      message: { role: "assistant", content: "" },
      usage,
      stopReason: "no_completion",
    };
    const provider = new FakeLlmProvider([empty, textReply("agora sim")]);

    const result = await new AgentRunner(provider).run({
      agent: makeAgent([]),
      messages: baseMessages,
    });

    expect(result.content).toBe("agora sim");
  });

  it("nunca devolve string vazia ao chamador", async () => {
    const empty: LlmChatResult = {
      message: { role: "assistant", content: "" },
      usage,
      stopReason: "no_completion",
    };
    const provider = new FakeLlmProvider([empty, empty, empty]);

    const result = await new AgentRunner(provider, undefined, {
      noCompletionRetries: 2,
    }).run({ agent: makeAgent([]), messages: baseMessages });

    expect(result.content.trim().length).toBeGreaterThan(0);
    expect(result.degraded).toBe(true);
  });
});
