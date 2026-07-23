import { Agent } from "../agents/Agent";
import { AgentModel } from "../agents/AgentModel";
import {
  ILlmProvider,
  Message,
} from "../providers/LlmProvider/interfaces/ILlmProvider";

export type CompactorOptions = {
  maxMessages?: number;
  maxChars?: number;
  keepRecent?: number;
  model?: AgentModel;
};

export type CompactionResult = {
  summary: string;
  recent: Message[];
};

const DEFAULT_MAX_MESSAGES = 20;
const DEFAULT_MAX_CHARS = 12_000;
const DEFAULT_KEEP_RECENT = 8;

const METADATA_PATTERNS = [
  /\bORD-\d{3,}\b/g,
  /\bPROD-\d{3,}\b/g,
  /\bESC-\d{3,}\b/g,
  /\bR\$ ?\d+(?:[.,]\d{2})?/g,
  /\b\d{2}\/\d{2}\/\d{4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}h(?:\d{2})?\b/g,
];

export function extractDisambiguationMetadata(messages: Message[]): string[] {
  const found = new Set<string>();

  for (const message of messages) {
    const content = message.content ?? "";
    for (const pattern of METADATA_PATTERNS) {
      const matches = content.match(pattern);
      matches?.forEach((match) => found.add(match.trim()));
    }
  }

  return [...found];
}

const SUMMARIZER_INSTRUCTION = `
Você resume conversas de atendimento de uma cafeteria para servir de contexto ao agente que continuará o atendimento.

Produza um resumo em texto corrido, no máximo 200 palavras, contendo:
- Quem é o cliente (nome, se informado) e o que ele quer.
- As AÇÕES já executadas e seus resultados (pedidos criados, consultas feitas, cancelamentos, escalações).
- Decisões, preferências e restrições declaradas pelo cliente.
- O que ficou pendente.

Regras absolutas:
- PRESERVE LITERALMENTE todo código de pedido (ORD-XXXX), código de produto (PROD-XXX), protocolo (ESC-XXXX), valor em R$, data e horário citados. Nunca aproxime, arredonde nem substitua por "um pedido" / "um produto".
- Não invente nada que não esteja na conversa.
- Não escreva JSON nem faça perguntas. Apenas o resumo.
`;

export class ContextCompactor {
  private readonly maxMessages: number;
  private readonly maxChars: number;
  private readonly keepRecent: number;
  private readonly summarizer: Agent;

  constructor(
    private readonly provider: ILlmProvider,
    options: CompactorOptions = {},
  ) {
    this.maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
    this.keepRecent = options.keepRecent ?? DEFAULT_KEEP_RECENT;
    this.summarizer = Agent.create({
      name: "Sumarizador",
      model: options.model ?? AgentModel.Gemma4,
      instruction: SUMMARIZER_INSTRUCTION,
    });
  }

  public needsCompaction(messages: Message[]): boolean {
    if (messages.length <= this.keepRecent) return false;
    if (messages.length > this.maxMessages) return true;

    const chars = messages.reduce(
      (sum, message) => sum + (message.content?.length ?? 0),
      0,
    );
    return chars > this.maxChars;
  }

  public async compact(params: {
    messages: Message[];
    previousSummary?: string | undefined;
  }): Promise<CompactionResult | null> {
    const { messages, previousSummary } = params;

    if (!this.needsCompaction(messages)) return null;

    const cutoff = messages.length - this.keepRecent;
    const older = messages.slice(0, cutoff);
    const recent = messages.slice(cutoff);

    const transcript = older
      .map((message) => `[${message.role}] ${message.content ?? ""}`)
      .join("\n");

    const preserved = extractDisambiguationMetadata(older);

    const prompt = [
      previousSummary ? `Resumo anterior:\n${previousSummary}` : "",
      `Trechos da conversa a resumir:\n${transcript}`,
      preserved.length > 0
        ? `Dados que precisam aparecer literalmente no resumo: ${preserved.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let summary: string;
    try {
      const result = await this.provider.chat({
        agent: this.summarizer,
        messages: [
          { role: "system", content: this.summarizer.getInstructions() },
          { role: "user", content: prompt },
        ],
      });
      summary = (result.message.content ?? "").trim();
    } catch {
      summary = previousSummary ?? "";
    }

    if (!summary) {
      summary = older
        .map((message) => `[${message.role}] ${message.content ?? ""}`)
        .join("\n")
        .slice(0, 1_500);
    }

    if (preserved.length > 0) {
      summary = `${summary}\n\nDados preservados: ${preserved.join(", ")}.`;
    }

    return { summary, recent };
  }
}
