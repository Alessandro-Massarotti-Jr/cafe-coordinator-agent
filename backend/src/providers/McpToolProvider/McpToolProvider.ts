import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "../../agents/Tool";
import { McpTool, callMcpTool } from "./McpTool";
import { toParameters } from "./schema";
import { withRetry } from "../../services/retry";
import { TraceContext } from "../AgentTracingProvider/interfaces/IAgentTracingProvider";

export class McpToolProvider {
  private readonly url: string;
  private readonly clientName: string;
  private client: Client | undefined;

  constructor(props: { url: string; clientName?: string }) {
    this.url = props.url;
    this.clientName = props.clientName ?? "cafe-coordinator-backend";
  }

  public async connect(): Promise<void> {
    if (this.client) return;
    const client = new Client({ name: this.clientName, version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.url));
    await withRetry(() => client.connect(transport as Transport));
    this.client = client;
  }

  public async loadTools(): Promise<Tool[]> {
    await this.connect();
    const client = this.client!;

    const { tools } = await client.listTools();

    return tools.map(
      (tool) =>
        new McpTool({
          client,
          name: tool.name,
          description: tool.description ?? "",
          parameters: toParameters(tool.inputSchema),
        }),
    );
  }

  public async callTool(
    name: string,
    args: Record<string, unknown> = {},
    trace?: TraceContext,
  ): Promise<unknown> {
    await this.connect();
    return callMcpTool({ client: this.client!, name, args, trace });
  }

  public async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }
}
