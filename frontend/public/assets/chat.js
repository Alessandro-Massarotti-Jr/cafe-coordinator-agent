const { icons, escapeHtml, richText, initials, formatTime, parse, postJson } = window.Cafe;

const chatEl = document.getElementById("chat");
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const composerEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send");
const hintEl = document.getElementById("composer-hint");

const statusDot = document.getElementById("agent-status-dot");
const statusLabel = document.getElementById("agent-status-label");

const handoffCard = document.getElementById("handoff-card");
const handoffDot = document.getElementById("handoff-dot");
const handoffEyebrow = document.getElementById("handoff-eyebrow");
const handoffProtocol = document.getElementById("handoff-protocol");
const handoffTitle = document.getElementById("handoff-title");
const handoffBody = document.getElementById("handoff-body");

document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = icons[el.dataset.icon];
});

const history = [];
const renderedEntries = new Set();
let sessionId = null;
let escalation = null;
let sessionStream = null;
let busy = false;

function scrollToEnd() {
  chatEl.scrollTop = chatEl.scrollHeight;
}

function append(el) {
  welcomeEl.hidden = true;
  messagesEl.appendChild(el);
  scrollToEnd();
  return el;
}

function messageItem({ kind, author, role, avatar, content, at }) {
  const li = document.createElement("li");
  li.className = `msg msg-${kind}`;

  if (kind === "user") {
    li.innerHTML = `<div class="msg-body"><div class="msg-text">${richText(content)}</div></div>`;
    return li;
  }

  li.innerHTML = `
    ${avatar}
    <div class="msg-body">
      <div class="msg-meta">
        <span>${escapeHtml(author)}</span>
        ${role ? `<span class="msg-role">${escapeHtml(role)}</span>` : ""}
        ${at ? `<time>${formatTime(at)}</time>` : ""}
      </div>
      <div class="msg-text">${content}</div>
    </div>`;
  return li;
}

const botAvatar = () => `<span class="avatar avatar-bot">${icons.bean}</span>`;

function addUser(content) {
  return append(messageItem({ kind: "user", content }));
}

function botItem(content) {
  return messageItem({
    kind: "bot",
    author: "Assistente",
    role: "virtual",
    avatar: botAvatar(),
    content: richText(content),
    at: new Date().toISOString(),
  });
}

function addBot(content, placeholder) {
  const item = botItem(content);
  if (placeholder?.isConnected) {
    placeholder.replaceWith(item);
    return item;
  }
  return append(item);
}

function addHuman(entry) {
  return append(
    messageItem({
      kind: "human",
      author: entry.authorName ?? "Atendente",
      role: "Equipe Italy Coffee",
      avatar: `<span class="avatar avatar-human">${escapeHtml(initials(entry.authorName))}</span>`,
      content: richText(entry.content),
      at: entry.at,
    }),
  );
}

function addSystem(text) {
  const li = document.createElement("li");
  li.className = "msg-system";
  li.textContent = text;
  return append(li);
}

function addPending() {
  const li = messageItem({
    kind: "pending",
    author: "Assistente",
    role: "virtual",
    avatar: botAvatar(),
    content: `<span class="dots"><span></span><span></span><span></span></span><span class="status-text">Pensando…</span>`,
  });
  li.classList.add("msg-bot");
  return append(li);
}

function addError(text) {
  return append(
    messageItem({
      kind: "error",
      author: "Assistente",
      avatar: botAvatar(),
      content: escapeHtml(text),
    }),
  );
}

function setStatus(dotClass, label) {
  statusDot.className = `status-dot ${dotClass}`;
  statusLabel.textContent = label;
}

