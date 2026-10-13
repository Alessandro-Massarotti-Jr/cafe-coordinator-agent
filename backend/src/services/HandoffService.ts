import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  Escalation,
  IEscalationsRepository,
} from "../repositories/escalationsRepository/interfaces/IEscalationsRepository";
import { Message } from "../providers/LlmProvider/interfaces/ILlmProvider";

export type TranscriptAuthor = "customer" | "bot" | "human" | "system";

export type TranscriptEntry = {
  id: string;
  sessionId: string;
  author: TranscriptAuthor;
  authorName?: string | undefined;
  content: string;
  at: string;
};

export type HandoffEvent =
  | { type: "message"; sessionId: string; entry: TranscriptEntry }
  | { type: "escalation"; sessionId: string; escalation: Escalation };

export type EscalationSummary = Escalation & {
  lastEntry: TranscriptEntry | null;
  messageCount: number;
};

type ConversationWriter = {
  append(sessionId: string, messages: Message[]): void;
};

export class HandoffError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const CONSOLE_CHANNEL = "console";
const DEFAULT_TRANSCRIPT_TTL_MS = 2 * 60 * 60 * 1_000;

export class HandoffService {
  private readonly emitter = new EventEmitter();
  private readonly transcripts = new Map<string, TranscriptEntry[]>();

  constructor(
    private readonly escalations: IEscalationsRepository,
    private readonly conversations: ConversationWriter,
    private readonly transcriptTtlMs: number = DEFAULT_TRANSCRIPT_TTL_MS,
  ) {
    this.emitter.setMaxListeners(0);
  }

  public record(
    sessionId: string,
    author: TranscriptAuthor,
    content: string,
    authorName?: string,
  ): TranscriptEntry {
    const entry: TranscriptEntry = {
      id: randomUUID(),
      sessionId,
      author,
      authorName,
      content,
      at: new Date().toISOString(),
    };

    const transcript = this.transcripts.get(sessionId) ?? [];
    transcript.push(entry);
    this.transcripts.set(sessionId, transcript);

    this.publish({ type: "message", sessionId, entry });
    return entry;
  }

  public transcript(sessionId: string): TranscriptEntry[] {
    return [...(this.transcripts.get(sessionId) ?? [])];
  }

  public activeEscalation(sessionId: string): Escalation | undefined {
    return this.escalations.findActiveBySession(sessionId);
  }

  public isWithHuman(sessionId: string): boolean {
    return this.activeEscalation(sessionId) !== undefined;
  }

  public announceEscalation(escalation: Escalation): void {
    this.publishEscalation(escalation);
  }

  public receiveFromCustomer(sessionId: string, content: string): TranscriptEntry {
    this.conversations.append(sessionId, [{ role: "user", content }]);
    return this.record(sessionId, "customer", content);
  }

  public listEscalations(): EscalationSummary[] {
    return this.escalations
      .findAll()
      .map((escalation) => {
        const transcript = escalation.sessionId
          ? this.transcript(escalation.sessionId)
          : [];
        return {
          ...escalation,
          lastEntry: transcript[transcript.length - 1] ?? null,
          messageCount: transcript.length,
        };
      })
      .reverse();
  }

  public details(protocol: string): {
    escalation: Escalation;
    transcript: TranscriptEntry[];
  } {
    const escalation = this.require(protocol);
    return {
      escalation,
      transcript: escalation.sessionId
        ? this.transcript(escalation.sessionId)
        : [],
    };
  }

  public claim(protocol: string, agentName: string): Escalation {
    const current = this.require(protocol);
    const name = this.requireName(agentName);

    if (current.status === "resolved") {
      throw new HandoffError("Atendimento já encerrado.", 409);
    }
    if (current.status === "in_progress" && current.assignee !== name) {
      throw new HandoffError(
        `Atendimento já assumido por ${current.assignee}.`,
        409,
      );
    }
    if (current.status === "in_progress") return current;

    const escalation = this.escalations.claim(current.protocol, name)!;
    this.publishEscalation(escalation);
    if (escalation.sessionId) {
      this.record(
        escalation.sessionId,
        "system",
        `${name} entrou na conversa.`,
        name,
      );
    }
    return escalation;
  }

  public reply(
    protocol: string,
    agentName: string,
    content: string,
  ): TranscriptEntry {
    const escalation = this.require(protocol);
    const name = this.requireName(agentName);
    const text = content.trim();

    if (!text) throw new HandoffError("Mensagem vazia.", 400);
    if (escalation.status !== "in_progress") {
      throw new HandoffError("Assuma o atendimento antes de responder.", 409);
    }
    if (escalation.assignee !== name) {
      throw new HandoffError(
        `Atendimento pertence a ${escalation.assignee}.`,
        403,
      );
    }
    if (!escalation.sessionId) {
      throw new HandoffError("Escalação sem conversa vinculada.", 422);
    }

    this.conversations.append(escalation.sessionId, [
      { role: "assistant", content: text },
    ]);
    return this.record(escalation.sessionId, "human", text, name);
  }

  public resolve(protocol: string, agentName: string): Escalation {
    const current = this.require(protocol);
    const name = this.requireName(agentName);

    if (current.status === "resolved") return current;
    if (current.status === "in_progress" && current.assignee !== name) {
      throw new HandoffError(
        `Atendimento pertence a ${current.assignee}.`,
        403,
      );
    }

    const escalation = this.escalations.resolve(current.protocol)!;
    this.publishEscalation(escalation);
    if (escalation.sessionId) {
      this.record(
        escalation.sessionId,
        "system",
        "Atendimento humano encerrado. O assistente virtual volta a responder.",
        name,
      );
    }
    return escalation;
  }

  public subscribeSession(
    sessionId: string,
    listener: (event: HandoffEvent) => void,
  ): () => void {
    const channel = this.sessionChannel(sessionId);
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  public subscribeConsole(listener: (event: HandoffEvent) => void): () => void {
    this.emitter.on(CONSOLE_CHANNEL, listener);
    return () => this.emitter.off(CONSOLE_CHANNEL, listener);
  }

  public prune(now: number = Date.now()): void {
    for (const [sessionId, transcript] of this.transcripts) {
      const last = transcript[transcript.length - 1];
      const idle = !last || now - Date.parse(last.at) > this.transcriptTtlMs;
      if (idle && !this.isWithHuman(sessionId)) {
        this.transcripts.delete(sessionId);
      }
    }
  }

  private publishEscalation(escalation: Escalation): void {
    if (!escalation.sessionId) return;
    this.publish({
      type: "escalation",
      sessionId: escalation.sessionId,
      escalation,
    });
  }

  private publish(event: HandoffEvent): void {
    this.emitter.emit(this.sessionChannel(event.sessionId), event);
    this.emitter.emit(CONSOLE_CHANNEL, event);
  }

  private sessionChannel(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private require(protocol: string): Escalation {
    const escalation = this.escalations.findByProtocol(protocol);
    if (!escalation) {
      throw new HandoffError(`Protocolo ${protocol} não encontrado.`, 404);
    }
    return escalation;
  }

  private requireName(agentName: string): string {
    const name = String(agentName ?? "").trim();
    if (!name) throw new HandoffError("Informe o nome do atendente.", 400);
    return name;
  }
}
