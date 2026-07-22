---
name: server-sent-events
description: Implement, fix, or review Server-Sent Events (SSE) correctly — the text/event-stream wire format on the backend (Express/Node) and the EventSource client on the frontend. Use when adding streaming, building a chat/progress stream, debugging why the browser receives nothing or events never fire, or replacing an ad-hoc res.write() stream with spec-compliant SSE.
---

# Server-Sent Events, done to spec

SSE is a **protocol**, not "whatever we happened to `res.write()`." The browser's
`EventSource` client only fires events when the bytes on the wire match the
WHATWG/MDN format exactly. Get the framing right on the server and the standard
client parses it for free — no custom reader, no reconnection code.

Reference: <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>

Paths below are relative to the repo root. The runnable reference lives in this
skill directory.

## The wire format (this is the whole thing)

Each event is a block of `field: value` lines terminated by a **blank line**.
These are the exact bytes the reference server emits (verified with `curl`):

```
retry: 3000

id: 1
event: tick
data: {"n":1,"at":1784683762698}

event: done
data: {"total":3}

```

Field rules — the ones the current code violates:

| Field | Rule |
|-------|------|
| `data:` | **Mandatory prefix on every payload line.** Multi-line payload → one `data:` line per line; the browser rejoins them with `\n`. |
| `event:` | Optional. Names the event; the client listens with `addEventListener("name", …)`. Omit it → the client's `onmessage` (default `message` event) fires. |
| `id:` | Optional. The client stores it and resends it as the `Last-Event-ID` header on reconnect, so you can resume. |
| `retry:` | Optional. Reconnect delay in ms (integer only). |
| `: comment` | A line starting with `:` is ignored by the client — use it as a keep-alive heartbeat. |
| *(blank line)* | **Terminates the event.** Without the trailing `\n\n` the client buffers forever and nothing fires. |

Stream must be UTF-8. One HTTP response = one long-lived stream of many events.

## Run the reference / driver (agent path)

The driver is [`.claude/skills/server-sent-events/verify.mjs`](verify.mjs). It
mounts the real routes from [`reference/sse.mjs`](reference/sse.mjs), serves
them, and asserts the framing three ways: the **native `EventSource`** parses
`GET /events`, the raw bytes carry `data:`/`event:`/`id:` prefixes, and
`POST /chat` streams the same format.

```bash
node --experimental-eventsource .claude/skills/server-sent-events/verify.mjs
```

Expected tail: `PASS — 12 passed, 0 failed`.

- Needs Node 22+. `EventSource` is a global only behind `--experimental-eventsource`
  on Node ≤24 (in a browser it is always available). Without the flag the driver
  prints `EventSource is not defined`.
- It resolves `express` from `backend/node_modules` via `createRequire`, so run
  it with the repo's `backend` deps installed (`cd backend && npm install` once).

## Correct backend (Express)

The framing helpers are in [`reference/sse.mjs`](reference/sse.mjs) — framework-agnostic
(`res.write` / `res.writeHead` only). The core:

```js
function openSseStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop nginx/proxies buffering the stream
  });
  res.flushHeaders?.();
}

function sendEvent(res, { id, event, data, retry } = {}) {
  if (retry !== undefined) res.write(`retry: ${retry}\n`);
  if (id !== undefined) res.write(`id: ${id}\n`);
  if (event !== undefined) res.write(`event: ${event}\n`);
  if (data !== undefined) {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    for (const line of payload.split("\n")) res.write(`data: ${line}\n`); // per-line data:
  }
  res.write("\n"); // blank line ends the event
}

const sendHeartbeat = (res) => res.write(": keep-alive\n\n"); // comment = ignored keep-alive
```

Non-negotiables:
- **Prefix every payload line with `data: `** and end each event with `\n\n`.
- Send `"X-Accel-Buffering": "no"` — this stack has nginx ([frontend/nginx.conf](frontend/nginx.conf)); without it the proxy buffers and the client sees nothing until the end.
- Register `req.on("close", …)` to `clearInterval`/abort work when the client disconnects, or you leak timers and sockets.
- Send a `: heartbeat\n\n` comment every ~15s to keep idle connections and proxies alive.

