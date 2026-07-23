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
    };

    this.escalations.push(escalation);
    return { ...escalation };
  }

  public findByProtocol(protocol: string): Escalation | undefined {
    const escalation = this.escalations.find(
      (candidate) =>
        candidate.protocol.toLowerCase() === protocol.trim().toLowerCase(),
    );
    return escalation ? { ...escalation } : undefined;
  }

  public findAll(): Escalation[] {
    return this.escalations.map((escalation) => ({ ...escalation }));
  }
}
