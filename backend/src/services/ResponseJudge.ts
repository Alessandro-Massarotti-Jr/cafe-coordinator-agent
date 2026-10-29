import { Agent } from "../agents/Agent";
import { createJudgeAgent } from "../agents/judge";
import { ILlmProvider } from "../providers/LlmProvider/interfaces/ILlmProvider";
import { TraceContext } from "../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";
import { traceSpan } from "./tracing/traceSpan";
import { tracedChat } from "./tracing/tracedChat";

export type JudgeVerdict = {
  approved: boolean;
  score: number;
  issues: string[];
  reason: string;
};

export type JudgeInput = {
  question: string;
  answer: string;
  expectations?: string[];
};

export function parseVerdict(raw: string): JudgeVerdict {
  const match = raw.match(/\{[\s\S]*\}/);

  if (!match) {
    return {
      approved: false,
      score: 0,
      issues: ["Juiz não retornou JSON avaliável."],
      reason: raw.slice(0, 300),
    };
  }

  try {
    const parsed = JSON.parse(match[0]) as Partial<JudgeVerdict>;
    return {
      approved: Boolean(parsed.approved),
      score: Number(parsed.score ?? 0),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      reason: String(parsed.reason ?? ""),
    };
  } catch {
    return {
      approved: false,
      score: 0,
      issues: ["JSON do juiz inválido."],
      reason: match[0].slice(0, 300),
    };
  }
}

export class ResponseJudge {
  private readonly agent: Agent;

  constructor(
    private readonly provider: ILlmProvider,
    agent: Agent = createJudgeAgent(),
  ) {
    this.agent = agent;
  }

  public async evaluate(
    input: JudgeInput,
    trace?: TraceContext,
  ): Promise<JudgeVerdict> {
    return traceSpan<JudgeVerdict>(
      {
        context: trace,
        name: "Judge/evaluate",
        runType: "chain",
        inputs: { ...input },
        tags: ["judge"],
        describe: (verdict) => ({
          outputs: { ...verdict },
          metadata: { approved: verdict.approved, score: verdict.score },
        }),
      },
      (judgeTrace) => this.judge(input, judgeTrace),
    );
  }

  private async judge(
    input: JudgeInput,
    trace: TraceContext,
  ): Promise<JudgeVerdict> {
    const prompt = [
      `Pergunta do cliente:\n${input.question}`,
      `Resposta entregue ao cliente:\n${input.answer}`,
      input.expectations && input.expectations.length > 0
        ? `Pontos que a resposta deveria cobrir:\n- ${input.expectations.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await tracedChat({
      provider: this.provider,
      agent: this.agent,
      messages: [
        { role: "system", content: this.agent.getInstructions() },
        { role: "user", content: prompt },
      ],
      context: trace,
    });

    return parseVerdict(result.message.content ?? "");
  }
}
