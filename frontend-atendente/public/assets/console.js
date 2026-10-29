const {
  icons,
  reasonLabels,
  statusLabels,
  escapeHtml,
  richText,
  plainText,
  initials,
  formatTime,
  relativeTime,
  local,
  toast,
  postJson,
  parse,
} = window.Cafe;

const consoleEl = document.getElementById("console");
const liveDot = document.getElementById("live-dot");
const liveLabel = document.getElementById("live-label");
const agentInput = document.getElementById("agent-name");
const agentAvatar = document.getElementById("agent-avatar");

const queueList = document.getElementById("queue-list");
const queueEmpty = document.getElementById("queue-empty");
const queueCount = document.getElementById("queue-count");
const tabsEl = document.getElementById("tabs");

const threadEmpty = document.getElementById("thread-empty");
const threadView = document.getElementById("thread-view");
const threadName = document.getElementById("thread-name");
const threadProtocol = document.getElementById("thread-protocol");
const threadStatus = document.getElementById("thread-status");
const claimBtn = document.getElementById("claim-btn");
const resolveBtn = document.getElementById("resolve-btn");
const transcriptEl = document.getElementById("transcript");
const replyForm = document.getElementById("reply");
const replyInput = document.getElementById("reply-input");
const replySend = document.getElementById("reply-send");
const replyNote = document.getElementById("reply-note");
const briefContent = document.getElementById("brief-content");

document.querySelectorAll("[data-icon]").forEach((el) => {
  el.innerHTML = icons[el.dataset.icon];
});

const AGENT_KEY = "italy-coffee:agent-name";

const escalations = new Map();
const unread = new Set();
let filter = "waiting";
let selected = null;
let transcript = [];
let busy = false;

function agentName() {
  return agentInput.value.trim();
}

function renderAgent() {
  agentAvatar.textContent = agentName() ? initials(agentName()) : "?";
}

function activityAt(escalation) {
  return escalation.lastEntry?.at ?? escalation.createdAt;
}

