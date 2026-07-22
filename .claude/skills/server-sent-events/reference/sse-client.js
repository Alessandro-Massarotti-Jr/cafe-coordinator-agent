// Correct client-side consumption of Server-Sent Events.
//
// Case A: use the native EventSource class whenever the endpoint is a GET.
// Case B: fetch + a real SSE parser only when you must POST a body.

// ===========================================================================
// Case A — native EventSource (preferred; GET endpoints)
// ===========================================================================
export function connectWithEventSource() {
  const es = new EventSource("/events");

  // The default `message` event: fires for frames with NO `event:` field.
  es.onmessage = (e) => {
    console.log("message:", e.data);
  };

  // Named events: one listener per `event:` name the server sends.
  es.addEventListener("tick", (e) => {
    const { n, at } = JSON.parse(e.data);
    console.log(`tick #${n} @ ${at} (lastEventId=${e.lastEventId})`);
  });

  es.addEventListener("done", (e) => {
    console.log("done:", e.data);
    es.close(); // stop here, otherwise the browser auto-reconnects.
  });

  // onerror fires on network drop. The browser reconnects on its own (sending
  // Last-Event-ID) unless readyState === CLOSED. Don't manually reconnect here.
  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) console.error("connection closed");
    else console.warn("connection lost, browser will retry…");
  };

  return es;
}

// ===========================================================================
// Case B — fetch + manual parser (POST with a body)
// ===========================================================================
// EventSource cannot POST a body, so parse the identical wire format yourself.
// This is a minimal, spec-shaped parser: split on blank lines, read `event:`
// and (multi-line) `data:` fields. It replaces the old code's fragile
// "one JSON object per line" hack.
async function* parseSseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Events are separated by a blank line ("\n\n").
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      yield parseEvent(raw);
    }
  }
}

function parseEvent(raw) {
  let event = "message";
  const dataLines = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue; // comment / heartbeat
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    // Spec: strip exactly one leading space after the colon.
    let val = idx === -1 ? "" : line.slice(idx + 1);
    if (val.startsWith(" ")) val = val.slice(1);
    if (field === "event") event = val;
    else if (field === "data") dataLines.push(val);
  }
  return { event, data: dataLines.join("\n") };
}

export async function connectWithFetch(messages) {
  const res = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  for await (const evt of parseSseStream(res)) {
    if (evt.event === "status") console.log("status:", JSON.parse(evt.data));
    else if (evt.event === "done") console.log("done:", JSON.parse(evt.data));
    else if (evt.event === "error") console.error("error:", JSON.parse(evt.data));
  }
}
