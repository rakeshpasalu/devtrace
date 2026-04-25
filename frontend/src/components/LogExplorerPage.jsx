import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Filter, ArrowDown, Link2, Pause, Play, Trash2 } from "lucide-react";
import { formatTimestamp } from "../utils.js";

const LOG_LEVELS = ["ALL", "TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

const LEVEL_COLORS = {
  TRACE: "#8892a4",
  DEBUG: "#60a5fa",
  INFO: "#22c55e",
  WARN: "#f59e0b",
  ERROR: "#ef4444",
  FATAL: "#dc2626",
};

export default function LogExplorerPage({ logs = [], onNavigateToTrace }) {
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [paused, setPaused] = useState(false);
  const bottomRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Snapshot logs when paused
  const [pausedLogs, setPausedLogs] = useState([]);
  useEffect(() => {
    if (!paused) setPausedLogs(logs);
  }, [logs, paused]);

  const activeLogs = paused ? pausedLogs : logs;

  const filtered = useMemo(() => {
    let result = activeLogs;
    if (levelFilter !== "ALL") {
      result = result.filter(l => l.level === levelFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        (l.message ?? "").toLowerCase().includes(q) ||
        (l.logger ?? "").toLowerCase().includes(q) ||
        (l.traceId ?? "").toLowerCase().includes(q) ||
        (l.exception ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [activeLogs, levelFilter, search]);

  // Level distribution for mini-chart
  const levelCounts = useMemo(() => {
    const counts = {};
    for (const l of activeLogs) {
      counts[l.level] = (counts[l.level] ?? 0) + 1;
    }
    return counts;
  }, [activeLogs]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !paused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered, autoScroll, paused]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const levelBadge = (level) => (
    <span className="log-level-badge" style={{
      color: LEVEL_COLORS[level] ?? "var(--text-secondary)",
      background: `${LEVEL_COLORS[level] ?? "#8892a4"}18`,
    }}>
      {level}
    </span>
  );

  return (
    <>
      <div className="page-header">
        <h1>Log Explorer</h1>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {filtered.length} / {activeLogs.length} logs
        </span>
      </div>

      {/* Toolbar */}
      <div className="log-toolbar">
        <div className="log-search-wrap">
          <Search size={14} />
          <input
            className="log-search-input"
            placeholder="Search messages, loggers, trace IDs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="log-level-filters">
          <Filter size={14} style={{ color: "var(--text-muted)" }} />
          {LOG_LEVELS.map(l => (
            <button key={l}
              className={`log-level-chip ${levelFilter === l ? "active" : ""}`}
              style={l !== "ALL" ? { "--chip-color": LEVEL_COLORS[l] } : {}}
              onClick={() => setLevelFilter(l)}
            >
              {l}
              {l !== "ALL" && levelCounts[l] ? <span className="log-level-count">{levelCounts[l]}</span> : null}
            </button>
          ))}
        </div>

        <div className="log-toolbar-actions">
          <button className={`btn btn-sm ${paused ? "btn-primary" : ""}`} onClick={() => setPaused(p => !p)} title={paused ? "Resume" : "Pause"}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button className={`btn btn-sm ${autoScroll ? "btn-primary" : ""}`} onClick={() => setAutoScroll(a => !a)} title="Auto-scroll">
            <ArrowDown size={14} /> Auto-scroll
          </button>
        </div>
      </div>

      {/* Log table */}
      <div className="log-table-wrap" ref={scrollContainerRef}>
        <table className="log-table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Timestamp</th>
              <th style={{ width: 64 }}>Level</th>
              <th style={{ width: 200 }}>Logger</th>
              <th>Message</th>
              <th style={{ width: 80 }}>Trace</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                  {activeLogs.length === 0 ? "No logs ingested yet. Send LOG events to /ingest to get started." : "No logs match your filters."}
                </td>
              </tr>
            ) : filtered.map((log) => {
              const isExpanded = expandedIds.has(log.id);
              const hasException = !!log.exception;
              const isError = log.level === "ERROR" || log.level === "FATAL";
              return (
                <tr key={log.id}
                  className={`log-row ${isError ? "log-row-error" : ""} ${isExpanded ? "log-row-expanded" : ""}`}
                  onClick={() => (hasException || log.message?.length > 120) && toggleExpand(log.id)}
                  style={{ cursor: hasException || log.message?.length > 120 ? "pointer" : "default" }}
                >
                  <td className="log-cell-ts">{formatTimestamp(log.timestamp)}</td>
                  <td>{levelBadge(log.level)}</td>
                  <td className="log-cell-logger" title={log.logger}>
                    {log.logger?.split(".").pop() ?? log.logger}
                    {log.thread && <span className="log-thread">[{log.thread}]</span>}
                  </td>
                  <td className="log-cell-msg">
                    <div className={isExpanded ? "log-msg-full" : "log-msg-truncated"}>
                      {log.message}
                    </div>
                    {isExpanded && hasException && (
                      <pre className="log-exception">{log.exception}</pre>
                    )}
                  </td>
                  <td className="log-cell-trace">
                    {log.traceId && (
                      <button className="log-trace-link" onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToTrace?.(log.traceId);
                      }} title={`Go to trace ${log.traceId}`}>
                        <Link2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div ref={bottomRef} />
      </div>
    </>
  );
}

