import { Agent } from "../agents/Agent";
import {
  ILlmProvider,
  LlmChatResult,
  LlmStopReason,
  LlmUsage,
  Message,
  ToolCall,
} from "../providers/LlmProvider/interfaces/ILlmProvider";
import {
  IAgentTracingProvider,
  TraceContext,
} from "../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";
import { AgentToolEvent, Tool } from "../agents/Tool";
import { ToolSession } from "../agents/ToolSession";
import {
  ToolResponse,
  normalizeToolResponse,
  toolError,
} from "../agents/ToolResponse";
import { traceSpan } from "./tracing/traceSpan";
import { tracedChat } from "./tracing/tracedChat";

export type PostToolUseHook = (event: {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResponse;
  session?: ToolSession | undefined;
}) => ToolResponse | void | Promise<ToolResponse | void>;

type RunnerOptions = {
  maxIterations?: number;
  noCompletionRetries?: number;
  postToolUse?: PostToolUseHook;
};

type RunParams = {
  agent: Agent;
  messages: Message[];
  parentRunId?: string | undefined;
  label?: string | undefined;
  onEvent?: ((event: AgentToolEvent) => void) | undefined;
  session?: ToolSession | undefined;
  agentPath?: string[] | undefined;
  tags?: string[] | undefined;
  metadata?: Record<string, unknown> | undefined;
};

type LoopParams = RunParams & {
  path: string[];
  trace: TraceContext;
};

type ToolCallOutcome =
  | "executed"
  | "exception"
  | "tool_not_found"
  | "invalid_arguments"
  | "precondition_failed";

type ToolCallResult = {
  message: Message;
  response: ToolResponse;
  toolName: string;
  outcome: ToolCallOutcome;
};

type ToolCallParams = {
  agent: Agent;
  toolCall: ToolCall;
  index: number;
  iteration: number;
  path: string[];
  trace: TraceContext;
  onEvent: ((event: AgentToolEvent) => void) | undefined;
  session: ToolSession | undefined;
};

export type RunResult = {
  content: string;
  usage: LlmUsage;
  stopReason: LlmStopReason;
  degraded: boolean;
  limitReached: boolean;
  iterations: number;
  failures: string[];
};

const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_NO_COMPLETION_RETRIES = 2;

const EMPTY_USAGE: LlmUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

const LIMIT_REACHED_MESSAGE =
  "Não consegui concluir a tarefa dentro do limite de passos disponíveis. Segue o que consegui apurar até aqui:";

const TRUNCATED_MESSAGE =
  "A resposta foi interrompida antes de terminar. Este é um resultado parcial:";

const NO_COMPLETION_MESSAGE =
  "O modelo não produziu resposta. Tente novamente em instantes.";

export class AgentRunner {
  private readonly maxIterations: number;
  private readonly noCompletionRetries: number;
  private readonly postToolUse: PostToolUseHook | undefined;

  constructor(
    private readonly provider: ILlmProvider,
    private readonly tracer?: IAgentTracingProvider,
    options: RunnerOptions = {},
  ) {
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.noCompletionRetries =
      options.noCompletionRetries ?? DEFAULT_NO_COMPLETION_RETRIES;
    this.postToolUse = options.postToolUse;
  }

  public async run(params: RunParams): Promise<RunResult> {
    const { agent, messages, parentRunId, label } = params;
    const agentName = agent.getName();
    const path = [...(params.agentPath ?? []), agentName];

    return traceSpan<RunResult>(
      {
        context: { tracer: this.tracer, parentRunId },
        name: `Agent/${label ?? agentName}`,
        runType: "chain",
        inputs: { messages },
        tags: [
          "agent",
          `agent:${agentName}`,
          path.length > 1 ? "sub-agent" : "root-agent",
          ...(params.tags ?? []),
        ],
        metadata: {
          agent: agentName,
          model: agent.model,
          depth: path.length - 1,
          agentPath: path.join(" > "),
          tools: agent.tools.map((tool) => tool.name),
          sessionId: params.session?.sessionId,
          ...params.metadata,
        },
        describe: (result) => ({
          outputs: {
            message: result.content,
            stopReason: result.stopReason,
            iterations: result.iterations,
            degraded: result.degraded,
            limitReached: result.limitReached,
            failures: result.failures,
            usage: result.usage,
          },
          metadata: {
            stopReason: result.stopReason,
            iterations: result.iterations,
            degraded: result.degraded,
            limitReached: result.limitReached,
          },
        }),
      },
      (trace) => this.loop({ ...params, path, trace }),
    );
  }

