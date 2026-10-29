import { Client, RunTree } from "langsmith";
import {
  IAgentTracingProvider,
  StartRunDTO,
  StartRunResultDTO,
  EndRunDTO,
  StartChildRunDTO,
  StartChildRunResultDTO,
  EndChildRunDTO,
} from "../interfaces/IAgentTracingProvider";

export class LangSmithAgentTracingProvider implements IAgentTracingProvider {
  private readonly runs = new Map<string, RunTree>();
  private readonly client = new Client();
  private readonly projectName = process.env["LANGSMITH_PROJECT"];

  async startRun(data: StartRunDTO): Promise<StartRunResultDTO> {
    const run = new RunTree({
      name: data.name,
      run_type: data.runType,
      inputs: data.inputs,
      client: this.client,
      ...(this.projectName && { project_name: this.projectName }),
      ...(data.tags && { tags: data.tags }),
      ...(data.metadata && { metadata: data.metadata }),
    });

    await this.safely("postRun", () => run.postRun());
    this.runs.set(run.id, run);
    return { runId: run.id };
  }

  async endRun(data: EndRunDTO): Promise<void> {
    const run = this.runs.get(data.runId);
    if (!run) return;

    this.runs.delete(data.runId);

    await run.end(data.outputs ?? {}, data.error, undefined, data.metadata);
    await this.safely("patchRun", () => run.patchRun());
  }

  async startChildRun(data: StartChildRunDTO): Promise<StartChildRunResultDTO> {
    const parent = this.runs.get(data.parentRunId);
    if (!parent) {
      console.warn(
        `[tracing] run pai ${data.parentRunId} não encontrado; "${data.name}" será registrado como raiz.`,
      );
      return this.startRun(data);
    }

    const child = parent.createChild({
      name: data.name,
      run_type: data.runType,
      inputs: data.inputs,
      ...(data.tags && { tags: data.tags }),
      ...(data.metadata && { metadata: data.metadata }),
    });

    await this.safely("postRun", () => child.postRun());
    this.runs.set(child.id, child);
    return { runId: child.id };
  }

  async endChildRun(data: EndChildRunDTO): Promise<void> {
    return this.endRun({
      runId: data.childRunId,
      ...(data.outputs && { outputs: data.outputs }),
      ...(data.error && { error: data.error }),
      ...(data.metadata && { metadata: data.metadata }),
    });
  }

  async flush(): Promise<void> {
    await this.safely("flush", () => this.client.awaitPendingTraceBatches());
  }

  private async safely(step: string, operation: () => Promise<void>) {
    try {
      await operation();
    } catch (error) {
      console.warn(
        `[tracing] falha no ${step} do LangSmith:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
