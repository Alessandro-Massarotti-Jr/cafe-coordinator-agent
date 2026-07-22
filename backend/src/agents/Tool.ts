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
  ): any | Promise<any>;

  public addParameter(parameter: Parameter) {
    this.parameters.push(parameter);
  }
}
