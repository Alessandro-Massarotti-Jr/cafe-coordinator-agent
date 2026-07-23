import { Message } from "../providers/LlmProvider/interfaces/ILlmProvider";
import { ContextCompactor } from "./ContextCompactor";

export type Conversation = {
  sessionId: string;
  customerId: string | null;
  summary: string | null;
  messages: Message[];
  updatedAt: number;
};

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1_000;

export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  constructor(
    private readonly compactor?: ContextCompactor,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  public getOrCreate(sessionId: string, customerId?: string): Conversation {
    const existing = this.conversations.get(sessionId);

    if (existing) {
      if (customerId) existing.customerId = customerId;
      existing.updatedAt = Date.now();
      return existing;
    }

    const conversation: Conversation = {
      sessionId,
      customerId: customerId ?? null,
      summary: null,
      messages: [],
      updatedAt: Date.now(),
    };

    this.conversations.set(sessionId, conversation);
    return conversation;
  }

  public isNew(sessionId: string): boolean {
    return !this.conversations.has(sessionId);
  }

  public append(sessionId: string, messages: Message[]): void {
    const conversation = this.getOrCreate(sessionId);
    conversation.messages.push(...messages);
    conversation.updatedAt = Date.now();
  }

  public replaceTurns(sessionId: string, messages: Message[]): void {
    const conversation = this.getOrCreate(sessionId);
    conversation.messages = [...messages];
    conversation.updatedAt = Date.now();
  }

  public async compactIfNeeded(sessionId: string): Promise<boolean> {
    const conversation = this.conversations.get(sessionId);
    if (!conversation || !this.compactor) return false;

    const result = await this.compactor.compact({
      messages: conversation.messages,
      previousSummary: conversation.summary ?? undefined,
    });

    if (!result) return false;

    conversation.summary = result.summary;
    conversation.messages = result.recent;
    return true;
  }

  public buildContext(params: {
    sessionId: string;
    systemPrompt: string;
    customerMemory?: string | null;
  }): Message[] {
    const conversation = this.getOrCreate(params.sessionId);
    const context: Message[] = [
      { role: "system", content: params.systemPrompt },
    ];

    if (params.customerMemory) {
      context.push({ role: "system", content: params.customerMemory });
    }

    if (conversation.summary) {
      context.push({
        role: "system",
        content: `# Resumo da conversa até aqui\n${conversation.summary}`,
      });
    }

    context.push(...conversation.messages);
    return context;
  }

  public prune(now: number = Date.now()): void {
    for (const [sessionId, conversation] of this.conversations) {
      if (now - conversation.updatedAt > this.ttlMs) {
        this.conversations.delete(sessionId);
      }
    }
  }
}
