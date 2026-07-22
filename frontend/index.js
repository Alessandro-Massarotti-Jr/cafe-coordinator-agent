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

async function send() {
  const content = inputEl.value.trim();
  if (!content) return;

  inputEl.value = "";
  setLoading(true);

  addMessage("user", content);
  history.push({ role: "user", content });

  const typing = addTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "done") {
          typing.remove();
          const reply = event.message ?? "(sem resposta)";
          addMessage("assistant", reply);
          history.push({ role: "assistant", content: reply });
        } else {
          updateStatus(typing, event);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
  } catch {
    typing.remove();
    const el = document.createElement("div");
    el.className = "error-msg";
    el.textContent = "Erro ao conectar com o servidor.";
    messagesEl.appendChild(el);
  } finally {
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