function renderHandoff() {
  if (!escalation) {
    handoffCard.hidden = true;
    setStatus("is-bot", "Assistente virtual");
    hintEl.textContent = "O assistente virtual pode cometer erros. Peça um atendente a qualquer momento.";
    inputEl.placeholder = "Escreva sua mensagem…";
    return;
  }

  handoffCard.hidden = false;
  handoffProtocol.textContent = escalation.protocol;

  if (escalation.status === "in_progress") {
    const name = escalation.assignee ?? "Um atendente";
    handoffDot.className = "status-dot is-human";
    handoffEyebrow.textContent = "Atendimento humano";
    handoffTitle.textContent = `${name} está com você`;
    handoffBody.textContent = "As respostas chegam por aqui mesmo, em tempo real.";
    setStatus("is-human", `${name} · Equipe`);
    inputEl.placeholder = `Escreva para ${name}…`;
  } else {
    handoffDot.className = "status-dot is-waiting";
    handoffEyebrow.textContent = "Transferido para a equipe";
    handoffTitle.textContent = "Um atendente vai assumir em instantes";
    handoffBody.textContent = "Pode continuar escrevendo — suas mensagens já chegam para a equipe.";
    setStatus("is-waiting", "Aguardando atendente");
    inputEl.placeholder = "Escreva sua mensagem para a equipe…";
  }

  hintEl.textContent = `Protocolo ${escalation.protocol} · guarde este número caso precise retomar o atendimento.`;
}

function applyEscalation(next) {
  escalation = next && next.status !== "resolved" ? next : null;
  if (escalation) setBusy(false);
  renderHandoff();
}

function connectSessionStream() {
  if (!sessionId || sessionStream) return;

  sessionStream = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/stream`);

  sessionStream.addEventListener("state", (event) => {
    const data = parse(event);
    if (data) applyEscalation(data.escalation);
  });

  sessionStream.addEventListener("escalation", (event) => {
    const data = parse(event);
    if (data) applyEscalation(data);
  });

  sessionStream.addEventListener("message", (event) => {
    const entry = parse(event);
    if (!entry || renderedEntries.has(entry.id)) return;
    renderedEntries.add(entry.id);

    if (entry.author === "human") {
      addHuman(entry);
      history.push({ role: "assistant", content: entry.content });
    } else if (entry.author === "system") {
      addSystem(entry.content);
    }
  });
}

async function createChat(messages) {
  const { status, payload } = await postJson(
    "/api/chat",
    sessionId ? { messages, sessionId } : { messages },
  );
  sessionId = payload.sessionId ?? sessionId;
  connectSessionStream();
  return { status, payload };
}

function consumeChatStream(streamId, onStatus) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/chat/stream/${streamId}`);
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      es.close();
      fn(value);
    };

    es.addEventListener("status", (e) => onStatus(parse(e)?.status ?? "Processando…"));
    es.addEventListener("degraded", (e) => onStatus(`Resposta parcial: ${parse(e)?.reason ?? ""}`));
    es.addEventListener("done", (e) => finish(resolve, parse(e) ?? {}));
    es.addEventListener("stream_error", (e) => finish(reject, new Error(parse(e)?.message)));
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        finish(reject, new Error("Conexão encerrada pelo servidor."));
      }
    };
  });
}

function setBusy(next) {
  busy = next;
  sendBtn.disabled = next;
}

function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 180)}px`;
  inputEl.style.overflowY = inputEl.scrollHeight > 180 ? "auto" : "hidden";
}

async function send(text) {
  const content = (text ?? inputEl.value).trim();
  if (!content || busy) return;

  inputEl.value = "";
  autoGrow();
  setBusy(true);

  addUser(content);
  history.push({ role: "user", content });

  const humanMode = Boolean(escalation);
  const pending = humanMode ? null : addPending();

  try {
    const { status, payload } = await createChat(history);

    if (status === 202 || payload.handledBy === "human") {
      pending?.remove();
      applyEscalation(payload.escalation);
      return;
    }

    const statusEl = pending?.querySelector(".status-text");
    const done = await consumeChatStream(payload.streamId, (label) => {
      if (statusEl) statusEl.textContent = label;
    });

    const reply = done.message ?? "(sem resposta)";
    addBot(reply, pending);
    history.push({ role: "assistant", content: reply });
    if (done.escalation) applyEscalation(done.escalation);
  } catch (error) {
    pending?.remove();
    addError(error?.message || "Não consegui falar com o servidor. Tente novamente.");
  } finally {
    setBusy(false);
    inputEl.focus();
  }
}

composerEl.addEventListener("submit", (event) => {
  event.preventDefault();
  send();
});

inputEl.addEventListener("input", autoGrow);
inputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    send();
  }
});

document.getElementById("suggestions").addEventListener("click", (event) => {
  const button = event.target.closest(".suggestion");
  if (button) send(button.textContent);
});

renderHandoff();
inputEl.focus();
