import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Parameter, Tool, ToolContext } from "../../agents/Tool";
import { parseMcpResult } from "./parseMcpResult";

type McpToolProps = {
  client: Client;
  name: string;
  description: string;
  parameters: Parameter[];
};

/**
 * Adapta uma ferramenta remota exposta por um servidor MCP para a interface
 * `Tool` usada pelos agentes. A execução é encaminhada ao servidor MCP via
 * `callTool`, e o resultado (texto contendo JSON) é desserializado de volta
 * para um objeto — mantendo o mesmo contrato das tools locais.
 */
export class McpTool extends Tool {
  private readonly client: Client;

  constructor(props: McpToolProps) {
    super({ name: props.name, description: props.description });
    this.client = props.client;
    props.parameters.forEach((parameter) => this.addParameter(parameter));
  }

  public async execute(params: any, _context?: ToolContext): Promise<unknown> {
    const result = await this.client.callTool({
      name: this.name,
      arguments: (params ?? {}) as Record<string, unknown>,
    });

    return parseMcpResult(result);
  }
}
