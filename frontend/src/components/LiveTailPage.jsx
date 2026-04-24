import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Radio, Pause, Play, Search, Filter, X, ChevronDown, ChevronRight,
  AlertTriangle, Database, Globe, GitBranch, Cpu, Zap, Clock, Copy, Check,
  ArrowDown, ArrowUp, Trash2
} from "lucide-react";
import { formatDuration, formatTimestamp, spanColor } from "../utils.js";

const TYPE_ICONS = {
  SPAN_FINISHED: Cpu,
  HTTP_REQUEST_START: Globe,
  HTTP_REQUEST_END: Globe,
  SQL_STATEMENT: Database,
  ERROR: AlertTriangle,
  BEAN_CREATION: GitBranch,
  SPRING_LIFECYCLE: Zap,
  DEFAULT: Radio,
};

const TYPE_COLORS = {
  SPAN_FINISHED: "var(--accent)",
  HTTP_REQUEST_START: "var(--green)",
  HTTP_REQUEST_END: "var(--green)",
  SQL_STATEMENT: "var(--purple)",
  ERROR: "var(--red)",
  BEAN_CREATION: "var(--amber)",
  SPRING_LIFECYCLE: "#4ade80",
  JVM_STARTED: "#38bdf8",
  AGENT_ATTACHED: "#38bdf8",
  DEFAULT: "var(--text-muted)",
};

