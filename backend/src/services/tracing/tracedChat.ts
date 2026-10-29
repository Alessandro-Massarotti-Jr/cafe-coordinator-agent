import { Agent } from "../../agents/Agent";
import {
  ILlmProvider,
  LlmChatResult,
  Message,
} from "../../providers/LlmProvider/interfaces/ILlmProvider";
import { TraceContext } from "../../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";
import { traceSpan } from "./traceSpan";

export type TracedChatParams = {
  provider: ILlmProvider;
  agent: Agent;
  messages: Message[];
  context: TraceContext | undefined;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export function tracedChat(params: TracedChatParams): Promise<LlmChatResult> {
  const { provider, agent, messages, context } = params;

  return traceSpan<LlmChatResult>(
    {
      context,
      name: `LLM/${agent.getName()}`,
      runType: "llm",
      inputs: {
        messages,
        tools: agent.tools.map((tool) => tool.name),
      },
      tags: ["llm", `model:${agent.model}`, ...(params.tags ?? [])],
      metadata: {
        ls_provider: "ollama",
        ls_model_name: agent.model,
        ls_model_type: "chat",
        agent: agent.getName(),
        ...params.metadata,
      },
      describe: (result) => ({
        outputs: {
          message: result.message,
          stop_reason: result.stopReason,
          tool_calls: (result.message.tool_calls ?? []).map(
            (call) => call.function.name,
          ),
          usage_metadata: {
            input_tokens: result.usage.prompt_tokens,
            output_tokens: result.usage.completion_tokens,
            total_tokens: result.usage.total_tokens,
          },
        },
        metadata: { stop_reason: result.stopReason },
      }),
    },
    () => provider.chat({ agent, messages }),
  );
}
