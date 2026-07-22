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

/**
 * Evento emitido durante a execução de uma tool, usado para dar feedback
 * em tempo real (SSE) ao cliente enquanto o agente trabalha.
 */
export type AgentToolEvent = { type: string; name?: string };

/**
 * Contexto opcional injetado pelo AgentRunner na execução de uma tool.
 * Permite que tools que delegam para sub-agentes propaguem tracing e eventos.
 */
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