function sortedFor(status) {
  const items = [...escalations.values()].filter((item) => item.status === status);
  if (status === "waiting") {
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return items.sort((a, b) => activityAt(b).localeCompare(activityAt(a)));
}

function previewOf(escalation) {
  const entry = escalation.lastEntry;
  if (!entry) return escalation.requestedAction;
  const prefix = {
    customer: "",
    bot: "Assistente: ",
    human: `${entry.authorName ?? "Atendente"}: `,
    system: "",
  }[entry.author];
  return `${prefix}${plainText(entry.content)}`;
}

function renderQueue() {
  for (const status of ["waiting", "in_progress", "resolved"]) {
    const count = sortedFor(status).length;
    const el = tabsEl.querySelector(`[data-count="${status}"]`);
    el.textContent = count;
    el.classList.toggle("has-items", count > 0);
  }

  const waiting = sortedFor("waiting").length;
  queueCount.textContent = `${waiting} aguardando`;
  document.title = waiting > 0
    ? `(${waiting}) Italy Coffee · Console de atendimento`
    : "Italy Coffee · Console de atendimento";

  tabsEl.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.filter === filter;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  const items = sortedFor(filter);
  queueEmpty.hidden = items.length > 0;
  queueList.innerHTML = items
    .map((item) => {
      const isSelected = item.protocol === selected?.protocol;
      const assignee = item.status === "in_progress" && item.assignee
        ? `<span class="qi-assignee">com ${escapeHtml(item.assignee)}</span>`
        : "";
      return `
        <li>
          <button class="queue-item${isSelected ? " is-selected" : ""}" type="button" data-protocol="${escapeHtml(item.protocol)}">
            <div class="qi-row">
              <span class="qi-name">${escapeHtml(item.customerName)}</span>
              ${unread.has(item.protocol) ? `<span class="qi-unread" aria-label="Nova mensagem"></span>` : ""}
              <span class="qi-time">${relativeTime(activityAt(item))}</span>
            </div>
            <p class="qi-preview">${escapeHtml(previewOf(item))}</p>
            <div class="qi-tags">
              <span class="qi-protocol">${escapeHtml(item.protocol)}</span>
              <span class="qi-reason">${escapeHtml(reasonLabels[item.reason] ?? item.reason)}</span>
              ${assignee}
            </div>
          </button>
        </li>`;
    })
    .join("");
}

function transcriptItem(entry) {
  if (entry.author === "system") {
    return `<li class="tm-system">${escapeHtml(entry.content)}</li>`;
  }

  const config = {
    customer: {
      side: "in",
      name: selected?.customerName ?? "Cliente",
      role: "cliente",
      avatar: `<span class="avatar avatar-customer">${escapeHtml(initials(selected?.customerName))}</span>`,
    },
    bot: {
      side: "out",
      name: "Assistente",
      role: "virtual",
      avatar: `<span class="avatar avatar-bot">${icons.bean}</span>`,
    },
    human: {
      side: "out",
      name: entry.authorName ?? "Atendente",
      role: entry.authorName === agentName() ? "você" : "equipe",
      avatar: `<span class="avatar avatar-human">${escapeHtml(initials(entry.authorName))}</span>`,
    },
  }[entry.author];

  return `
    <li class="tm tm-${config.side} tm-${entry.author}">
      ${config.avatar}
      <div class="tm-body">
        <div class="tm-meta">
          <span>${escapeHtml(config.name)}</span>
          <span class="tm-role">${escapeHtml(config.role)}</span>
          <time>${formatTime(entry.at)}</time>
        </div>
        <div class="tm-text">${richText(entry.content)}</div>
      </div>
    </li>`;
}

function renderTranscript() {
  transcriptEl.innerHTML = transcript.length
    ? transcript.map(transcriptItem).join("")
    : `<li class="tm-system">Sem mensagens registradas para esta conversa.</li>`;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function appendTranscript(entry) {
  if (transcript.some((item) => item.id === entry.id)) return;
  if (transcript.length === 0) transcriptEl.innerHTML = "";
  transcript.push(entry);
  transcriptEl.insertAdjacentHTML("beforeend", transcriptItem(entry));
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function briefSection(label, body) {
  if (!body) return "";
  return `<section class="brief-section"><p class="brief-label">${label}</p>${body}</section>`;
}

function renderBrief() {
  if (!selected) {
    briefContent.innerHTML = `<p class="brief-empty">Selecione um atendimento para ver o resumo preparado pelo assistente.</p>`;
    return;
  }

  const recommendations = (selected.recommendations ?? []).length
    ? `<ol class="brief-list">${selected.recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
    : "";

  const text = (value) => (value ? `<p class="brief-text">${richText(value)}</p>` : "");

  briefContent.innerHTML = `
    <div class="brief-quote">
      <p>“${escapeHtml(selected.requestedAction)}”</p>
      <span>O que o cliente está pedindo</span>
    </div>
    <div class="brief-tags">
      <span class="badge-pill badge-amber">${escapeHtml(reasonLabels[selected.reason] ?? selected.reason)}</span>
      ${selected.orderId ? `<span class="badge-pill mono">${escapeHtml(selected.orderId)}</span>` : ""}
      <span class="badge-pill">Aberto às ${formatTime(selected.createdAt)}</span>
    </div>
    ${briefSection("Cenário", text(selected.scenario))}
    ${briefSection("Análise de causa raiz", text(selected.rootCauseAnalysis))}
    ${briefSection("Recomendações do assistente", recommendations)}
    ${briefSection("Resumo da conversa", text(selected.conversationSummary))}`;
}

function renderThread() {
  if (!selected) {
    threadEmpty.hidden = false;
    threadView.hidden = true;
    renderBrief();
    return;
  }

  threadEmpty.hidden = true;
  threadView.hidden = false;

  threadName.textContent = selected.customerName;
  threadProtocol.textContent = selected.protocol;

  const dotClass = {
    waiting: "is-waiting",
    in_progress: "is-human",
    resolved: "is-resolved",
  }[selected.status];
  threadStatus.querySelector(".status-dot").className = `status-dot ${dotClass}`;
  threadStatus.lastElementChild.textContent =
    selected.status === "in_progress" && selected.assignee
      ? `${statusLabels.in_progress} · ${selected.assignee}`
      : statusLabels[selected.status];

  const mine = selected.status === "in_progress" && selected.assignee === agentName();

  claimBtn.hidden = selected.status !== "waiting";
  resolveBtn.hidden = !mine;

  let note = "";
  if (selected.status === "waiting") note = "Assuma o atendimento para responder. O cliente vê seu nome assim que você entrar.";
  else if (selected.status === "resolved") note = "Atendimento encerrado. O assistente virtual voltou a responder este cliente.";
  else if (!mine) note = `Em atendimento por ${selected.assignee}.`;

  replyNote.textContent = note;
  replyInput.disabled = !mine;
  replySend.disabled = !mine;
  replyForm.classList.toggle("is-locked", !mine);
  replyInput.placeholder = mine ? `Responder a ${selected.customerName}…` : "Respostas desabilitadas";

  renderBrief();
}

function upsert(escalation) {
  const previous = escalations.get(escalation.protocol);
  const merged = {
    lastEntry: null,
    messageCount: 0,
    ...previous,
    ...escalation,
  };
  escalations.set(escalation.protocol, merged);
  if (selected?.protocol === escalation.protocol) selected = merged;
  return { previous, merged };
}

async function select(protocol, { focusThread = true } = {}) {
  try {
    const res = await fetch(`/api/escalations/${encodeURIComponent(protocol)}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const data = await res.json();

    upsert(data.escalation);
    selected = escalations.get(protocol);
    transcript = data.transcript ?? [];
    unread.delete(protocol);

    if (selected.status !== filter) filter = selected.status;
    if (location.hash !== `#${protocol}`) history.replaceState(null, "", `#${protocol}`);
    if (focusThread) consoleEl.dataset.view = "thread";

    renderQueue();
    renderThread();
    renderTranscript();
  } catch (error) {
    toast(error.message || "Não foi possível abrir o atendimento.");
  }
}

function requireAgent() {
  if (agentName()) return true;
  toast("Informe seu nome no topo antes de assumir um atendimento.");
  agentInput.focus();
  return false;
}

async function act(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (error) {
    toast(error.message || "Algo deu errado.");
  } finally {
    busy = false;
  }
}

claimBtn.addEventListener("click", () => {
  if (!selected || !requireAgent()) return;
  act(async () => {
    const { payload } = await postJson(`/api/escalations/${selected.protocol}/claim`, { agentName: agentName() });
    upsert(payload.escalation);
    filter = "in_progress";
    renderQueue();
    renderThread();
    replyInput.focus();
  });
});

resolveBtn.addEventListener("click", () => {
  if (!selected || !requireAgent()) return;
  act(async () => {
    const { payload } = await postJson(`/api/escalations/${selected.protocol}/resolve`, { agentName: agentName() });
    upsert(payload.escalation);
    filter = "resolved";
    renderQueue();
    renderThread();
  });
});

function autoGrow() {
  replyInput.style.height = "auto";
  replyInput.style.height = `${Math.min(replyInput.scrollHeight, 160)}px`;
  replyInput.style.overflowY = replyInput.scrollHeight > 160 ? "auto" : "hidden";
}

function sendReply() {
  const content = replyInput.value.trim();
  if (!content || !selected) return;
  act(async () => {
    const { payload } = await postJson(`/api/escalations/${selected.protocol}/messages`, {
      agentName: agentName(),
      content,
    });
    replyInput.value = "";
    autoGrow();
    appendTranscript(payload.entry);
    replyInput.focus();
  });
}

replyForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendReply();
});

