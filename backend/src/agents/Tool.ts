import { ToolResponse } from "./ToolResponse";
import { ToolSession } from "./ToolSession";
import { TraceContext } from "../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";

export type Parameter =
  | {
      name: string;
      type: "string" | "number" | "boolean";
      description: string;
      required: boolean;
    }
  | {
      name: string;
      type: "object";
      required: boolean;
      description: string;
      properties: Parameter[];
    }
  | {
      name: string;
      type: "array";
      items: Parameter;
      description: string;
      required: boolean;
    };

export type ToolKind = "local" | "delegation" | "mcp";

type ToolProps = {
  name: string;
  description: string;
  kind?: ToolKind;
};

export type AgentToolEvent = { type: string; name?: string };

export type ToolContext = TraceContext & {
  agentPath?: string[] | undefined;
  onEvent?: ((event: AgentToolEvent) => void) | undefined;
  session?: ToolSession | undefined;
};

export abstract class Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly kind: ToolKind;
  public readonly parameters: Parameter[] = [];

  protected constructor(props: ToolProps) {
    this.name = props.name;
    this.description = props.description;
    this.kind = props.kind ?? "local";
  }

  public abstract execute(
    params: any,
    context?: ToolContext,
  ): Promise<ToolResponse<unknown>>;

  public checkPrecondition(
    _params: any,
    _session?: ToolSession,
  ): ToolResponse<unknown> | null {
    return null;
  }

  public addParameter(parameter: Parameter) {
    this.parameters.push(parameter);
  }
}
