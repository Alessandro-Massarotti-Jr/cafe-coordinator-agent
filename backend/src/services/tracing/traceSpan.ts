import {
  RunType,
  TraceContext,
} from "../../providers/AgentTracingProvider/interfaces/IAgentTracingProvider";

export type SpanResult = {
  outputs?: Record<string, unknown>;
  error?: string | undefined;
  metadata?: Record<string, unknown>;
};

export type SpanParams<T> = {
  context: TraceContext | undefined;
  name: string;
  runType: RunType;
  inputs: Record<string, unknown>;
  tags?: string[];
  metadata?: Record<string, unknown>;
  describe?: (result: NoInfer<T>) => SpanResult;
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function traceSpan<T>(
  params: SpanParams<T>,
  fn: (context: TraceContext) => Promise<T>,
): Promise<T> {
  const tracer = params.context?.tracer;
  const parentRunId = params.context?.parentRunId;

  if (!tracer || !parentRunId) return fn(params.context ?? {});

  const { runId } = await tracer.startChildRun({
    parentRunId,
    name: params.name,
    runType: params.runType,
    inputs: params.inputs,
    ...(params.tags && { tags: params.tags }),
    ...(params.metadata && { metadata: params.metadata }),
  });

  let result: T;
  try {
    result = await fn({ tracer, parentRunId: runId });
  } catch (error) {
    await tracer.endChildRun({ childRunId: runId, error: errorMessage(error) });
    throw error;
  }

  const described = params.describe?.(result) ?? {
    outputs: { result: result as unknown },
  };

  await tracer.endChildRun({
    childRunId: runId,
    ...(described.outputs && { outputs: described.outputs }),
    ...(described.error && { error: described.error }),
    ...(described.metadata && { metadata: described.metadata }),
  });

  return result;
}
