import { Agent } from "../agents/Agent";
import {
  ILlmProvider,
  LlmUsage,
  Message,
} from "../providers/LlmProvider/interfaces/ILlmProvider";
import { IAgentTracingProvider } from "../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";
import { AgentToolEvent } from "../agents/Tool";

type RunParams = {
  agent: Agent;
  messages: Message[];
  parentRunId?: string | undefined;
  label?: string | undefined;
  onEvent?: ((event: AgentToolEvent) => void) | undefined;
};

type RunResult = {
  content: string;
  usage: LlmUsage;
};

const EMPTY_USAGE: LlmUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

export class AgentRunner {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly tracer?: IAgentTracingProvider,
  ) {}

  public async run({
    agent,
    messages,
    parentRunId,
    label,
    onEvent,
  }: RunParams): Promise<RunResult> {
    const work: Message[] = [...messages];
    const runName = label ?? agent.getName();

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

    onEvent?.({ type: "thinking" });
    let { message, usage } = await this.provider.chat({
      agent,
      messages: work,
    });
    const total: LlmUsage = { ...usage };

    while (message.tool_calls && message.tool_calls.length > 0) {
      work.push(message);

      await Promise.all(
        message.tool_calls.map(async (toolCall) => {
          const toolName = toolCall.function.name;
          onEvent?.({ type: "tool_call", name: toolName });

          const tool = agent.tools.find((t) => t.name === toolName);
          const args =
            typeof toolCall.function.arguments === "string"
              ? safeParse(toolCall.function.arguments)
              : toolCall.function.arguments;

          let toolRunId: string | undefined;
          if (this.tracer && childParentId) {
            ({ runId: toolRunId } = await this.tracer.startChildRun({
              parentRunId: childParentId,
              name: `Tool/${toolName}`,
              runType: "tool",
              inputs: { args },
            }));
          }

          const result = tool
            ? await tool.execute(args, {
                parentRunId: childParentId,
                onEvent,
              })
            : { error: `Ferramenta "${toolName}" não encontrada.` };

          if (this.tracer && toolRunId) {
            await this.tracer.endChildRun({
              childRunId: toolRunId,
              outputs: { result },
            });
          }

          work.push({ role: "tool", content: JSON.stringify(result) });
        }),
      );

      onEvent?.({ type: "thinking" });
      const next = await this.provider.chat({ agent, messages: work });
      message = next.message;
      total.prompt_tokens += next.usage.prompt_tokens;
      total.completion_tokens += next.usage.completion_tokens;
      total.total_tokens += next.usage.total_tokens;
    }

    if (this.tracer && runId) {
      await this.tracer.endChildRun({
        childRunId: runId,
        outputs: { message: message.content },
        extra: { usage: total },
      });
    }

    return { content: message.content ?? "", usage: total ?? EMPTY_USAGE };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
