export type ToolErrorCategory =
  | "transient"
  | "validation"
  | "business"
  | "permission";

export type ToolResponse<T = unknown> = {
  isError: boolean;
  errorCategory?: ToolErrorCategory | null;
  isRetryable?: boolean | null;
  message: string;
  userFriendlyMessage: string;
  data?: T | null;
};

export function toolSuccess<T>(params: {
  message: string;
  userFriendlyMessage: string;
  data?: T | null;
}): ToolResponse<T> {
  return {
    isError: false,
    errorCategory: null,
    isRetryable: null,
    message: params.message,
    userFriendlyMessage: params.userFriendlyMessage,
    data: params.data ?? null,
  };
}

export function toolError<T = never>(params: {
  errorCategory: ToolErrorCategory;
  message: string;
  userFriendlyMessage: string;
  isRetryable?: boolean;
  data?: T | null;
}): ToolResponse<T> {
  return {
    isError: true,
    errorCategory: params.errorCategory,
    isRetryable: params.isRetryable ?? params.errorCategory === "transient",
    message: params.message,
    userFriendlyMessage: params.userFriendlyMessage,
    data: params.data ?? null,
  };
}

export function isToolResponse(value: unknown): value is ToolResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["isError"] === "boolean" &&
    typeof candidate["message"] === "string" &&
    typeof candidate["userFriendlyMessage"] === "string"
  );
}

export function normalizeToolResponse(value: unknown): ToolResponse {
  if (isToolResponse(value)) return value;

  return toolSuccess({
    message: "Resultado retornado pela ferramenta.",
    userFriendlyMessage: "Consulta concluída.",
    data: value ?? null,
  });
}
