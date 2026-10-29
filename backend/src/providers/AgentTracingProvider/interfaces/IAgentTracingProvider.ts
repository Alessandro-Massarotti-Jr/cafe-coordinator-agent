import type {
  RunType,
  StartRunDTO,
  StartRunResultDTO,
  EndRunDTO,
  StartChildRunDTO,
  StartChildRunResultDTO,
  EndChildRunDTO,
} from "../dtos/AgentTracingDtos";

export type {
  RunType,
  StartRunDTO,
  StartRunResultDTO,
  EndRunDTO,
  StartChildRunDTO,
  StartChildRunResultDTO,
  EndChildRunDTO,
};

export interface IAgentTracingProvider {
  startRun(data: StartRunDTO): Promise<StartRunResultDTO>;
  endRun(data: EndRunDTO): Promise<void>;
  startChildRun(data: StartChildRunDTO): Promise<StartChildRunResultDTO>;
  endChildRun(data: EndChildRunDTO): Promise<void>;
  flush(): Promise<void>;
}

export type TraceContext = {
  tracer?: IAgentTracingProvider | undefined;
  parentRunId?: string | undefined;
};
