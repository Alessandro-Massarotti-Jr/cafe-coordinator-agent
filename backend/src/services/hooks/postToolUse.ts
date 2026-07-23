import { ToolResponse } from "../../agents/ToolResponse";
import { PostToolUseHook } from "../AgentRunner";

export function maskCustomerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name;

  const first = parts[0]!;
  const initials = parts
    .slice(1)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(" ");

  return initials ? `${first} ${initials}` : first;
}

export function redactOrdersListing(result: ToolResponse): ToolResponse {
  const data = result.data as { count?: number; orders?: unknown[] } | null;
  if (!data || !Array.isArray(data.orders)) return result;

  const orders = data.orders.map((order) => {
    const record = order as Record<string, unknown>;
    if (typeof record["customerName"] !== "string") return record;
    return {
      ...record,
      customerName: maskCustomerName(record["customerName"]),
    };
  });

  return { ...result, data: { ...data, orders } };
}

const REDACTORS: Record<string, (result: ToolResponse) => ToolResponse> = {
  listOrders: redactOrdersListing,
};

export function createPostToolUseHook(
  logger: Pick<Console, "log"> = console,
): PostToolUseHook {
  return ({ toolName, result, session }) => {
    logger.log(
      `[tool] session=${session?.sessionId ?? "anonymous"} name=${toolName} isError=${result.isError} category=${result.errorCategory ?? "none"}`,
    );

    const redactor = REDACTORS[toolName];
    return redactor ? redactor(result) : result;
  };
}