  private async loop(params: LoopParams): Promise<RunResult> {
    const { agent, messages, onEvent, session, path, trace } = params;
    const work: Message[] = [...messages];
    const failures: string[] = [];
    const total: LlmUsage = { ...EMPTY_USAGE };

    let iterations = 0;

    const chat = async (): Promise<LlmChatResult> => {
      onEvent?.({ type: "thinking" });
      const result = await this.chatWithRecovery(
        agent,
        work,
        trace,
        iterations,
      );
      total.prompt_tokens += result.usage.prompt_tokens;
      total.completion_tokens += result.usage.completion_tokens;
      total.total_tokens += result.usage.total_tokens;
      return result;
    };

    let response = await chat();
    let limitReached = false;
    let degraded = false;

    while (response.stopReason === "tool_calls") {
      if (iterations >= this.maxIterations) {
        limitReached = true;
        degraded = true;
        failures.push(
          `Limite de ${this.maxIterations} iterações de ferramenta atingido.`,
        );
        break;
      }

      iterations++;
      work.push(response.message);

      const toolCalls = response.message.tool_calls ?? [];
      const results = await Promise.all(
        toolCalls.map((toolCall, index) =>
          this.executeToolCall({
            agent,
            toolCall,
            index,
            iteration: iterations,
            path,
            trace,
            onEvent,
            session,
          }),
        ),
      );

      for (const result of results) {
        work.push(result.message);
        if (result.response.isError) {
          failures.push(`${result.toolName}: ${result.response.message}`);
          if (result.response.errorCategory === "transient") degraded = true;
        }
      }

      response = await chat();
    }

    let content = response.message.content ?? "";

    if (limitReached) {
      content = `${LIMIT_REACHED_MESSAGE}\n${content}`.trim();
    } else if (response.stopReason === "truncated") {
      degraded = true;
      content = `${TRUNCATED_MESSAGE}\n${content}`.trim();
    } else if (response.stopReason === "no_completion" || !content.trim()) {
      degraded = true;
      failures.push("Modelo retornou resposta vazia.");
      content = content.trim() || NO_COMPLETION_MESSAGE;
    }

    return {
      content,
      usage: total,
      stopReason: response.stopReason,
      degraded,
      limitReached,
      iterations,
      failures,
    };
  }

  private async chatWithRecovery(
    agent: Agent,
    messages: Message[],
    trace: TraceContext,
    iteration: number,
  ): Promise<LlmChatResult> {
    const call = (attempt: number) =>
      tracedChat({
        provider: this.provider,
        agent,
        messages: [...messages],
        context: trace,
        tags: attempt > 0 ? ["retry:no_completion"] : [],
        metadata: { iteration, attempt },
      });

    let result = await call(0);

    for (let attempt = 0; attempt < this.noCompletionRetries; attempt++) {
      if (!this.isEmptyCompletion(result)) return result;
      result = await call(attempt + 1);
    }

    if (this.isEmptyCompletion(result)) {
      return { ...result, stopReason: "no_completion" };
    }

    return result;
  }

  private isEmptyCompletion(result: LlmChatResult): boolean {
    if (result.stopReason === "no_completion") return true;
    if (result.stopReason !== "unknown") return false;

    const hasToolCalls = (result.message.tool_calls ?? []).length > 0;
    const hasContent = Boolean(result.message.content?.trim());
    return !hasToolCalls && !hasContent;
  }

