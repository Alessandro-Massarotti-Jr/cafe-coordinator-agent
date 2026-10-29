import { IAgentTracingProvider } from "./interfaces/IAgentTracingProvider";
import { LangSmithAgentTracingProvider } from "./implementations/LangSmithAgentTracingProvider";
import { NoopAgentTracingProvider } from "./implementations/NoopAgentTracingProvider";

export function createTracingProvider(
  env: NodeJS.ProcessEnv = process.env,
): IAgentTracingProvider {
  const enabled = env["LANGSMITH_TRACING"] === "true";
  const hasKey = Boolean(env["LANGSMITH_API_KEY"]?.trim());

  if (enabled && hasKey) return new LangSmithAgentTracingProvider();

  if (enabled && !hasKey) {
    console.warn(
      "[tracing] LANGSMITH_TRACING=true mas LANGSMITH_API_KEY está vazio; tracing desativado.",
    );
  }

  return new NoopAgentTracingProvider();
}
