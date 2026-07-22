export type ToolResponse = {
  isError: boolean;
  errorCategory?: "validation" | "transient" | "business" | "permission" | null;
  isRetryable?: boolean | null;
  message: string;
  userFriendlyMessage: string;
  data?: any;
};
