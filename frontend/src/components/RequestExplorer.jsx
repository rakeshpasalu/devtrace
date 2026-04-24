import { useMemo, useState } from "react";
import { formatDuration, healthClassName } from "../utils.js";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";

const METHOD_COLORS = {
  GET:    { bg: "rgba(52,211,153,0.12)", color: "#34d399" },
  POST:   { bg: "rgba(96,165,250,0.12)", color: "#60a5fa" },
  PUT:    { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
  PATCH:  { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
  DELETE: { bg: "rgba(248,113,113,0.12)", color: "#f87171" },
};

function statusClass(status) {
  const s = String(status).toUpperCase();
  if (s === "ERROR" || s.startsWith("5")) return "error";
  if (s === "IN_PROGRESS") return "pending";
  if (s.startsWith("4")) return "warn";
  return "ok";
}

function relativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

export default function RequestExplorer({ requests, selectedTraceId, onSelectTrace }) {
  const [sortField, setSortField] = useState("time");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...requests];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortField === "time") cmp = (a.lastSeen ?? 0) - (b.lastSeen ?? 0);
      else if (sortField === "duration") cmp = (a.durationMs ?? 0) - (b.durationMs ?? 0);
      else if (sortField === "status") cmp = String(a.status ?? "").localeCompare(String(b.status ?? ""));
      else if (sortField === "method") cmp = (a.method ?? "").localeCompare(b.method ?? "");
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [requests, sortField, sortAsc]);

  function toggleSort(field) {
    if (sortField === field) setSortAsc(p => !p);
    else { setSortField(field); setSortAsc(false); }
  }

  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={32} />
        <p>No matching requests yet.<br/>Launch an instrumented Spring Boot app and send traffic.</p>
      </div>
    );
  }

  return (
    <div className="rex-container">
      {/* Sort bar */}
      <div className="rex-sort-bar">
        <span className="rex-sort-label">
          {requests.length} request{requests.length !== 1 ? "s" : ""}
        </span>
        <div className="rex-sort-buttons">
          {[
            { id: "time", label: "Recent" },
            { id: "duration", label: "Duration" },
            { id: "status", label: "Status" },
          ].map(s => (
            <button
              key={s.id}
              className={`rex-sort-btn ${sortField === s.id ? "active" : ""}`}
              onClick={() => toggleSort(s.id)}
            >
              {s.label}
              {sortField === s.id && (
                sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Request cards */}
      <div className="rex-list">
        {sorted.map(r => {
          const isSelected = selectedTraceId === r.traceId;
          const mc = METHOD_COLORS[r.method] ?? { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
          const sc = statusClass(r.status);
          const isSlow = (r.durationMs ?? 0) >= 500;

          return (
            <button
              key={r.traceId}
              type="button"
              className={`rex-card ${isSelected ? "is-selected" : ""} ${sc === "error" ? "has-error" : ""}`}
              onClick={() => onSelectTrace(r.traceId)}
            >
              {/* Row 1: Method badge + path */}
              <div className="rex-card-top">
                <span className="rex-method" style={{ background: mc.bg, color: mc.color }}>
                  {r.method}
                </span>
                <span className="rex-path" title={r.path}>
                  {r.path}
                </span>
              </div>

              {/* Row 2: Service | Status | Duration | Time – strict grid */}
              <div className="rex-card-bottom">
                <span className="rex-service" title={r.service}>
                  {r.service ?? "unknown"}
                </span>
                <span className={`rex-status rex-status--${sc}`}>
                  {r.status}
                </span>
                <span className={`rex-duration ${isSlow ? "is-slow" : ""}`}>
                  {formatDuration(r.durationMs)}
                </span>
                <span className="rex-time">
                  {relativeTime(r.lastSeen)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
