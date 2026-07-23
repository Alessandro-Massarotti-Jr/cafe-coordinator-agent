import { Tool } from "../../Tool";
import { ToolResponse, toolError, toolSuccess } from "../../ToolResponse";
import {
  Escalation,
  EscalationReason,
  IEscalationsRepository,
} from "../../../repositories/escalationsRepository/interfaces/IEscalationsRepository";

const VALID_REASONS: EscalationReason[] = [
  "customer_requested_human",
  "outside_policy",
  "beyond_agent_capability",
  "agent_stuck",
];

type EscalateParams = {
  customerName?: string;
  reason?: string;
  scenario?: string;
  rootCauseAnalysis?: string;
  requestedAction?: string;
  recommendations?: string[];
  orderId?: string;
  conversationSummary?: string;
};

export class EscalateToHumanTool extends Tool {
  private escalations: IEscalationsRepository;

  private constructor(escalations: IEscalationsRepository) {
    super({
      name: "escalateToHuman",
      description:
        "Transfere o atendimento para um atendente humano e gera um protocolo. Use APENAS quando: o cliente pedir explicitamente por um humano; a situação estiver fora da política do agente (ex.: reembolso de pedido já entregue, reclamação jurídica); a ação necessária estiver além da capacidade das ferramentas disponíveis; ou você já tentou resolver e continua travado. NÃO use por frustração do cliente, por a mensagem ter vários assuntos, por baixa confiança sua, nem por a tarefa ser complexa mas dentro da política.",
    });

    this.escalations = escalations;

    this.addParameter({
      name: "customerName",
      type: "string",
      description: "Nome do cliente (use 'não informado' se não souber)",
      required: true,
    });
    this.addParameter({
      name: "reason",
      type: "string",
      description: `Motivo da escalação: ${VALID_REASONS.join(", ")}`,
      required: true,
    });
    this.addParameter({
      name: "scenario",
      type: "string",
      description:
        "Descrição objetiva do cenário e dos dados do cliente relevantes para o atendente humano",
      required: true,
    });
    this.addParameter({
      name: "rootCauseAnalysis",
      type: "string",
      description:
        "Análise de causa raiz: o que originou a situação e o que já foi tentado",
      required: true,
    });
    this.addParameter({
      name: "requestedAction",
      type: "string",
      description: "Ação que o cliente está pedindo, nas palavras dele",
      required: true,
    });
    this.addParameter({
      name: "recommendations",
      type: "array",
      description: "Recomendações de solução para o atendente humano",
      required: true,
      items: {
        name: "recommendation",
        type: "string",
        description: "Uma recomendação de solução",
        required: true,
      },
    });
    this.addParameter({
      name: "orderId",
      type: "string",
      description: "Código do pedido relacionado, se houver (ex.: ORD-0001)",
      required: false,
    });
    this.addParameter({
      name: "conversationSummary",
      type: "string",
      description: "Resumo do que já foi conversado com o cliente",
      required: false,
    });
  }

  public static create(
    escalations: IEscalationsRepository,
  ): EscalateToHumanTool {
    return new EscalateToHumanTool(escalations);
  }

  public async execute(
    params: EscalateParams,
  ): Promise<ToolResponse<Escalation>> {
    const missing = (
      [
        "customerName",
        "reason",
        "scenario",
        "rootCauseAnalysis",
        "requestedAction",
      ] as const
    ).filter((field) => !String(params?.[field] ?? "").trim());

    if (missing.length > 0) {
      return toolError({
        errorCategory: "validation",
        isRetryable: true,
        message: `Escalação incompleta. Campos obrigatórios ausentes: ${missing.join(", ")}.`,
        userFriendlyMessage:
          "Preciso de mais alguns detalhes antes de transferir o atendimento.",
      });
    }

    if (!VALID_REASONS.includes(params.reason as EscalationReason)) {
      return toolError({
        errorCategory: "validation",
        isRetryable: true,
        message: `Motivo "${params.reason}" inválido. Use um destes: ${VALID_REASONS.join(", ")}.`,
        userFriendlyMessage:
          "Preciso classificar corretamente o motivo da transferência.",
      });
    }

    const escalation = this.escalations.create({
      customerName: params.customerName!,
      reason: params.reason as EscalationReason,
      scenario: params.scenario!,
      rootCauseAnalysis: params.rootCauseAnalysis!,
      requestedAction: params.requestedAction!,
      recommendations: Array.isArray(params.recommendations)
        ? params.recommendations
        : [],
      orderId: params.orderId,
      conversationSummary: params.conversationSummary,
    });

    return toolSuccess({
      message: `Escalação ${escalation.protocol} registrada (motivo: ${escalation.reason}). Informe o protocolo ao cliente.`,
      userFriendlyMessage: `Transferi seu atendimento para um de nossos atendentes. Seu protocolo é ${escalation.protocol}.`,
      data: escalation,
    });
  }
}