  private async executeToolCall(
    params: ToolCallParams,
  ): Promise<ToolCallResult> {
    const { agent, toolCall, index, iteration, path, trace } = params;

    const toolName = toolCall.function.name;
    const toolCallId = toolCall.id ?? `${toolName}-${index}`;
    const tool = agent.tools.find((candidate) => candidate.name === toolName);
    const kind = tool?.kind ?? "unknown";

    return traceSpan<ToolCallResult>(
      {
        context: trace,
        name: `ToolCall/${toolName}`,
        runType: "tool",
        inputs: {
          tool: toolName,
          arguments: toolCall.function.arguments,
          tool_call_id: toolCallId,
        },
        tags: ["tool-call", `tool:${toolName}`, `kind:${kind}`],
        metadata: {
          agent: agent.getName(),
          agentPath: path.join(" > "),
          tool: toolName,
          kind,
          iteration,
          toolCallId,
        },
        describe: (result) => ({
          outputs: { result: result.response },
          error: result.response.isError
            ? `[${result.response.errorCategory ?? "error"}] ${result.response.message}`
            : undefined,
          metadata: {
            outcome: result.outcome,
            isError: result.response.isError,
            errorCategory: result.response.errorCategory ?? null,
          },
        }),
      },
      (toolTrace) =>
        this.invokeTool(params, { toolName, toolCallId, tool, toolTrace }),
    );
  }

  private async invokeTool(
    params: ToolCallParams,
    resolved: {
      toolName: string;
      toolCallId: string;
      tool: Tool | undefined;
      toolTrace: TraceContext;
    },
  ): Promise<ToolCallResult> {
    const { agent, toolCall, path, onEvent, session } = params;
    const { toolName, toolCallId, tool, toolTrace } = resolved;

    onEvent?.({ type: "tool_call", name: toolName });

    const reply = (
      response: ToolResponse,
      outcome: ToolCallOutcome,
    ): ToolCallResult => ({
      toolName,
      response,
      outcome,
      message: {
        role: "tool",
        name: toolName,
        tool_call_id: toolCallId,
        content: JSON.stringify(response),
      } as Message,
    });

    if (!tool) {
      return reply(
        toolError({
          errorCategory: "validation",
          isRetryable: false,
          message: `Ferramenta "${toolName}" não encontrada. Ferramentas disponíveis: ${agent.tools
            .map((candidate) => candidate.name)
            .join(", ")}.`,
          userFriendlyMessage:
            "Não consegui executar essa ação com as ferramentas disponíveis.",
        }),
        "tool_not_found",
      );
    }

    let args: Record<string, unknown>;
    try {
      args = parseArguments(toolCall.function.arguments);
    } catch (error) {
      return reply(
        toolError({
          errorCategory: "validation",
          isRetryable: true,
          message: `Argumentos inválidos para "${toolName}": ${
            error instanceof Error ? error.message : String(error)
          }. Reenvie a chamada com um JSON de argumentos válido.`,
          userFriendlyMessage:
            "Não consegui interpretar os dados dessa solicitação.",
        }),
        "invalid_arguments",
      );
    }

    const precondition = tool.checkPrecondition(args, session);
    if (precondition) return reply(precondition, "precondition_failed");

    let response: ToolResponse;
    let outcome: ToolCallOutcome = "executed";
    try {
      response = normalizeToolResponse(
        await tool.execute(args, {
          ...toolTrace,
          agentPath: path,
          onEvent,
          session,
        }),
      );
    } catch (error) {
      outcome = "exception";
      response = toolError({
        errorCategory: "transient",
        isRetryable: true,
        message: `Falha ao executar "${toolName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        userFriendlyMessage:
          "Tive um problema técnico ao executar essa ação. Posso tentar de novo.",
      });
    }

    session?.record(toolName, args);

    if (this.postToolUse) {
      const hooked = await this.postToolUse({
        toolName,
        args,
        result: response,
        session,
      });
      if (hooked) response = hooked;
    }

    return reply(response, outcome);
  }
}

export function parseArguments(
  raw: Record<string, unknown> | string | undefined,
): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "string") return raw;
  if (raw.trim() === "") return {};

  const parsed = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("os argumentos precisam ser um objeto JSON");
  }

  return parsed as Record<string, unknown>;
}
