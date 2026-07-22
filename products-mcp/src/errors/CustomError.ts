import { ToolResponse } from "../domain/ToolResponse";

export class CustomError extends Error {
  private readonly friendlyMessage: string;
  private readonly code: string;
  private readonly httpStatusCode: number;
  private readonly severity: "low" | "medium" | "high";
  private readonly kind: "validation" | "transient" | "business" | "permission";

  constructor(data: {
    message?: string;
    friendlyMessage?: string;
    code?: string;
    name?: string;
    httpStatusCode?: number;
    severity?: "low" | "medium" | "high";
    kind?: "validation" | "transient" | "business" | "permission";
  }) {
    super(data.message);
    this.name = data.name ?? "CustomError";
    this.message = data.message ?? "An unexpected error occurred.";
    this.friendlyMessage =
      data.friendlyMessage ?? "An unexpected error occurred.";
    this.code = data.code ?? "0";
    this.httpStatusCode = data.httpStatusCode ?? 500;
    this.severity = data.severity ?? "high";
    this.kind = data.kind ?? "transient";
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      friendlyMessage: this.friendlyMessage,
      code: this.code,
      httpStatusCode: this.httpStatusCode,
      severity: this.severity,
      kind: this.kind,
    };
  }

  toToolResponse(): ToolResponse {
    return {
      isError: true,
      errorCategory: this.kind,
      isRetryable: this.kind === "transient",
      message: this.message,
      userFriendlyMessage: this.friendlyMessage,
    };
  }
}
