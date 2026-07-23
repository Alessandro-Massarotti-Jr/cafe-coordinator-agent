import { Agent } from "../../../agents/Agent";

export type ToolCall = {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown> | string;
  };
};

export type Message = {
  role: string;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type LlmStopReason =
  | "tool_calls"
  | "end_turn"
  | "truncated"
  | "no_completion"
  | "unknown";

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LlmChatResult {
  message: Message;
  usage: LlmUsage;
  stopReason: LlmStopReason;
}

export interface ILlmProvider {
  chat(data: { agent: Agent; messages: Message[] }): Promise<LlmChatResult>;
}
