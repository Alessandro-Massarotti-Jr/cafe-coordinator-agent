export type RunType = "chain" | "llm" | "tool" | "retriever";

export interface StartRunDTO {
  name: string;
  runType: RunType;
  inputs: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface StartRunResultDTO {
  runId: string;
}

export interface EndRunDTO {
  runId: string;
  outputs?: Record<string, unknown>;
  error?: string;
  extra?: Record<string, unknown>;
}

export interface StartChildRunDTO {
  parentRunId: string;
  name: string;
  runType: RunType;
  inputs: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface StartChildRunResultDTO {
  runId: string;
}

export interface EndChildRunDTO {
  childRunId: string;
  outputs?: Record<string, unknown>;
  error?: string;
  extra?: Record<string, unknown>;
}
