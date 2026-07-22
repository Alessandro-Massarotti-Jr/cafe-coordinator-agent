import { Agent } from "../../../agents/Agent";

export type Message = {
  role: string;
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }>;
};

export interface LlmUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LlmChatResult {
  message: Message;
  usage: LlmUsage;
}

export interface ILlmProvider {
  chat(data: { agent: Agent; messages: Message[] }): Promise<LlmChatResult>;
}
