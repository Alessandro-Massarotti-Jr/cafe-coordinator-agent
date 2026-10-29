import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Parameter, Tool, ToolContext } from "../../agents/Tool";
import { ToolResponse, isToolResponse, toolError } from "../../agents/ToolResponse";
import { parseMcpResult } from "./parseMcpResult";
import { withRetry } from "../../services/retry";
import { traceSpan } from "../../services/tracing/traceSpan";
import { TraceContext } from "../AgentTracingProvider/interfaces/IAgentTracingProvider";

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

export function callMcpTool(params: {
  client: Client;
  name: string;
  args: Record<string, unknown>;
  trace?: TraceContext | undefined;
}): Promise<unknown> {
  const { client, name, args } = params;
  let attempts = 0;

  return traceSpan<unknown>(
    {
      context: params.trace,
      name: `MCP/${name}`,
      runType: "tool",
      inputs: { tool: name, arguments: args },
      tags: ["mcp", `mcp:${name}`],
      metadata: { transport: "streamable-http", mcpTool: name },
      describe: (result) => ({
        outputs: { result },
        metadata: { attempts },
      }),
    },
    async () => {
      const result = await withRetry(() => {
        attempts++;
        return client.callTool({ name, arguments: args });
      });
      return parseMcpResult(result);
    },
  );
}

export class McpTool extends Tool {
  private readonly client: Client;

  constructor(props: McpToolProps) {
    super({ name: props.name, description: props.description, kind: "mcp" });
    this.client = props.client;
    props.parameters.forEach((parameter) => this.addParameter(parameter));
  }

  public async execute(
    params: any,
    context?: ToolContext,
  ): Promise<ToolResponse<unknown>> {
    const parsed = await callMcpTool({
      client: this.client,
      name: this.name,
      args: (params ?? {}) as Record<string, unknown>,
      trace: context,
    });

    return adaptMcpResponse(this.name, parsed);
  }
}
