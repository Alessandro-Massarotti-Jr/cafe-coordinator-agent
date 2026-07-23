export enum AgentModel {
  Gemma4 = "gemma4",
  Gemma3 = "gemma3:4b",
  Qwen3 = "qwen3:4b",
}

export type AgentRole =
  | "coordinator"
  | "attendant"
  | "products"
  | "orders"
  | "recommendation"
  | "judge";

function fromEnv(key: string, fallback: AgentModel): AgentModel {
  const value = process.env[key];
  return (value as AgentModel) ?? fallback;
}

export const AGENT_MODEL_ROUTING: Record<AgentRole, AgentModel> = {
  coordinator: fromEnv("MODEL_COORDINATOR", AgentModel.Gemma4),
  attendant: fromEnv("MODEL_ATTENDANT", AgentModel.Gemma4),
  products: fromEnv("MODEL_PRODUCTS", AgentModel.Gemma4),
  orders: fromEnv("MODEL_ORDERS", AgentModel.Gemma4),
  recommendation: fromEnv("MODEL_RECOMMENDATION", AgentModel.Gemma4),
  judge: fromEnv("MODEL_JUDGE", AgentModel.Gemma4),
};

export function modelFor(role: AgentRole): AgentModel {
  return AGENT_MODEL_ROUTING[role];
}
