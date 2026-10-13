export type EscalationReason =
  | "customer_requested_human"
  | "outside_policy"
  | "beyond_agent_capability"
  | "agent_stuck";

export type EscalationStatus = "waiting" | "in_progress" | "resolved";

export type CreateEscalationInput = {
  customerName: string;
  reason: EscalationReason;
  scenario: string;
  rootCauseAnalysis: string;
  requestedAction: string;
  recommendations: string[];
  orderId?: string | undefined;
  conversationSummary?: string | undefined;
  sessionId?: string | undefined;
};

export type Escalation = CreateEscalationInput & {
  protocol: string;
  createdAt: string;
  status: EscalationStatus;
  assignee?: string | undefined;
  claimedAt?: string | undefined;
  resolvedAt?: string | undefined;
};

export interface IEscalationsRepository {
  create(input: CreateEscalationInput): Escalation;
  findByProtocol(protocol: string): Escalation | undefined;
  findActiveBySession(sessionId: string): Escalation | undefined;
  findAll(): Escalation[];
  claim(protocol: string, assignee: string): Escalation | undefined;
  resolve(protocol: string): Escalation | undefined;
}
