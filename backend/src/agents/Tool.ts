import { ToolResponse } from "./ToolResponse";
import { ToolSession } from "./ToolSession";

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

type ToolProps = {
  name: string;
  description: string;
};

export type AgentToolEvent = { type: string; name?: string };

export type ToolContext = {
  parentRunId?: string | undefined;
  onEvent?: ((event: AgentToolEvent) => void) | undefined;
  session?: ToolSession | undefined;
};

export abstract class Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: Parameter[] = [];

  protected constructor(props: ToolProps) {
    this.name = props.name;
    this.description = props.description;
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
