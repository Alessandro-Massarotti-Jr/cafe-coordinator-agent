import { Agent } from "../agents/Agent";
import {
  ILlmProvider,
  Message,
} from "../providers/LlmProvider/interfaces/ILlmProvider";
import {
  ContextCompactor,
  extractDisambiguationMetadata,
} from "./ContextCompactor";
import { ConversationStore } from "./ConversationStore";

function provider(summary: string): ILlmProvider {
  return {
    chat: async (_data: { agent: Agent; messages: Message[] }) => ({
      message: { role: "assistant", content: summary },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      stopReason: "end_turn" as const,
    }),
  };
}

function turns(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `mensagem ${index}`,
  }));
}

describe("extractDisambiguationMetadata", () => {
  it("preserva códigos, valores, datas e horários", () => {
    const found = extractDisambiguationMetadata([
      {
        role: "assistant",
        content:
          "Pedido ORD-0007 com PROD-014 custou R$ 42,50 em 12/03/2026 às 19h30. Protocolo ESC-0002.",
      },
    ]);

    expect(found).toEqual(
      expect.arrayContaining([
        "ORD-0007",
        "PROD-014",
        "R$ 42,50",
        "12/03/2026",
        "ESC-0002",
      ]),
    );
  });
});

describe("ContextCompactor", () => {
  it("não compacta conversas curtas", async () => {
    const compactor = new ContextCompactor(provider("resumo"));

    expect(await compactor.compact({ messages: turns(4) })).toBeNull();
  });

  it("resume as mensagens antigas e mantém as recentes", async () => {
    const compactor = new ContextCompactor(provider("resumo do atendimento"), {
      maxMessages: 10,
      keepRecent: 4,
    });

    const result = await compactor.compact({ messages: turns(30) });

    expect(result).not.toBeNull();
    expect(result!.recent).toHaveLength(4);
    expect(result!.recent[0]?.content).toBe("mensagem 26");
    expect(result!.summary).toContain("resumo do atendimento");
  });

  it("anexa os metadados de desambiguação ao resumo", async () => {
    const compactor = new ContextCompactor(provider("resumo"), {
      maxMessages: 4,
      keepRecent: 2,
    });

    const messages: Message[] = [
      ...turns(6),
      { role: "assistant", content: "Criei o pedido ORD-0003 de R$ 30,00." },
      ...turns(2),
    ];

    const result = await compactor.compact({ messages });

    expect(result!.summary).toContain("ORD-0003");
    expect(result!.summary).toContain("R$ 30,00");
  });

  it("cai para um recorte da conversa quando o modelo falha", async () => {
    const failing: ILlmProvider = {
      chat: async () => {
        throw new Error("ollama fora do ar");
      },
    };
    const compactor = new ContextCompactor(failing, {
      maxMessages: 4,
      keepRecent: 2,
    });

    const result = await compactor.compact({ messages: turns(20) });

    expect(result!.summary.length).toBeGreaterThan(0);
  });
});

describe("ConversationStore", () => {
  it("coloca o resumo antes das mensagens recentes", async () => {
    const compactor = new ContextCompactor(provider("resumo"), {
      maxMessages: 6,
      keepRecent: 2,
    });
    const store = new ConversationStore(compactor);

    store.append("s1", turns(20));
    await store.compactIfNeeded("s1");

    const context = store.buildContext({
      sessionId: "s1",
      systemPrompt: "prompt do coordenador",
    });

    expect(context[0]?.role).toBe("system");
    expect(context[1]?.content).toContain("Resumo da conversa");
    expect(context.filter((message) => message.role !== "system")).toHaveLength(2);
  });

  it("injeta a memória do cliente antes do resumo", () => {
    const store = new ConversationStore();
    store.append("s1", turns(2));

    const context = store.buildContext({
      sessionId: "s1",
      systemPrompt: "prompt",
      customerMemory: "cliente Ana costuma pedir espresso",
    });

    expect(context[1]?.content).toContain("Ana");
  });

  it("identifica sessão nova", () => {
    const store = new ConversationStore();

    expect(store.isNew("s1")).toBe(true);
    store.getOrCreate("s1");
    expect(store.isNew("s1")).toBe(false);
  });

  it("remove conversas expiradas", () => {
    const store = new ConversationStore(undefined, 1_000);
    store.append("s1", turns(2));

    store.prune(Date.now() + 5_000);

    expect(store.isNew("s1")).toBe(true);
  });
});
