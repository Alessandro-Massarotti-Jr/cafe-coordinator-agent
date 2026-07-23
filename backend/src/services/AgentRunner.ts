import { Agent } from "../agents/Agent";
import {
  ILlmProvider,
  LlmChatResult,
  LlmStopReason,
  LlmUsage,
  Message,
  ToolCall,
} from "../providers/LlmProvider/interfaces/ILlmProvider";
import { IAgentTracingProvider } from "../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";
import { AgentToolEvent } from "../agents/Tool";
import { ToolSession } from "../agents/ToolSession";
import {
  ToolResponse,
  normalizeToolResponse,
  toolError,
} from "../agents/ToolResponse";

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

  public async run({
    agent,
    messages,
    parentRunId,
    label,
    onEvent,
    session,
  }: RunParams): Promise<RunResult> {
    const work: Message[] = [...messages];
    const runName = label ?? agent.getName();
    const failures: string[] = [];

    let runId: string | undefined;
    if (this.tracer && parentRunId) {
      ({ runId } = await this.tracer.startChildRun({
        parentRunId,
        name: runName,
        runType: "llm",
        inputs: { messages: work },
      }));
    }

    const childParentId = runId ?? parentRunId;
    const total: LlmUsage = { ...EMPTY_USAGE };

    const chat = async (): Promise<LlmChatResult> => {
      onEvent?.({ type: "thinking" });
      const result = await this.chatWithRecovery(agent, work);
      total.prompt_tokens += result.usage.prompt_tokens;
      total.completion_tokens += result.usage.completion_tokens;
      total.total_tokens += result.usage.total_tokens;
      return result;
    };

    let response = await chat();
    let iterations = 0;
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
            parentRunId: childParentId,
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

    if (this.tracer && runId) {
      await this.tracer.endChildRun({
        childRunId: runId,
        outputs: { message: content },
        extra: { usage: total, stopReason: response.stopReason, degraded },
      });
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
  ): Promise<LlmChatResult> {
    let result = await this.provider.chat({ agent, messages });

    for (let attempt = 0; attempt < this.noCompletionRetries; attempt++) {
      if (!this.isEmptyCompletion(result)) return result;
      result = await this.provider.chat({ agent, messages });
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

  private async executeToolCall(params: {
    agent: Agent;
    toolCall: ToolCall;
    index: number;
    parentRunId: string | undefined;
    onEvent: ((event: AgentToolEvent) => void) | undefined;
    session: ToolSession | undefined;
  }): Promise<{ message: Message; response: ToolResponse; toolName: string }> {
    const { agent, toolCall, index, parentRunId, onEvent, session } = params;

    const toolName = toolCall.function.name;
    const toolCallId = toolCall.id ?? `${toolName}-${index}`;

    onEvent?.({ type: "tool_call", name: toolName });

    const reply = (response: ToolResponse) => ({
      toolName,
      response,
      message: {
        role: "tool",
        name: toolName,
        tool_call_id: toolCallId,
        content: JSON.stringify(response),
      } as Message,
    });

    const tool = agent.tools.find((candidate) => candidate.name === toolName);

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
      );
    }

    const precondition = tool.checkPrecondition(args, session);
    if (precondition) return reply(precondition);

    let toolRunId: string | undefined;
    if (this.tracer && parentRunId) {
      ({ runId: toolRunId } = await this.tracer.startChildRun({
        parentRunId,
        name: `Tool/${toolName}`,
        runType: "tool",
        inputs: { args },
      }));
    }

    let response: ToolResponse;
    try {
      response = normalizeToolResponse(
        await tool.execute(args, { parentRunId, onEvent, session }),
      );
    } catch (error) {
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

    if (this.tracer && toolRunId) {
      await this.tracer.endChildRun({
        childRunId: toolRunId,
        outputs: { result: response },
      });
    }

    return reply(response);
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
