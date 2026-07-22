import { CustomError } from "./CustomError";

export class ValidationError extends CustomError {
  constructor(data: { fields?: string[] }) {
    super({
      code: "VALIDATION_ERROR",
      message: `Validation error occurred on field${data.fields && data.fields.length > 0 ? `: ${data.fields.join(", ")}` : ""}.`,
      friendlyMessage:
        "There was a validation error. Please check your input and try again.",
      kind: "validation",
      severity: "medium",
      httpStatusCode: 400,
      name: "ValidationError",
    });
  }
}
