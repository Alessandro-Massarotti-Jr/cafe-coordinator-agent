import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Parameter, Tool, ToolContext } from "../../agents/Tool";
import { ToolResponse, isToolResponse, toolError } from "../../agents/ToolResponse";
import { parseMcpResult } from "./parseMcpResult";
import { withRetry } from "../../services/retry";

type McpToolProps = {
  client: Client;
  name: string;
  description: string;
  parameters: Parameter[];
};

export function adaptMcpResponse(
  toolName: string,
  parsed: unknown,
): ToolResponse<unknown> {
  if (isToolResponse(parsed)) return parsed;

  return toolError({
    errorCategory: "transient",
    isRetryable: true,
    message: `A ferramenta "${toolName}" respondeu fora do contrato esperado: ${JSON.stringify(
      parsed,
    )}`,
    userFriendlyMessage:
      "O serviço de catálogo respondeu de forma inesperada. Posso tentar novamente.",
  });
}

export class McpTool extends Tool {
  private readonly client: Client;

  constructor(props: McpToolProps) {
    super({ name: props.name, description: props.description });
    this.client = props.client;
    props.parameters.forEach((parameter) => this.addParameter(parameter));
  }

  public async execute(
    params: any,
    _context?: ToolContext,
  ): Promise<ToolResponse<unknown>> {
    const result = await withRetry(() =>
      this.client.callTool({
        name: this.name,
        arguments: (params ?? {}) as Record<string, unknown>,
      }),
    );

    return adaptMcpResponse(this.name, parseMcpResult(result));
  }
}
