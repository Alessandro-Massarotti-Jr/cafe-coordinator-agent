import { randomUUID } from "node:crypto";
import {
  IAgentTracingProvider,
  StartRunResultDTO,
  StartChildRunResultDTO,
} from "../interfaces/IAgentTracingProvider";

export class NoopAgentTracingProvider implements IAgentTracingProvider {
  async startRun(): Promise<StartRunResultDTO> {
    return { runId: randomUUID() };
  }

  async endRun(): Promise<void> {}

  async startChildRun(): Promise<StartChildRunResultDTO> {
    return { runId: randomUUID() };
  }

  async endChildRun(): Promise<void> {}

  async flush(): Promise<void> {}
}
