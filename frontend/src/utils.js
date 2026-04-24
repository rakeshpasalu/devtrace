export function apiBase() {
  return import.meta.env.VITE_DEVTRACE_API_URL ?? "http://127.0.0.1:9000";
}

export function apiKey() {
  try {
    const settings = JSON.parse(localStorage.getItem("devtrace-settings") ?? "{}");
    return settings.apiKey ?? import.meta.env.VITE_DEVTRACE_API_KEY ?? "";
  } catch {
    return "";
  }
}

export function authHeaders() {
  const key = apiKey();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

export function authFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { ...options.headers, ...authHeaders() },
  });
}

export function websocketUrl() {
  const base = apiBase().replace(/^http/, "ws") + "/ws";
  const key = apiKey();
  return key ? `${base}?apiKey=${encodeURIComponent(key)}` : base;
}

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "n/a";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}

export function formatDuration(durationMs) {
  const value = Number(durationMs ?? 0);
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${value.toFixed(0)}ms`;
}

export function spanColor(component) {
  const palette = {
    "http-server": "#22c55e",
    "http-client": "#38bdf8",
    controller: "#fb7185",
    service: "#facc15",
    repository: "#f97316",
    database: "#a78bfa",
    async: "#2dd4bf",
    "spring-boot": "#4ade80",
    "spring-beans": "#f59e0b",
    "auto-configuration": "#fbbf24"
  };
  return palette[component] ?? "#60a5fa";
}

export function buildSpanTree(events) {
  const spans = (events ?? []).filter((event) => event.type === "SPAN_FINISHED");
  const byId = new Map();

  for (const span of spans) {
    byId.set(span.spanId, { ...span, children: [] });
  }

  const roots = [];
  for (const span of byId.values()) {
    const parent = byId.get(span.parentSpanId);
    if (parent) {
      parent.children.push(span);
    } else {
      roots.push(span);
    }
  }

  return roots.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
}

export function healthClassName(status) {
  if (String(status).toUpperCase() === "ERROR") {
    return "is-error";
  }
  if (String(status).toUpperCase() === "IN_PROGRESS") {
    return "is-live";
  }
  return "is-healthy";
}
