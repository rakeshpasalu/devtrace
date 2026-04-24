import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Terminal, Pause, Play, Trash2, Search, Copy, Check, ChevronDown,
  ChevronRight, X, ArrowDown, Database, Globe, Cpu, AlertTriangle,
  GitBranch, Zap, Radio
} from "lucide-react";
import { formatDuration, spanColor } from "../utils.js";

/* ─── Category / color mapping ─── */
const EVENT_CATEGORY = {
  JVM_STARTED: "startup", AGENT_ATTACHED: "startup", CLASS_TRANSFORMED: "startup",
  CLASS_LOADING_SNAPSHOT: "startup", SPRING_APPLICATION_RUN: "startup",
  SPRING_LIFECYCLE: "startup", BEAN_CREATION: "bean", BEAN_NODE: "bean", BEAN_EDGE: "bean",
  AUTO_CONFIGURATION: "startup",
  HTTP_REQUEST: "request", HTTP_RESPONSE: "request",
  SPAN_STARTED: "span", SPAN_FINISHED: "span",
  ERROR: "error", SQL_STATEMENT: "sql", ASYNC_HANDOFF: "async",
};

const CATEGORY_COLORS = {
  startup: "#4ade80",
  bean: "var(--amber)",
  request: "var(--green)",
  span: "var(--accent)",
  error: "var(--red)",
  sql: "var(--purple)",
  async: "#2dd4bf",
};

const CATEGORY_ICONS = {
  startup: Zap,
  bean: GitBranch,
  request: Globe,
  span: Cpu,
  error: AlertTriangle,
  sql: Database,
  async: Radio,
};

const MAX_FEED_SIZE = 800;

