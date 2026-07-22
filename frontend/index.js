const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");

const history = [];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function addMessage(role, content) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.innerHTML = `<div class="bubble">${escapeHtml(content)}</div>`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function addTyping() {
  const el = document.createElement("div");
  el.className = "message assistant typing";
  el.innerHTML = `<div class="bubble"><div class="dots"><span></span><span></span><span></span></div><span class="status-text">Pensando...</span></div>`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

function updateStatus(typingEl, event) {
  const statusEl = typingEl.querySelector(".status-text");
  if (!statusEl) return;
  statusEl.textContent = event.status ?? "Processando...";
}

function setLoading(loading) {
  sendBtn.disabled = loading;
  inputEl.disabled = loading;
}

async function createChatStream(messages) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const { streamId } = await res.json();
  return streamId;
}

function consumeChatStream(streamId, { onStatus }) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/chat/stream/${streamId}`);
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      es.close();
      fn(value);
    };

    es.addEventListener("status", (e) => onStatus(JSON.parse(e.data)));

    es.addEventListener("done", (e) =>
      finish(resolve, JSON.parse(e.data).message ?? "(sem resposta)")
    );

    es.addEventListener("stream_error", (e) =>
      finish(reject, new Error(JSON.parse(e.data).message))
    );

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        finish(reject, new Error("Conexão encerrada pelo servidor."));
      }
    };
  });
}

async function send() {
  const content = inputEl.value.trim();
  if (!content) return;

  inputEl.value = "";
  setLoading(true);

  addMessage("user", content);
  history.push({ role: "user", content });

  const typing = addTyping();

  try {
    const streamId = await createChatStream(history);

    const reply = await consumeChatStream(streamId, {
      onStatus: (status) => updateStatus(typing, status),
    });

    typing.remove();
    addMessage("assistant", reply);
    history.push({ role: "assistant", content: reply });
  } catch (error) {
    typing.remove();
    const el = document.createElement("div");
    el.className = "error-msg";
    el.textContent = error?.message || "Erro ao conectar com o servidor.";
    messagesEl.appendChild(el);
  } finally {
    typing.remove();
    setLoading(false);
    inputEl.focus();
  }
}

sendBtn.addEventListener("click", send);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

inputEl.focus();
