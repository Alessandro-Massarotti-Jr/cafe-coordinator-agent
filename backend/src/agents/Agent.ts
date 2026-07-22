import { Tool } from "./Tool";

type Props = {
  name: string;
  instruction: string;
  model: "gemma4";
};

export class Agent {
  private name: string;
  private instruction: string;
  public model: "gemma4" = "gemma4";
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
    return `Seu nome é ${this.name} sua instrução é ${this.instruction}`;
  }
}
