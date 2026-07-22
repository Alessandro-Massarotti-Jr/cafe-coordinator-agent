import { Response } from "express";

export interface SseEvent {
  id?: string | number;
  event?: string;
  data?: unknown;
  retry?: number;
}

export function openSseStream(res: Response, retry = 3000): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`retry: ${retry}\n\n`);
}

export function sendEvent(res: Response, { id, event, data, retry }: SseEvent): void {
  if (res.writableEnded) return;

  if (retry !== undefined) res.write(`retry: ${retry}\n`);
  if (id !== undefined) res.write(`id: ${id}\n`);
  if (event !== undefined) res.write(`event: ${event}\n`);

  if (data !== undefined) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const line of payload.split("\n")) res.write(`data: ${line}\n`);
  }

  res.write("\n");
}

export function sendHeartbeat(res: Response): void {
  if (res.writableEnded) return;
  res.write(": heartbeat\n\n");
}

export function startHeartbeat(res: Response, intervalMs = 15000): () => void {
  const timer = setInterval(() => sendHeartbeat(res), intervalMs);
  return () => clearInterval(timer);
}