replyInput.addEventListener("input", autoGrow);
replyInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendReply();
  }
});

tabsEl.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab");
  if (!tab) return;
  filter = tab.dataset.filter;
  renderQueue();
});

queueList.addEventListener("click", (event) => {
  const item = event.target.closest(".queue-item");
  if (item) select(item.dataset.protocol);
});

document.getElementById("thread-back").addEventListener("click", () => {
  consoleEl.dataset.view = "list";
});

document.getElementById("brief-toggle").addEventListener("click", () => {
  consoleEl.dataset.brief = "open";
});

document.getElementById("brief-close").addEventListener("click", () => {
  consoleEl.dataset.brief = "closed";
});

agentInput.value = local.get(AGENT_KEY) ?? "";
agentInput.addEventListener("input", () => {
  local.set(AGENT_KEY, agentName());
  renderAgent();
  if (selected) renderThread();
});

function setLive(online) {
  liveDot.className = `status-dot ${online ? "is-bot" : "is-offline"}`;
  liveLabel.textContent = online ? "Ao vivo" : "Reconectando…";
}

function connect() {
  const stream = new EventSource("/api/escalations/stream");

  stream.onopen = () => setLive(true);
  stream.onerror = () => setLive(false);

  stream.addEventListener("snapshot", (event) => {
    const data = parse(event);
    if (!data) return;
    escalations.clear();
    for (const item of data.escalations) escalations.set(item.protocol, item);
    if (selected) selected = escalations.get(selected.protocol) ?? selected;
    renderQueue();
    if (selected) renderThread();
    setLive(true);
  });

  stream.addEventListener("escalation", (event) => {
    const escalation = parse(event);
    if (!escalation) return;
    const { previous } = upsert(escalation);
    if (!previous) {
      unread.add(escalation.protocol);
      toast(`Nova transferência: ${escalation.customerName} · ${escalation.protocol}`);
    }
    renderQueue();
    if (selected?.protocol === escalation.protocol) renderThread();
  });

  stream.addEventListener("message", (event) => {
    const entry = parse(event);
    if (!entry) return;

    const owner = [...escalations.values()]
      .filter((item) => item.sessionId === entry.sessionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!owner) return;

    owner.lastEntry = entry;
    owner.messageCount = (owner.messageCount ?? 0) + 1;

    if (selected?.sessionId === entry.sessionId) {
      appendTranscript(entry);
    } else if (entry.author === "customer") {
      unread.add(owner.protocol);
    }
    renderQueue();
  });
}

setInterval(renderQueue, 30_000);

renderAgent();
renderThread();
renderQueue();
connect();

const initial = decodeURIComponent(location.hash.slice(1));
if (initial) select(initial, { focusThread: true });
