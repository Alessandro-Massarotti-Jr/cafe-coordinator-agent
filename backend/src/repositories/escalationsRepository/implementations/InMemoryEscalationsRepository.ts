import {
  CreateEscalationInput,
  Escalation,
  IEscalationsRepository,
} from "../interfaces/IEscalationsRepository";

export class InMemoryEscalationsRepository implements IEscalationsRepository {
  private escalations: Escalation[] = [];
  private sequence = 1;
  private static instance: InMemoryEscalationsRepository;

  private constructor() {}

  public static getInstance(): InMemoryEscalationsRepository {
    if (!InMemoryEscalationsRepository.instance) {
      InMemoryEscalationsRepository.instance =
        new InMemoryEscalationsRepository();
    }
    return InMemoryEscalationsRepository.instance;
  }

  public create(input: CreateEscalationInput): Escalation {
    const escalation: Escalation = {
      ...input,
      protocol: `ESC-${String(this.sequence++).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
      status: "waiting",
    };

    this.escalations.push(escalation);
    return { ...escalation };
  }

  public findByProtocol(protocol: string): Escalation | undefined {
    const escalation = this.find(protocol);
    return escalation ? { ...escalation } : undefined;
  }

  public findActiveBySession(sessionId: string): Escalation | undefined {
    const escalation = [...this.escalations]
      .reverse()
      .find(
        (candidate) =>
          candidate.sessionId === sessionId && candidate.status !== "resolved",
      );
    return escalation ? { ...escalation } : undefined;
  }

  public findAll(): Escalation[] {
    return this.escalations.map((escalation) => ({ ...escalation }));
  }

  public claim(protocol: string, assignee: string): Escalation | undefined {
    const escalation = this.find(protocol);
    if (!escalation) return undefined;

    escalation.status = "in_progress";
    escalation.assignee = assignee;
    escalation.claimedAt = new Date().toISOString();
    return { ...escalation };
  }

  public resolve(protocol: string): Escalation | undefined {
    const escalation = this.find(protocol);
    if (!escalation) return undefined;

    escalation.status = "resolved";
    escalation.resolvedAt = new Date().toISOString();
    return { ...escalation };
  }

  private find(protocol: string): Escalation | undefined {
    return this.escalations.find(
      (candidate) =>
        candidate.protocol.toLowerCase() === protocol.trim().toLowerCase(),
    );
  }
}
