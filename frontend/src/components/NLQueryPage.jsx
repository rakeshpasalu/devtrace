import { useCallback, useState, useMemo } from "react";
import {
  Search, Brain, Activity, AlertTriangle, Database, Clock, DollarSign,
  Bot, ChevronDown, ChevronRight, FileText, Hash, Zap, ExternalLink,
  ArrowRight, Filter
} from "lucide-react";
import { formatDuration, formatTimestamp, authFetch, apiBase } from "../utils.js";

export default function NLQueryPage({ snapshot, onNavigateToTrace, onNavigate }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleQuery = useCallback(async (q) => {
    const text = q ?? query;
    if (!text.trim()) return;
    setLoading(true);
    try {
      const r = await authFetch(`${apiBase()}/api/v1/query?q=${encodeURIComponent(text)}`);
      if (r.ok) {
        const data = await r.json();
        setResult(data);
        setHistory(h => [text, ...h.filter(x => x !== text)].slice(0, 10));
      }
    } catch {}
    setLoading(false);
  }, [query]);

  const suggestions = [
    "Show me all errors in the last 5 minutes",
    "Which endpoints are slow?",
    "Find database queries",
    "Most expensive agent sessions",
    "How many requests today?",
    "Agent sessions with anomalies",
    "GET /api/orders",
    "Show logs from ngsd-order-management",
  ];

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Brain size={22} /> Ask DevTrace
        </h1>
      </div>

      {/* Query bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-body)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--border)" }}>
            <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleQuery()}
              placeholder="Ask anything about your traces, logs, agents, and endpoints..."
              style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 14, width: "100%", fontFamily: "inherit" }} />
          </div>
          <button className="btn btn-primary" onClick={() => handleQuery()} disabled={loading || !query.trim()}
            style={{ padding: "8px 20px", display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <Activity size={14} className="spin" /> : <Zap size={14} />}
            {loading ? "Querying…" : "Ask"}
          </button>
        </div>

        {/* Suggestions */}
        {!result && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {suggestions.map((s, i) => (
              <button key={i} className="chip" onClick={() => { setQuery(s); handleQuery(s); }}
                style={{ cursor: "pointer", fontSize: 11, transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--accent-glow)"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div>
          {/* Interpretation badge */}
          <div className="card" style={{ marginBottom: 12, background: "var(--accent-glow)", borderColor: "rgba(96,165,250,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <Brain size={14} style={{ color: "var(--accent)" }} />
              <span style={{ color: "var(--text-muted)" }}>Interpreted as:</span>
              <strong style={{ color: "var(--text-primary)" }}>{result.interpretedAs}</strong>
            </div>
          </div>

          {/* Stats summary */}
          {result.stats && Object.keys(result.stats).length > 0 && (
            <div className="metrics-row" style={{ marginBottom: 16 }}>
              {Object.entries(result.stats).map(([key, val]) => (
                <StatCard key={key} label={key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")} value={
                  typeof val === "number" && key.includes("ost") ? `$${val.toFixed(2)}` : val
                } />
              ))}
            </div>
          )}

          {/* Trace results */}
          {result.results?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={14} /> Results
                <span className="chip" style={{ fontSize: 10 }}>{result.results.length}</span>
              </div>
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                {result.results.map((r, i) => (
                  <ResultRow key={r.traceId ?? r.sessionId ?? i} item={r}
                    onNavigate={id => { if (onNavigateToTrace) onNavigateToTrace(id); }} />
                ))}
              </div>
            </div>
          )}

          {/* Error logs */}
          {result.errorLogs?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--red)", display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={14} /> Error Logs
                <span className="chip" style={{ fontSize: 10, background: "rgba(248,113,113,0.15)", color: "var(--red)" }}>{result.errorLogs.length}</span>
              </div>
              {result.errorLogs.slice(0, 10).map((l, i) => (
                <div key={i} style={{ padding: "4px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", fontSize: 12 }}>
                  <span style={{ color: "var(--red)", fontWeight: 600, marginRight: 8 }}>{l.level}</span>
                  <span style={{ color: "var(--text-muted)", marginRight: 8 }}>{l.logger?.split(".")?.pop()}</span>
                  <span>{l.message?.slice(0, 120)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Matching logs */}
          {result.matchingLogs?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <FileText size={14} /> Matching Logs
                <span className="chip" style={{ fontSize: 10 }}>{result.matchingLogs.length}</span>
              </div>
              {result.matchingLogs.slice(0, 10).map((l, i) => (
                <div key={i} style={{ padding: "4px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", fontSize: 12 }}>
                  <span className={`status-badge ${l.level === "ERROR" ? "error" : l.level === "WARN" ? "pending" : "ok"}`} style={{ fontSize: 9, marginRight: 6 }}>{l.level}</span>
                  <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{l.logger?.split(".")?.pop()}</span>
                  <span>{l.message?.slice(0, 150)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Slow endpoints */}
          {result.slowEndpoints?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Clock size={14} /> Slow Endpoints
              </div>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "4px 8px" }}>Endpoint</th>
                    <th style={{ padding: "4px 8px" }}>p50</th>
                    <th style={{ padding: "4px 8px" }}>p95</th>
                    <th style={{ padding: "4px 8px" }}>p99</th>
                    <th style={{ padding: "4px 8px" }}>Calls</th>
                    <th style={{ padding: "4px 8px" }}>Error %</th>
                  </tr>
                </thead>
                <tbody>
                  {result.slowEndpoints.map((ep, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "4px 8px" }}>
                        <span style={{ color: "var(--accent)", fontWeight: 600, marginRight: 4 }}>{ep.method}</span>
                        {ep.path}
                      </td>
                      <td style={{ padding: "4px 8px" }}>{formatDuration(ep.p50)}</td>
                      <td style={{ padding: "4px 8px", color: ep.p95 > 500 ? "var(--red)" : ep.p95 > 200 ? "var(--amber)" : "" }}>{formatDuration(ep.p95)}</td>
                      <td style={{ padding: "4px 8px" }}>{formatDuration(ep.p99)}</td>
                      <td style={{ padding: "4px 8px" }}>{ep.total}</td>
                      <td style={{ padding: "4px 8px", color: ep.errorRate > 5 ? "var(--red)" : "" }}>{ep.errorRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Agent errors */}
          {result.agentErrors?.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Bot size={14} /> Agent Errors
              </div>
              {result.agentErrors.map((a, i) => (
                <div key={i} style={{ padding: "6px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Bot size={12} style={{ color: "var(--red)" }} />
                  <strong>{a.agentName ?? a.sessionId}</strong>
                  <span style={{ color: "var(--red)" }}>{a.errors} errors</span>
                  {a.goal && <span style={{ color: "var(--text-muted)" }}>{a.goal.slice(0, 60)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {result.results?.length === 0 && !result.errorLogs?.length && !result.matchingLogs?.length && (
            <div className="empty-state" style={{ minHeight: 200 }}>
              <Search size={32} />
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>No results found</h3>
              <p style={{ fontSize: 13 }}>Try rephrasing your question or check if data has been ingested.</p>
            </div>
          )}
        </div>
      )}

      {/* Query history */}
      {!result && history.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>Recent queries</div>
          {history.map((h, i) => (
            <button key={i} style={{ display: "block", padding: "4px 0", background: "none", border: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", textAlign: "left" }}
              onClick={() => { setQuery(h); handleQuery(h); }}>
              <Search size={10} /> {h}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ResultRow({ item, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  // Detect if it's a trace result or agent session
  const isAgent = !!item.sessionId;
  const isTrace = !!item.traceId && !item.sessionId;

  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "6px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}>
        <span style={{ width: 14, color: "var(--text-muted)" }}>
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        {isAgent ? (
          <>
            <Bot size={13} style={{ color: "var(--accent)" }} />
            <strong>{item.agentName ?? item.agentId}</strong>
            <span className={`status-badge ${item.errors > 0 ? "error" : "ok"}`} style={{ fontSize: 9 }}>{item.status}</span>
            <span style={{ color: "var(--text-muted)" }}>{item.toolCalls} tools</span>
            <span style={{ color: "var(--text-muted)" }}>${item.totalCostUsd}</span>
          </>
        ) : (
          <>
            <span style={{ color: item.method === "GET" ? "var(--green)" : item.method === "POST" ? "var(--accent)" : "var(--amber)", fontWeight: 700, fontSize: 11 }}>{item.method}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.path}</span>
            <span className={`status-badge ${item.status === "ERROR" || String(item.status).startsWith("5") ? "error" : item.status === "IN_PROGRESS" ? "pending" : "ok"}`} style={{ fontSize: 9 }}>{item.status}</span>
            {item.durationMs > 0 && <span style={{ color: item.durationMs > 500 ? "var(--red)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDuration(item.durationMs)}</span>}
            {item.service && <span className="chip" style={{ fontSize: 9 }}>{item.service}</span>}
          </>
        )}
      </div>
      {expanded && (
        <div style={{ padding: "6px 0 4px 22px", fontSize: 11, color: "var(--text-secondary)" }}>
          {item.traceId && <div>Trace: <code style={{ color: "var(--accent)" }}>{item.traceId}</code>
            {onNavigate && <button className="chip" style={{ fontSize: 9, marginLeft: 6, cursor: "pointer" }} onClick={() => onNavigate(item.traceId)}>View →</button>}
          </div>}
          {item.eventCount && <div>Events: {item.eventCount}</div>}
          {item.goal && <div>Goal: {item.goal}</div>}
          {item.totalTokens > 0 && <div>Tokens: {item.totalTokens}</div>}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-label" style={{ textTransform: "capitalize" }}>{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

