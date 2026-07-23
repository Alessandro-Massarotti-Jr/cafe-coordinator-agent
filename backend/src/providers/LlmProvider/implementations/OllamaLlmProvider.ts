import axios, { AxiosInstance } from "axios";
import { Agent } from "../../../agents/Agent";
import {
  ILlmProvider,
  LlmChatResult,
  LlmStopReason,
  Message,
} from "../interfaces/ILlmProvider";
import { Parameter, Tool } from "../../../agents/Tool";
import { withRetry } from "../../../services/retry";

const DEFAULT_NUM_PREDICT = 1024;

export function toStopReason(
  doneReason: string | undefined,
  message: Message | undefined,
): LlmStopReason {
  if (doneReason === "length") return "truncated";
  if (doneReason === "load" || doneReason === "unload") return "no_completion";
  if (message?.tool_calls && message.tool_calls.length > 0) return "tool_calls";
  if (doneReason === "stop") return "end_turn";
  return "unknown";
}

export class OllamaLlmProvider implements ILlmProvider {
  private requester: AxiosInstance;
  private numPredict: number;

  constructor() {
    const baseURL = process.env.OLLAMA_URL as string;
    this.requester = axios.create({ baseURL });
    this.numPredict = Number(
      process.env["OLLAMA_NUM_PREDICT"] ?? DEFAULT_NUM_PREDICT,
    );
  }

  async chat(data: {
    agent: Agent;
    messages: Message[];
  }): Promise<LlmChatResult> {
    const { agent, messages } = data;

    try {
      const response = await withRetry(() =>
        this.requester.post("/chat", {
          model: agent.model,
          messages: messages,
          tools: this.formatTools(agent.tools),
          stream: false,
          options: { num_predict: this.numPredict },
        }),
      );

      const promptTokens: number = response.data.prompt_eval_count ?? 0;
      const completionTokens: number = response.data.eval_count ?? 0;
      const message = (response.data.message ?? {
        role: "assistant",
        content: "",
      }) as Message;

      return {
        message,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        stopReason: toStopReason(response.data.done_reason, message),
      };
    } catch (error) {
      console.error(axios.isAxiosError(error) ? error.response?.data : error);
      throw error;
    }
  }

  private formatTools(tools: Tool[]) {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            tool.parameters.map((p) => [p.name, this.formatParameter(p)]),
          ),
          required: this.getRequiredItems(tool.parameters),
        },
      },
    }));
  }

  private formatParameter(parameter: Parameter): any {
    switch (parameter.type) {
      case "array":
        return {
          type: parameter.type,
          description: parameter.description,
          items: this.formatParameter(parameter.items),
        };
      case "object":
        return {
          type: parameter.type,
          description: parameter.description,
          properties: Object.fromEntries(
            parameter.properties.map((p) => [p.name, this.formatParameter(p)]),
          ),
          required: this.getRequiredItems(parameter.properties),
        };
      default:
        return {
          type: parameter.type,
          description: parameter.description,
        };
    }
  }

  private getRequiredItems(parameters: Parameter[]): string[] {
    return parameters
      .filter((parameter) => parameter.required)
      .map((parameter) => parameter.name);
  }
}