## Correct frontend

Client code: [`reference/sse-client.js`](reference/sse-client.js). Two cases.

**Case A — GET endpoint → use the native `EventSource` class.** Don't hand-roll a reader.

```js
const es = new EventSource("/events");
es.addEventListener("tick", (e) => console.log(JSON.parse(e.data), e.lastEventId));
es.addEventListener("done", (e) => es.close()); // else the browser auto-reconnects
es.onmessage = (e) => console.log("unnamed event:", e.data); // frames with no `event:`
es.onerror = () => {
  if (es.readyState === EventSource.CLOSED) console.error("closed");
  // otherwise the browser reconnects on its own, resending Last-Event-ID — don't reconnect manually
};
```

**Case B — you must POST a body** (e.g. a chat `messages[]` array). `EventSource`
is GET-only and can't send a body, so `fetch` the endpoint and parse the **same**
wire format — split on blank lines, read `event:` and (multi-line) `data:`.
See `parseSseStream` in [`reference/sse-client.js`](reference/sse-client.js). Do
**not** invent a "one JSON object per line" format.

## What the current code gets wrong

This is why the app's streaming is off-spec. Fix by adopting the patterns above.

**Backend — [backend/src/index.ts](backend/src/index.ts:64):**
```js
const emit = (data) => res.write(`${JSON.stringify(data)}\n\n`); // ❌ no `data:` prefix
```
This is **not SSE** — it's raw newline-delimited JSON. A real `EventSource`
client would ignore every frame (no `data:` field). Also missing: `event:`/`id:`,
`X-Accel-Buffering: no`, `req.on("close")` cleanup, and heartbeats.

**Frontend — [frontend/index.js:65-87](frontend/index.js#L65-L87):** hand-rolls
`fetch().body.getReader()` and `JSON.parse(line)` per line — a fragile parser that
exists only because the backend isn't emitting SSE. Once the backend emits real
`data:` frames, this becomes the `parseSseStream` approach (Case B), or switch the
endpoint to `GET` + `EventSource` (Case A).

Note: this endpoint is `POST /api/chat` (it needs a `messages[]` body), so it's a
**Case B** endpoint — emit proper `event:`/`data:` frames on the server and parse
them with fetch on the client. Reserve `EventSource` (Case A) for GET streams.

## Gotchas

- **Nothing arrives until the request ends** → a proxy is buffering. Set `X-Accel-Buffering: no` on the response (nginx) and confirm `Content-Type: text/event-stream`. `compression`/`gzip` middleware also buffers SSE — exclude the stream route.
- **Client connects but no event fires** → you forgot the terminating blank line, or a payload line lacks the `data: ` prefix. Both make the client buffer silently.
- **`EventSource` keeps reconnecting after you're done** → the server must `res.end()` *and* the client must `es.close()`. An open `EventSource` reconnects automatically on any close.
- **`EventSource is not defined` in Node** → it's browser-native but Node needs `--experimental-eventsource` (Node 22–24). It's always present in browsers.
- **Can't send a request body with `EventSource`** → it's GET-only. Use fetch + a parser (Case B) or move state into the query string / a prior POST.
- **HTTP/1.1 caps ~6 SSE connections per domain per browser.** Serve over HTTP/2 (default ~100 streams) if users open many tabs.
- **Multi-line `data:`** → the server must emit one `data:` line per physical line; a single `data: {json-with-\n}` breaks. The `sendEvent` helper handles this.

## Files

- [`reference/sse.mjs`](reference/sse.mjs) — framing helpers + Express route wiring (the reusable part).
- [`reference/sse-server.mjs`](reference/sse-server.mjs) — thin standalone Express entry (documentation; run via the backend's deps).
- [`reference/sse-client.js`](reference/sse-client.js) — `EventSource` (Case A) and fetch+parser (Case B) clients.
- [`verify.mjs`](verify.mjs) — the driver / smoke test.