export default function NerdConsole({ recentEvents, snapshot }) {
  const [paused, setPaused] = useState(false);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [feedEvents, setFeedEvents] = useState([]);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const feedRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    const events = recentEvents ?? [];
    if (events.length > prevCountRef.current) {
      const newOnes = events.slice(prevCountRef.current);
      setFeedEvents(prev => [...prev, ...newOnes].slice(-MAX_FEED_SIZE));
    }
    prevCountRef.current = events.length;
  }, [recentEvents, paused]);

  useEffect(() => {
    if (autoScroll && !paused && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [feedEvents, paused, autoScroll]);

  const filtered = useMemo(() => {
    let arr = feedEvents;
    if (typeFilter !== "ALL") {
      arr = arr.filter(e => (EVENT_CATEGORY[e.type] ?? "span") === typeFilter);
    }
    if (query) {
      const q = query.toLowerCase();
      arr = arr.filter(e =>
        (e.type ?? "").toLowerCase().includes(q) ||
        (e.name ?? "").toLowerCase().includes(q) ||
        (e.service ?? "").toLowerCase().includes(q) ||
        (e.className ?? "").toLowerCase().includes(q) ||
        (e.methodName ?? "").toLowerCase().includes(q) ||
        (e.traceId ?? "").toLowerCase().includes(q) ||
        JSON.stringify(e.attributes ?? {}).toLowerCase().includes(q)
      );
    }
    return arr;
  }, [feedEvents, typeFilter, query]);

  const stats = snapshot?.stats ?? {};

  const eventsPerSec = useMemo(() => {
    if (feedEvents.length < 2) return "0.0";
    const first = feedEvents[0]?.timestamp;
    const last = feedEvents[feedEvents.length - 1]?.timestamp;
    const diffSec = (last - first) / 1000;
    return diffSec > 0 ? (feedEvents.length / diffSec).toFixed(1) : "0.0";
  }, [feedEvents]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const e of feedEvents) {
      const cat = EVENT_CATEGORY[e.type] ?? "span";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [feedEvents]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearFeed = () => {
    setFeedEvents([]);
    prevCountRef.current = (recentEvents ?? []).length;
  };

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Terminal size={22} /> Nerd Console
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={`btn ${paused ? "btn-primary" : "btn-ghost"}`} onClick={() => setPaused(p => !p)}>
            {paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
          </button>
          <button className="btn btn-ghost" onClick={() => setAutoScroll(a => !a)}
            style={{ color: autoScroll ? "var(--accent)" : "var(--text-muted)" }}>
            <ArrowDown size={14} /> {autoScroll ? "Auto" : "Manual"}
          </button>
          <button className="btn btn-ghost" onClick={clearFeed} style={{ color: "var(--text-muted)" }}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="nerdcon-stats">
        <div className="nerdcon-stat">
          <span className="nerdcon-stat-value" style={{ color: "var(--accent)" }}>{eventsPerSec}</span>
          <span className="nerdcon-stat-label">evt/s</span>
        </div>
        <div className="nerdcon-stat">
          <span className="nerdcon-stat-value">{stats.totalEvents ?? 0}</span>
          <span className="nerdcon-stat-label">ingested</span>
        </div>
        <div className="nerdcon-stat">
          <span className="nerdcon-stat-value">{stats.retainedEvents ?? 0}</span>
          <span className="nerdcon-stat-label">retained</span>
        </div>
        <div className="nerdcon-stat">
          <span className="nerdcon-stat-value" style={{ color: stats.activeRequests > 0 ? "var(--green)" : undefined }}>{stats.activeRequests ?? 0}</span>
          <span className="nerdcon-stat-label">active</span>
        </div>
        <div className="nerdcon-stat">
          <span className="nerdcon-stat-value">{filtered.length}</span>
          <span className="nerdcon-stat-label">buffer</span>
        </div>
        <div className="nerdcon-stat">
          <span className="nerdcon-stat-value">{stats.services ?? 0}</span>
          <span className="nerdcon-stat-label">services</span>
        </div>
      </div>

      {/* Filters */}
      <div className="nerdcon-filters">
        <div className="nerdcon-search">
          <Search size={14} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Filter events… (type, name, class, traceId, SQL…)" />
          {query && <button className="nerdcon-search-clear" onClick={() => setQuery("")}><X size={12} /></button>}
        </div>
        <div className="nerdcon-cat-filters">
          <button className={`nerdcon-cat-btn ${typeFilter === "ALL" ? "active" : ""}`}
            onClick={() => setTypeFilter("ALL")}>
            All <span className="nerdcon-cat-count">{feedEvents.length}</span>
          </button>
          {["startup", "request", "span", "sql", "bean", "error", "async"].map(cat => (
            <button key={cat} className={`nerdcon-cat-btn ${typeFilter === cat ? "active" : ""}`}
              onClick={() => setTypeFilter(cat)}
              style={{ "--cat-color": CATEGORY_COLORS[cat] }}>
              {cat} <span className="nerdcon-cat-count">{categoryCounts[cat] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Terminal */}
      <div className="nerdcon-terminal">
        <div className="nerdcon-terminal-header">
          <span className="nerdcon-terminal-dot red" />
          <span className="nerdcon-terminal-dot yellow" />
          <span className="nerdcon-terminal-dot green" />
          <span className="nerdcon-terminal-title">devtrace ~ event stream</span>
          {paused && <span className="nerdcon-paused-badge">PAUSED</span>}
        </div>
        <div className="nerdcon-terminal-body" ref={feedRef}>
          {filtered.length === 0 ? (
            <div className="nerdcon-empty">
              <Terminal size={28} style={{ opacity: 0.3 }} />
              <p>{paused ? "Feed paused — click Resume" : "Waiting for events… send traffic to your instrumented app"}</p>
            </div>
          ) : (
            filtered.map((e, i) => {
              const id = e.eventId ?? e.spanId ?? `nerd-${i}`;
              const expanded = expandedIds.has(id);
              return <NerdEventRow key={id} event={e} expanded={expanded} onToggle={() => toggleExpand(id)} />;
            })
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Single event row ─── */
function NerdEventRow({ event, expanded, onToggle }) {
  const [copied, setCopied] = useState(false);
  const cat = EVENT_CATEGORY[event.type] ?? "span";
  const color = CATEGORY_COLORS[cat] ?? "var(--text-muted)";
  const Icon = CATEGORY_ICONS[cat] ?? Radio;
  const isError = event.type === "ERROR" || event.status === "ERROR";
  const isSlow = Number(event.durationMs ?? 0) >= 150;

  const label = event.className
    ? `${event.className.split(".").pop()}.${event.methodName ?? ""}`
    : event.name ?? event.type ?? "event";

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`nerdcon-row ${isError ? "is-error" : ""} ${isSlow ? "is-slow" : ""}`}>
      <div className="nerdcon-row-main" onClick={onToggle}>
        <button className="nerdcon-expand-btn">
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <span className="nerdcon-row-time">{formatTime(event.timestamp)}</span>
        <span className="nerdcon-row-icon" style={{ color }}><Icon size={12} /></span>
        <span className="nerdcon-row-type" style={{ color }}>{event.type}</span>
        <span className="nerdcon-row-name" title={label}>{label}</span>
        {event.component && (
          <span className="nerdcon-row-component" style={{ color: spanColor(event.component) }}>{event.component}</span>
        )}
        {event.service && <span className="nerdcon-row-service">{event.service}</span>}
        {event.durationMs != null && Number(event.durationMs) > 0 && (
          <span className={`nerdcon-row-dur ${isSlow ? "is-slow" : ""}`}>{formatDuration(event.durationMs)}</span>
        )}
        {isError && <span className="nerdcon-row-err-badge">ERR</span>}
      </div>

      {expanded && (
        <div className="nerdcon-detail">
          <div className="nerdcon-detail-top">
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>Event Detail</span>
            <button className="btn btn-ghost" onClick={copyJson} style={{ fontSize: 10, padding: "2px 6px" }}>
              {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> JSON</>}
            </button>
          </div>
          <div className="nerdcon-detail-fields">
            {event.traceId && <NerdField label="traceId" value={event.traceId} />}
            {event.spanId && <NerdField label="spanId" value={event.spanId} />}
            {event.parentSpanId && <NerdField label="parentSpan" value={event.parentSpanId} />}
            {event.requestId && <NerdField label="requestId" value={event.requestId} />}
            {event.service && <NerdField label="service" value={event.service} />}
            {event.component && <NerdField label="component" value={event.component} />}
            {event.className && <NerdField label="class" value={event.className} />}
            {event.methodName && <NerdField label="method" value={event.methodName} />}
            {event.threadName && <NerdField label="thread" value={event.threadName} />}
            {event.durationMs != null && <NerdField label="duration" value={formatDuration(event.durationMs)} />}
            {event.status && <NerdField label="status" value={event.status} />}
          </div>
          {event.attributes && Object.keys(event.attributes).length > 0 && (
            <pre className="nerdcon-json">{JSON.stringify(event.attributes, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function NerdField({ label, value }) {
  return (
    <div className="nerdcon-field">
      <span className="nerdcon-field-key">{label}</span>
      <span className="nerdcon-field-eq">=</span>
      <span className="nerdcon-field-val">{value}</span>
    </div>
  );
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 1 });
}
