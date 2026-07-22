import { Agent } from "../../Agent";
import { Tool, ToolContext } from "../../Tool";
import { AgentRunner } from "../../../services/AgentRunner";

type DelegateProps = {
  name: string;
  description: string;
  agent: Agent;
  runner: AgentRunner;
};

export class DelegateAgentTool extends Tool {
  private readonly agent: Agent;
  private readonly runner: AgentRunner;

  private constructor(props: DelegateProps) {
    super({ name: props.name, description: props.description });
    this.agent = props.agent;
    this.runner = props.runner;

    this.addParameter({
      name: "task",
      type: "string",
      description:
        "Descrição clara e autocontida da tarefa ou pergunta para o especialista, incluindo todo o contexto necessário (nome do cliente, produtos, quantidades etc.).",
      required: true,
    });
  }

  public static create(props: DelegateProps): DelegateAgentTool {
    return new DelegateAgentTool(props);
  }

  public async execute({ task }: { task: string }, context?: ToolContext) {
    const messages = [
      { role: "system", content: this.agent.getInstructions() },
      { role: "user", content: task ?? "" },
    ];

    const { content } = await this.runner.run({
      agent: this.agent,
      messages,
      parentRunId: context?.parentRunId,
      label: this.agent.getName(),
      onEvent: context?.onEvent,
    });

    return { specialist: this.agent.getName(), response: content };
  }
}
