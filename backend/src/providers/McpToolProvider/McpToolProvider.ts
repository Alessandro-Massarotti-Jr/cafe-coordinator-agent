import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { Tool } from "../../agents/Tool";
import { McpTool } from "./McpTool";
import { parseMcpResult } from "./parseMcpResult";
import { toParameters } from "./schema";

/**
 * Conecta-se a um servidor MCP via Streamable HTTP, descobre as ferramentas
 * disponíveis e as expõe como instâncias de `Tool` prontas para serem
 * adicionadas a um agente.
 */
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
    await client.connect(transport as Transport);
    this.client = client;
  }

  /**
   * Descobre as ferramentas do servidor MCP e as converte em `Tool[]`.
   * Conecta automaticamente caso ainda não esteja conectado.
   */
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

  /**
   * Chama uma ferramenta do servidor MCP diretamente (sem passar por um agente)
   * e devolve o payload já desserializado. Útil para código do backend que
   * precisa consultar o MCP de forma programática (ex.: validar produtos ao
   * criar um pedido). Conecta automaticamente caso ainda não esteja conectado.
   */
  public async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.connect();
    const result = await this.client!.callTool({ name, arguments: args });
    return parseMcpResult(result);
  }

  public async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }
}
