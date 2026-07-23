import { AgentModel } from "./AgentModel";
import { Tool } from "./Tool";

type Props = {
  name: string;
  instruction: string;
  model: AgentModel;
};

export class Agent {
  private name: string;
  private instruction: string;
  public model: AgentModel;
  public readonly tools: Tool[] = [];

  private constructor(props: Props) {
    this.name = props.name;
    this.instruction = props.instruction;
    this.model = props.model;
  }

  public static create(props: Props): Agent {
    return new Agent(props);
  }

  public addTool(tool: Tool) {
    this.tools.push(tool);
  }

  public getName(): string {
    return this.name;
  }

  public getInstructions(): string {
    return [
      `# Identidade`,
      `Você é ${this.name}.`,
      ``,
      `# Instruções`,
      this.instruction.trim(),
    ].join("\n");
  }
}
