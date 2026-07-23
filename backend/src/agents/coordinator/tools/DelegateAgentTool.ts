import { Agent } from "../../Agent";
import { Tool, ToolContext } from "../../Tool";
import { ToolResponse, toolError, toolSuccess } from "../../ToolResponse";
import { AgentRunner } from "../../../services/AgentRunner";

type DelegateProps = {
  name: string;
  description: string;
  agent: Agent;
  runner: AgentRunner;
};

type DelegateData = {
  specialist: string;
  task: string;
  response: string | null;
  partialResults: string[];
  failures: string[];
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
        "Descrição clara e autocontida da tarefa ou pergunta para o especialista, incluindo todo o contexto necessário (nome do cliente, produtos, quantidades etc.). O especialista NÃO tem acesso ao histórico da conversa.",
      required: true,
    });
  }

  public static create(props: DelegateProps): DelegateAgentTool {
    return new DelegateAgentTool(props);
  }

  public async execute(
    { task }: { task: string },
    context?: ToolContext,
  ): Promise<ToolResponse<DelegateData>> {
    const specialist = this.agent.getName();
    const requestedTask = task ?? "";

    if (!requestedTask.trim()) {
      return toolError<DelegateData>({
        errorCategory: "validation",
        isRetryable: true,
        message: `Nenhuma tarefa foi enviada ao especialista ${specialist}. Reenvie com o campo 'task' preenchido e autocontido.`,
        userFriendlyMessage: "Preciso detalhar melhor o que consultar.",
      });
    }

    const messages = [
      { role: "system", content: this.agent.getInstructions() },
      { role: "user", content: requestedTask },
    ];

    try {
      const result = await this.runner.run({
        agent: this.agent,
        messages,
        parentRunId: context?.parentRunId,
        label: specialist,
        onEvent: context?.onEvent,
        session: context?.session,
      });

      const data: DelegateData = {
        specialist,
        task: requestedTask,
        response: result.content,
        partialResults: result.content ? [result.content] : [],
        failures: result.failures,
      };

      if (result.degraded || result.limitReached) {
        return {
          isError: false,
          errorCategory: null,
          isRetryable: false,
          message: `O especialista ${specialist} entregou um resultado PARCIAL. Falhas: ${result.failures.join(
            " | ",
          )}. Use o que foi obtido e informe ao cliente o que não pôde ser confirmado.`,
          userFriendlyMessage:
            "Consegui apenas parte dessa informação no momento.",
          data,
        };
      }

      return toolSuccess({
        message: `Resposta do especialista ${specialist}.`,
        userFriendlyMessage: "Consulta concluída com o especialista.",
        data,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return toolError<DelegateData>({
        errorCategory: "transient",
        isRetryable: true,
        message: [
          `O especialista ${specialist} falhou e não concluiu a tarefa.`,
          `Tarefa tentada: ${requestedTask}`,
          `Resultados parciais: nenhum.`,
          `Falha: ${reason}`,
          `Siga com os outros especialistas e componha uma resposta parcial explicando o que ficou indisponível.`,
        ].join("\n"),
        userFriendlyMessage: `No momento não consigo consultar ${specialist}.`,
        data: {
          specialist,
          task: requestedTask,
          response: null,
          partialResults: [],
          failures: [reason],
        },
      });
    }
  }
}
