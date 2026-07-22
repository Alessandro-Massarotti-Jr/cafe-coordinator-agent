import { RunTree } from "langsmith";
import {
  IAgentTracingProvider,
  StartRunDTO,
  StartRunResultDTO,
  EndRunDTO,
  StartChildRunDTO,
  StartChildRunResultDTO,
  EndChildRunDTO,
} from "../interfaces/IAgentTracingProvider";

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export class LangSmithAgentTracingProvider implements IAgentTracingProvider {
  private runs = new Map<string, RunTree>();

  private sumChildUsage(run: RunTree): TokenUsage {
    const total: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    for (const child of run.child_runs ?? []) {
      const childUsage = child.extra?.usage as TokenUsage | undefined;
      if (childUsage) {
        total.prompt_tokens += childUsage.prompt_tokens;
        total.completion_tokens += childUsage.completion_tokens;
        total.total_tokens += childUsage.total_tokens;
      }
      const nested = this.sumChildUsage(child as RunTree);
      total.prompt_tokens += nested.prompt_tokens;
      total.completion_tokens += nested.completion_tokens;
      total.total_tokens += nested.total_tokens;
    }
    return total;
  }

  async startRun(data: StartRunDTO): Promise<StartRunResultDTO> {
    const run = new RunTree({
      name: data.name,
      run_type: data.runType,
      inputs: data.inputs,
      project_name: process.env.LANGSMITH_PROJECT as string,
      ...(data.tags && { tags: data.tags }),
      ...(data.metadata && { metadata: data.metadata }),
    });

    await run.postRun();
    this.runs.set(run.id, run);
    return { runId: run.id };
  }

  async endRun(data: EndRunDTO): Promise<void> {
    const run = this.runs.get(data.runId);
    if (!run) return;

    const ownUsage = (data.extra?.usage as TokenUsage | undefined) ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };
    const childUsage = this.sumChildUsage(run);

    const totalUsage: TokenUsage = {
      prompt_tokens: ownUsage.prompt_tokens + childUsage.prompt_tokens,
      completion_tokens:
        ownUsage.completion_tokens + childUsage.completion_tokens,
      total_tokens: ownUsage.total_tokens + childUsage.total_tokens,
    };

    run.extra = { ...run.extra, ...(data.extra ?? {}), usage: totalUsage };

    if (data.error) {
      await run.end({ error: data.error, usage: totalUsage });
    } else {
      await run.end({ outputs: data.outputs ?? {}, usage: totalUsage });
    }

    await run.patchRun();
    this.runs.delete(data.runId);
  }

  async startChildRun(data: StartChildRunDTO): Promise<StartChildRunResultDTO> {
    const parent = this.runs.get(data.parentRunId);
    if (!parent) throw new Error(`Parent run ${data.parentRunId} not found`);

    const child = parent.createChild({
      name: data.name,
      run_type: data.runType,
      inputs: data.inputs,
      ...(data.tags && { tags: data.tags }),
      ...(data.metadata && { metadata: data.metadata }),
    });

    await child.postRun();
    this.runs.set(child.id, child);
    return { runId: child.id };
  }

  async endChildRun(data: EndChildRunDTO): Promise<void> {
    return this.endRun({
      runId: data.childRunId,
      ...(data.outputs && { outputs: data.outputs }),
      ...(data.error && { error: data.error }),
      ...(data.extra && { extra: data.extra }),
    });
  }
}
