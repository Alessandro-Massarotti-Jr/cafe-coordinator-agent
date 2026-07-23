export type EscalationReason =
  | "customer_requested_human"
  | "outside_policy"
  | "beyond_agent_capability"
  | "agent_stuck";

export type CreateEscalationInput = {
  customerName: string;
  reason: EscalationReason;
  scenario: string;
  rootCauseAnalysis: string;
  requestedAction: string;
  recommendations: string[];
  orderId?: string | undefined;
  conversationSummary?: string | undefined;
};

export type Escalation = CreateEscalationInput & {
  protocol: string;
  createdAt: string;
};

export interface IEscalationsRepository {
  create(input: CreateEscalationInput): Escalation;
  findByProtocol(protocol: string): Escalation | undefined;
  findAll(): Escalation[];
}
