export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isTransient?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
  sleep?: (ms: number) => Promise<void>;
};

const TRANSIENT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "ENOTFOUND",
  "ERR_CANCELED",
  "ECONNABORTED",
]);

export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: string;
    status?: number;
    response?: { status?: number };
    message?: string;
  };

  if (candidate.code && TRANSIENT_CODES.has(candidate.code)) return true;

  const status = candidate.response?.status ?? candidate.status;
  if (typeof status === "number" && status >= 500) return true;
  if (status === 429) return true;

  const message = candidate.message ?? "";
  return /timeout|socket hang up|network error/i.test(message);
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 4_000;
  const transient = options.isTransient ?? isTransientError;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!transient(error) || attempt === attempts) throw error;

      options.onRetry?.(error, attempt);
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}
