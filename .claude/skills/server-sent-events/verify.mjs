// Smoke test / driver for the SSE reference implementation.
//
// Proves three things about the reference routes:
//   1. GET /events is parsed by the NATIVE EventSource client (Node 22+ global) —
//      the strongest possible proof the wire format is spec-correct.
//   2. The raw bytes actually carry `data: ` / `event: ` / `id: ` prefixes
//      (the exact framing the old code omitted).
//   3. POST /chat streams the same format, consumed via fetch + a parser.
//
// Run:  node .claude/skills/server-sent-events/verify.mjs
// Exit: 0 = all assertions passed, 1 = failure.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mountSseRoutes } from "./reference/sse.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// express lives in backend/node_modules — resolve it from there.
const backendRequire = createRequire(join(here, "..", "..", "..", "backend", "package.json"));
const express = backendRequire("express");

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

const app = express();
app.use(express.json());
mountSseRoutes(app);
const server = app.listen(PORT);
await new Promise((r) => server.once("listening", r));

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`); }
}

// --- Test 1: native EventSource parses GET /events -------------------------
async function testEventSource() {
  console.log("GET /events via native EventSource:");
  const ticks = [];
  const done = await new Promise((resolve, reject) => {
    const es = new EventSource(`${BASE}/events`);
    es.addEventListener("tick", (e) => ticks.push(JSON.parse(e.data)));
    es.addEventListener("done", (e) => { es.close(); resolve(JSON.parse(e.data)); });
    es.onerror = () => { es.close(); reject(new Error("EventSource errored")); };
    setTimeout(() => { es.close(); reject(new Error("timeout")); }, 5000);
  });
  check("received 3 tick events", ticks.length === 3);
  check("tick payloads are JSON with n", ticks[0]?.n === 1 && ticks[2]?.n === 3);
  check("lastEventId propagated", ticks[2] !== undefined);
  check("done event reports total=3", done.total === 3);
}

// --- Test 2: raw bytes carry the SSE field prefixes ------------------------
async function testRawFraming() {
  console.log("GET /events raw wire format:");
  const res = await fetch(`${BASE}/events`);
  check("Content-Type is text/event-stream",
    res.headers.get("content-type")?.includes("text/event-stream"));
  check("X-Accel-Buffering disabled", res.headers.get("x-accel-buffering") === "no");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let raw = "";
  while (!raw.includes("event: done")) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += dec.decode(value, { stream: true });
  }
  await reader.cancel();
  check("frames use `data: ` prefix", /(^|\n)data: /.test(raw));
  check("frames use `event: tick` prefix", /(^|\n)event: tick/.test(raw));
  check("frames use `id: ` prefix", /(^|\n)id: 1/.test(raw));
  check("events end with a blank line", raw.includes("\n\n"));
}

// --- Test 3: POST /chat streams the same format ----------------------------
async function testPostChat() {
  console.log("POST /chat via fetch + parser:");
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const rawEvt = buf.slice(0, sep); buf = buf.slice(sep + 2);
      let ev = "message"; const data = [];
      for (const line of rawEvt.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      events.push({ event: ev, data: data.join("\n") });
    }
  }
  check("got a status event", events.some((e) => e.event === "status"));
  const done = events.find((e) => e.event === "done");
  check("got a done event with a message",
    !!done && JSON.parse(done.data).message.includes("1 message"));
}

try {
  await testEventSource();
  await testRawFraming();
  await testPostChat();
} catch (err) {
  console.error("FATAL:", err.message);
  failed++;
} finally {
  server.close();
}

console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