/* ─── Main Page ─── */
export default function LiveTailPage({ recentEvents, snapshot }) {
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [componentFilter, setComponentFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all"); // all | error | slow | normal
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [autoScroll, setAutoScroll] = useState(true);
  const [maxEvents, setMaxEvents] = useState(500);
  const scrollRef = useRef(null);
  const prevLenRef = useRef(0);

  // Capture events when not paused
  const [frozenEvents, setFrozenEvents] = useState([]);
  const liveEvents = recentEvents ?? [];

  useEffect(() => {
    if (!paused) {
      setFrozenEvents(liveEvents);
    }
  }, [liveEvents, paused]);

  const displayEvents = paused ? frozenEvents : liveEvents;

  // Extract unique types, components, services
  const { allTypes, allComponents, allServices } = useMemo(() => {
    const types = new Set();
    const components = new Set();
    const services = new Set();
    for (const e of displayEvents) {
      if (e.type) types.add(e.type);
      if (e.component) components.add(e.component);
      if (e.service) services.add(e.service);
    }
    return {
      allTypes: [...types].sort(),
      allComponents: [...components].sort(),
      allServices: [...services].sort(),
    };
  }, [displayEvents]);

  // Filter
  const filtered = useMemo(() => {
    let arr = displayEvents;
    if (query) {
      const q = query.toLowerCase();
      arr = arr.filter(e =>
        (e.type ?? "").toLowerCase().includes(q) ||
        (e.name ?? "").toLowerCase().includes(q) ||
        (e.component ?? "").toLowerCase().includes(q) ||
        (e.service ?? "").toLowerCase().includes(q) ||
        (e.className ?? "").toLowerCase().includes(q) ||
        (e.methodName ?? "").toLowerCase().includes(q) ||
        (e.traceId ?? "").toLowerCase().includes(q) ||
        (e.spanId ?? "").toLowerCase().includes(q) ||
        JSON.stringify(e.attributes ?? {}).toLowerCase().includes(q)
      );
    }
    if (typeFilter) arr = arr.filter(e => e.type === typeFilter);
    if (componentFilter) arr = arr.filter(e => e.component === componentFilter);
    if (serviceFilter) arr = arr.filter(e => e.service === serviceFilter);
    if (severityFilter === "error") arr = arr.filter(e => e.type === "ERROR" || e.status === "ERROR");
    if (severityFilter === "slow") arr = arr.filter(e => Number(e.durationMs ?? 0) >= 150);
    if (severityFilter === "normal") arr = arr.filter(e => e.type !== "ERROR" && e.status !== "ERROR" && Number(e.durationMs ?? 0) < 150);

    return arr.slice(-maxEvents);
  }, [displayEvents, query, typeFilter, componentFilter, serviceFilter, severityFilter, maxEvents]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !paused && scrollRef.current && filtered.length > prevLenRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLenRef.current = filtered.length;
  }, [filtered.length, autoScroll, paused]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("");
    setComponentFilter("");
    setServiceFilter("");
    setSeverityFilter("all");
  };

  const hasFilters = query || typeFilter || componentFilter || serviceFilter || severityFilter !== "all";

  // Stats
  const stats = useMemo(() => {
    const errors = filtered.filter(e => e.type === "ERROR" || e.status === "ERROR").length;
    const slow = filtered.filter(e => Number(e.durationMs ?? 0) >= 150).length;
    return { total: filtered.length, errors, slow };
  }, [filtered]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radio size={22} /> Live Tail
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, fontSize: 11 }}>
            <span className="chip" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>{stats.total} events</span>
            {stats.errors > 0 && <span className="chip" style={{ background: "var(--red-glow)", color: "var(--red)" }}>{stats.errors} errors</span>}
            {stats.slow > 0 && <span className="chip" style={{ background: "rgba(250,204,21,0.1)", color: "var(--amber)" }}>{stats.slow} slow</span>}
          </div>
          <button className={`btn ${paused ? "btn-primary" : "btn-ghost"}`} onClick={() => setPaused(p => !p)}>
            {paused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
          </button>
          <button className={`btn btn-ghost`} onClick={() => setAutoScroll(a => !a)} title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
            style={{ color: autoScroll ? "var(--accent)" : "var(--text-muted)" }}>
            <ArrowDown size={14} /> {autoScroll ? "Auto" : "Manual"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="livetail-filters">
        <div className="livetail-search">
          <Search size={14} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search events… (type, name, class, trace ID, SQL…)" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="livetail-select">
          <option value="">All types</option>
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={componentFilter} onChange={e => setComponentFilter(e.target.value)} className="livetail-select">
          <option value="">All components</option>
          {allComponents.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="livetail-select">
          <option value="">All services</option>
          {allServices.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="livetail-severity-group">
          {["all", "error", "slow", "normal"].map(s => (
            <button key={s} className={`livetail-severity-btn ${severityFilter === s ? "active" : ""}`}
              onClick={() => setSeverityFilter(s)}>
              {s === "all" ? "All" : s === "error" ? "Errors" : s === "slow" ? "Slow" : "Normal"}
            </button>
          ))}
        </div>
        {hasFilters && (
          <button className="btn btn-ghost" onClick={clearFilters} style={{ fontSize: 11, padding: "4px 8px" }}>
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Event Stream */}
      <div className="livetail-stream" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="livetail-empty">
            <Radio size={32} style={{ color: "var(--accent)", opacity: 0.5 }} />
            <p>{paused ? "Stream paused. Resume to see new events." : hasFilters ? "No events match your filters." : "Waiting for events…"}</p>
          </div>
        ) : (
          filtered.map((event, idx) => {
            const id = event.eventId ?? event.spanId ?? `${idx}`;
            const expanded = expandedIds.has(id);
            return <LiveTailRow key={id} event={event} expanded={expanded} onToggle={() => toggleExpand(id)} />;
          })
        )}
      </div>

      {/* Footer */}
      <div className="livetail-footer">
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          Showing {filtered.length} of {displayEvents.length} events
          {paused && <> · <span style={{ color: "var(--amber)" }}>Paused</span></>}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Buffer:
            <select value={maxEvents} onChange={e => setMaxEvents(Number(e.target.value))}
              style={{ marginLeft: 4, padding: "2px 6px", fontSize: 11, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)" }}>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1K</option>
              <option value={2000}>2K</option>
            </select>
          </label>
        </div>
      </div>
    </>
  );
}

/* ─── Single Event Row ─── */
function LiveTailRow({ event, expanded, onToggle }) {
  const [copied, setCopied] = useState(false);
  const isError = event.type === "ERROR" || event.status === "ERROR";
  const isSlow = Number(event.durationMs ?? 0) >= 150;
  const Icon = TYPE_ICONS[event.type] ?? TYPE_ICONS.DEFAULT;
  const color = TYPE_COLORS[event.type] ?? TYPE_COLORS.DEFAULT;

  const label = event.className
    ? `${event.className.split(".").pop()}.${event.methodName ?? ""}`
    : event.name ?? event.type ?? "event";

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(event, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className={`livetail-row ${isError ? "is-error" : ""} ${isSlow ? "is-slow" : ""} ${expanded ? "is-expanded" : ""}`}>
      <div className="livetail-row-main" onClick={onToggle}>
        <button className="livetail-expand-btn">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <span className="livetail-row-time">{formatTimestamp(event.timestamp)}</span>
        <span className="livetail-row-icon" style={{ color }}><Icon size={14} /></span>
        <span className="livetail-row-type" style={{ color }}>{event.type}</span>
        <span className="livetail-row-label" title={label}>{label}</span>
        {event.component && (
          <span className="livetail-row-component" style={{ color: spanColor(event.component) }}>{event.component}</span>
        )}
        {event.service && (
          <span className="livetail-row-service">{event.service}</span>
        )}
        {event.durationMs != null && Number(event.durationMs) > 0 && (
          <span className={`livetail-row-dur ${isSlow ? "is-slow" : ""}`}>{formatDuration(event.durationMs)}</span>
        )}
        {isError && <span className="livetail-row-badge-error">ERR</span>}
      </div>

      {expanded && (
        <div className="livetail-detail">
          <div className="livetail-detail-header">
            <span style={{ fontSize: 11, fontWeight: 600 }}>Event Detail</span>
            <button className="btn btn-ghost" onClick={copyJson} style={{ fontSize: 10, padding: "2px 6px" }}>
              {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy JSON</>}
            </button>
          </div>
          <div className="livetail-detail-grid">
            {event.traceId && <DetailField label="Trace ID" value={event.traceId} mono />}
            {event.spanId && <DetailField label="Span ID" value={event.spanId} mono />}
            {event.parentSpanId && <DetailField label="Parent Span" value={event.parentSpanId} mono />}
            {event.requestId && <DetailField label="Request ID" value={event.requestId} mono />}
            {event.service && <DetailField label="Service" value={event.service} />}
            {event.component && <DetailField label="Component" value={event.component} />}
            {event.className && <DetailField label="Class" value={event.className} mono />}
            {event.methodName && <DetailField label="Method" value={event.methodName} mono />}
            {event.durationMs != null && <DetailField label="Duration" value={formatDuration(event.durationMs)} />}
            {event.threadName && <DetailField label="Thread" value={event.threadName} mono />}
            {event.status && <DetailField label="Status" value={event.status} />}
          </div>
          {event.attributes && Object.keys(event.attributes).length > 0 && (
            <div className="livetail-attrs">
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>Attributes</div>
              <pre className="livetail-json">{JSON.stringify(event.attributes, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value, mono }) {
  return (
    <div className="livetail-field">
      <span className="livetail-field-label">{label}</span>
      <span className={`livetail-field-value ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

