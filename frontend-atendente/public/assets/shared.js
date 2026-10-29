window.Cafe = (() => {
  const icons = {
    bean: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="12" rx="7.5" ry="10" transform="rotate(35 12 12)" fill="currentColor"/><path d="M8.2 18.6c2.6-2.2 1.2-5.2 3.6-7.4 2.2-2 3.4-4.6 3.9-6.6" stroke="#faf9f5" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    panel: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M14.5 4.5v15" stroke="currentColor" stroke-width="1.8"/></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };

  const reasonLabels = {
    customer_requested_human: "Pedido do cliente",
    outside_policy: "Fora da política",
    beyond_agent_capability: "Além da capacidade",
    agent_stuck: "Agente travado",
  };

  const statusLabels = {
    waiting: "Aguardando",
    in_progress: "Em atendimento",
    resolved: "Encerrado",
  };

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function richText(text) {
    return escapeHtml(text)
      .replace(/^[ \t]*[*-][ \t]+/gm, "• ")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  function plainText(text) {
    return String(text ?? "")
      .replace(/^[ 	]*[*-][ 	]+/gm, "• ")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function initials(name) {
    const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    const first = parts[0][0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function formatTime(iso) {
    const date = iso ? new Date(iso) : new Date();
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function relativeTime(iso) {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "agora";
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    return new Date(iso).toLocaleDateString("pt-BR");
  }

  function storage(kind) {
    return {
      get(key) {
        try {
          return window[kind].getItem(key);
        } catch {
          return null;
        }
      },
      set(key, value) {
        try {
          window[kind].setItem(key, value);
        } catch {}
      },
    };
  }

  function toast(message, ms = 3600) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => (el.hidden = true), ms);
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
    return { status: res.status, payload };
  }

  function parse(event) {
    try {
      return JSON.parse(event.data);
    } catch {
      return null;
    }
  }

  return {
    icons,
    reasonLabels,
    statusLabels,
    escapeHtml,
    richText,
    plainText,
    initials,
    formatTime,
    relativeTime,
    session: storage("sessionStorage"),
    local: storage("localStorage"),
    toast,
    postJson,
    parse,
  };
})();
