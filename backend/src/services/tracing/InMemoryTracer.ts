import { randomUUID } from "node:crypto";
import {
  EndChildRunDTO,
  EndRunDTO,
  IAgentTracingProvider,
  RunType,
  StartChildRunDTO,
  StartRunDTO,
} from "../../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";

export type RecordedSpan = {
  id: string;
  parentId: string | null;
  name: string;
  runType: RunType;
  inputs: Record<string, unknown>;
  tags: string[];
  metadata: Record<string, unknown>;
  outputs?: Record<string, unknown> | undefined;
  error?: string | undefined;
  endMetadata?: Record<string, unknown> | undefined;
  ended: boolean;
};

export class InMemoryTracer implements IAgentTracingProvider {
  public readonly spans: RecordedSpan[] = [];

  async startRun(data: StartRunDTO) {
    return { runId: this.open(data, null) };
  }

  async startChildRun(data: StartChildRunDTO) {
    return { runId: this.open(data, data.parentRunId) };
  }

  async endRun(data: EndRunDTO) {
    this.close(data.runId, data);
  }

  async endChildRun(data: EndChildRunDTO) {
    this.close(data.childRunId, data);
  }

  async flush() {}

  public byName(name: string): RecordedSpan[] {
    return this.spans.filter((span) => span.name === name);
  }

  public childrenOf(span: RecordedSpan): RecordedSpan[] {
    return this.spans.filter((candidate) => candidate.parentId === span.id);
  }

  private open(data: StartRunDTO, parentId: string | null): string {
    const id = randomUUID();
    this.spans.push({
      id,
      parentId,
      name: data.name,
      runType: data.runType,
      inputs: data.inputs,
      tags: data.tags ?? [],
      metadata: data.metadata ?? {},
      ended: false,
    });
    return id;
  }

  private close(
    id: string,
    data: {
      outputs?: Record<string, unknown>;
      error?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const span = this.spans.find((candidate) => candidate.id === id);
    if (!span) return;
    span.outputs = data.outputs;
    span.error = data.error;
    span.endMetadata = data.metadata;
    span.ended = true;
  }
}
