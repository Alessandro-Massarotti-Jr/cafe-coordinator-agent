// Framework-agnostic Server-Sent Events helpers + Express route wiring.
//
// The helpers touch nothing but Node's `res` (they only call res.write /
// res.writeHead), so they work under Express, Fastify, or raw http. The wire
// format is a PROTOCOL — get it right once here and every endpoint is correct.

/**
 * Write ONE well-formed SSE event to the response.
 *
 * Wire format (WHATWG / MDN): fields separated by newlines, event terminated
 * by a BLANK line:
 *
 *   id: 42
 *   event: message
 *   data: {"hello":"world"}
 *   <blank line>
 *
 * Rules the naive `res.write(JSON.stringify(x) + "\n\n")` version gets wrong:
 *   - every payload line MUST be prefixed with `data: ` (this is what makes it SSE)
 *   - multi-line payloads => one `data:` line per physical line
 *   - the event ends with an empty line => the trailing "\n"
 *   - `event:` is optional; omit it and the browser fires the default `message`
 *   - `id:` is optional; set it so the browser can resume via `Last-Event-ID`
 */
export function sendEvent(res, { id, event, data, retry } = {}) {
  if (retry !== undefined) res.write(`retry: ${retry}\n`);
  if (id !== undefined) res.write(`id: ${id}\n`);
  if (event !== undefined) res.write(`event: ${event}\n`);

  // A frame may legitimately carry no data (e.g. a `retry:`-only directive).
  if (data !== undefined) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const line of payload.split("\n")) {
      res.write(`data: ${line}\n`);
    }
  }
  res.write("\n"); // blank line = end of event. Without it the client never fires.
}

/** A comment line (starts with ":") is ignored by the client. Ideal keep-alive. */
export function sendHeartbeat(res) {
  res.write(": keep-alive\n\n");
}

/** The required response headers for any SSE endpoint. */
export function openSseStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Critical behind nginx/proxies: without this the proxy buffers the whole
    // stream and the client receives nothing until the response ends.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
}

/** Mount both example endpoints on any Express-style app. */
export function mountSseRoutes(app) {
  // -------------------------------------------------------------------------
  // GET /events — classic EventSource endpoint (no request body needed)
  // -------------------------------------------------------------------------
  app.get("/events", (req, res) => {
    openSseStream(res);
    sendEvent(res, { retry: 3000 }); // tell client the reconnect delay (ms)

    let n = Number(req.headers["last-event-id"] ?? 0);
    const heartbeat = setInterval(() => sendHeartbeat(res), 15000);
    const tick = setInterval(() => {
      n += 1;
      sendEvent(res, { id: n, event: "tick", data: { n, at: Date.now() } });
      if (n >= 3) finish();
    }, 200);

    function finish() {
      clearInterval(tick);
      clearInterval(heartbeat);
      sendEvent(res, { event: "done", data: { total: n } });
      res.end();
    }

    // ALWAYS clean up when the client goes away, or you leak timers/sockets.
    req.on("close", () => {
      clearInterval(tick);
      clearInterval(heartbeat);
    });
  });

  // -------------------------------------------------------------------------
  // POST /chat — streaming that needs a request body (the cafe-coordinator case)
  // -------------------------------------------------------------------------
  // EventSource is GET-only and can't send a JSON body, so when you must POST
  // (e.g. a chat `messages[]` array) emit the SAME wire format and parse it on
  // the client with fetch. Do NOT invent an ad-hoc line format.
  app.post("/chat", async (req, res) => {
    openSseStream(res);
    const { messages = [] } = req.body ?? {};

    const heartbeat = setInterval(() => sendHeartbeat(res), 15000);
    req.on("close", () => clearInterval(heartbeat));

    try {
      sendEvent(res, { event: "status", data: { status: "thinking" } });
      await new Promise((r) => setTimeout(r, 100));
      sendEvent(res, { event: "status", data: { status: "tool_call" } });
      await new Promise((r) => setTimeout(r, 100));

      sendEvent(res, {
        event: "done",
        data: { message: `Echo of ${messages.length} message(s)` },
      });
    } catch (err) {
      sendEvent(res, {
        event: "error",
        data: { message: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });

  return app;
}
