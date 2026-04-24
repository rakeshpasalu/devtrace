import { useMemo, useState } from "react";
import { formatDuration, formatTimestamp, spanColor } from "../utils.js";
import {
  BarChart3, AlertTriangle, TrendingUp, ChevronDown, ChevronUp, ChevronRight,
  Zap, ShieldAlert, Activity, Clock, Layers, ExternalLink, Search
} from "lucide-react";

const METHOD_COLORS = {
  GET:    "#34d399",
  POST:   "#60a5fa",
  PUT:    "#fbbf24",
  PATCH:  "#fbbf24",
  DELETE: "#f87171",
};

/* ─── Latency bar sparkline ─── */
function LatencyBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = value > 500 ? "var(--red)" : value > 200 ? "var(--amber)" : "var(--green)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color, minWidth: 40, textAlign: "right" }}>
        {formatDuration(value)}
      </span>
    </div>
  );
}

/* ─── Expanded Detail Panel ─── */
function EndpointDetail({ ep, requests, recentEvents, diagnostics, onSelectTrace }) {
  const [activeTab, setActiveTab] = useState("traces");

  // Find matching traces for this endpoint
  const matchingTraces = useMemo(() => {
    return (requests ?? []).filter(r => {
      const m = r.method ?? "n/a";
      const p = r.path ?? "background";
      return `${m} ${p}` === ep.endpoint || (m === ep.method && p === ep.path);
    }).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 20);
  }, [requests, ep]);

  // Find matching events (spans, errors) for this endpoint's traces
  const traceIds = useMemo(() => new Set(matchingTraces.map(t => t.traceId)), [matchingTraces]);

  const matchingEvents = useMemo(() => {
    return (recentEvents ?? []).filter(e => traceIds.has(e.traceId))
      .sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
  }, [recentEvents, traceIds]);

  // Matching errors
  const matchingErrors = useMemo(() => {
    const errs = (diagnostics?.errors ?? []).filter(e => traceIds.has(e.traceId));
    return errs.slice(-15).reverse();
  }, [diagnostics, traceIds]);

  // Matching slow spans
  const matchingSlowSpans = useMemo(() => {
    return (diagnostics?.slowSpans ?? []).filter(e => traceIds.has(e.traceId))
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, 15);
  }, [diagnostics, traceIds]);

  // Span breakdown by component
  const componentBreakdown = useMemo(() => {
    const spans = matchingEvents.filter(e => e.type === "SPAN_FINISHED");
    const map = {};
    for (const s of spans) {
      const c = s.component ?? "other";
      if (!map[c]) map[c] = { component: c, count: 0, totalMs: 0 };
      map[c].count += 1;
      map[c].totalMs += Number(s.durationMs ?? 0);
    }
    return Object.values(map).sort((a, b) => b.totalMs - a.totalMs);
  }, [matchingEvents]);

  const tabs = [
    { id: "traces", label: "Traces", count: matchingTraces.length },
    { id: "spans", label: "Span Breakdown", count: componentBreakdown.length },
    { id: "slow", label: "Slow Spans", count: matchingSlowSpans.length },
    { id: "errors", label: "Errors", count: matchingErrors.length },
    { id: "events", label: "Event Log", count: matchingEvents.length },
  ];

  return (
    <div className="ea-detail">
      {/* Summary chips */}
      <div className="ea-detail-summary">
        <div className="ea-detail-chip">
          <Activity size={12} /> <strong>{matchingTraces.length}</strong> traces
        </div>
        <div className="ea-detail-chip">
          <Layers size={12} /> <strong>{matchingEvents.filter(e => e.type === "SPAN_FINISHED").length}</strong> spans
        </div>
        <div className="ea-detail-chip" style={matchingErrors.length > 0 ? { color: "var(--red)", borderColor: "rgba(248,113,113,0.2)" } : {}}>
          <AlertTriangle size={12} /> <strong>{matchingErrors.length}</strong> errors
        </div>
        <div className="ea-detail-chip" style={matchingSlowSpans.length > 0 ? { color: "var(--amber)", borderColor: "rgba(251,191,36,0.2)" } : {}}>
          <Clock size={12} /> <strong>{matchingSlowSpans.length}</strong> slow
        </div>
        {ep.anomaly && (
          <div className="ea-detail-chip ea-anomaly-chip">
            <ShieldAlert size={12} /> {ep.anomaly.message}
          </div>
        )}
      </div>

      {/* Latency visual */}
      <div className="ea-latency-visual">
        <div className="ea-latency-item">
          <span className="ea-latency-label">min</span>
          <LatencyBar value={ep.min} max={ep.max} />
        </div>
        <div className="ea-latency-item">
          <span className="ea-latency-label">p50</span>
          <LatencyBar value={ep.p50} max={ep.max} />
        </div>
        <div className="ea-latency-item">
          <span className="ea-latency-label">p95</span>
          <LatencyBar value={ep.p95} max={ep.max} />
        </div>
        <div className="ea-latency-item">
          <span className="ea-latency-label">p99</span>
          <LatencyBar value={ep.p99} max={ep.max} />
        </div>
        <div className="ea-latency-item">
          <span className="ea-latency-label">max</span>
          <LatencyBar value={ep.max} max={ep.max} />
        </div>
      </div>

      {/* Tabs */}
      <div className="ea-tab-bar">
        {tabs.map(t => (
          <button key={t.id} className={`ea-tab ${activeTab === t.id ? "active" : ""}`}
            onClick={() => setActiveTab(t.id)}>
            {t.label}
            {t.count > 0 && <span className="ea-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="ea-tab-content">
        {activeTab === "traces" && (
          matchingTraces.length === 0 ? (
            <div className="ea-empty">No traces found for this endpoint yet.</div>
          ) : (
            <div className="ea-trace-list">
              {matchingTraces.map(t => {
                const statusCls = t.status === "ERROR" ? "ea-status-error" : t.status === "IN_PROGRESS" ? "ea-status-pending" : "ea-status-ok";
                return (
                  <button key={t.traceId} className="ea-trace-row" onClick={() => onSelectTrace?.(t.traceId)}>
                    <div className="ea-trace-row-left">
                      <span className={`ea-trace-status ${statusCls}`}>{t.status === "IN_PROGRESS" ? "LIVE" : t.status}</span>
                      <span className="ea-trace-id" title={t.traceId}>{t.traceId.slice(0, 12)}…</span>
                      <span className="ea-trace-duration">{formatDuration(t.durationMs)}</span>
                    </div>
                    <div className="ea-trace-row-right">
                      <span className="ea-trace-events">{t.eventCount} events</span>
                      {t.errorCount > 0 && <span className="ea-trace-errors">{t.errorCount} err</span>}
                      <span className="ea-trace-time">{formatTimestamp(t.lastSeen)}</span>
                      <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {activeTab === "spans" && (
          componentBreakdown.length === 0 ? (
            <div className="ea-empty">No span data available.</div>
          ) : (
            <div className="ea-breakdown-list">
              {componentBreakdown.map(c => (
                <div key={c.component} className="ea-breakdown-row">
                  <div className="ea-breakdown-dot" style={{ background: spanColor(c.component) }} />
                  <div className="ea-breakdown-name">{c.component}</div>
                  <div className="ea-breakdown-count">{c.count} spans</div>
                  <div className="ea-breakdown-bar-wrap">
                    <div className="ea-breakdown-bar" style={{
                      width: `${Math.min(100, (c.totalMs / Math.max(1, componentBreakdown[0].totalMs)) * 100)}%`,
                      background: spanColor(c.component),
                    }} />
                  </div>
                  <div className="ea-breakdown-ms">{formatDuration(c.totalMs)}</div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "slow" && (
          matchingSlowSpans.length === 0 ? (
            <div className="ea-empty">No slow spans detected for this endpoint.</div>
          ) : (
            <div className="ea-trace-list">
              {matchingSlowSpans.map((s, i) => (
                <div key={i} className="ea-slow-row">
                  <div className="ea-slow-dot" style={{ background: spanColor(s.component) }} />
                  <div className="ea-slow-info">
                    <div className="ea-slow-name">{s.name ?? `${(s.className ?? "").split(".").pop()}.${s.methodName ?? ""}`}</div>
                    <div className="ea-slow-meta">{s.component ?? "runtime"} · trace: {(s.traceId ?? "").slice(0, 10)}…</div>
                  </div>
                  <span className="ea-slow-dur" style={{ color: Number(s.durationMs) > 500 ? "var(--red)" : "var(--amber)" }}>
                    {formatDuration(s.durationMs)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "errors" && (
          matchingErrors.length === 0 ? (
            <div className="ea-empty" style={{ color: "var(--green)" }}>
              <CheckCircleIcon /> No errors — this endpoint is healthy!
            </div>
          ) : (
            <div className="ea-trace-list">
              {matchingErrors.map((e, i) => (
                <div key={i} className="ea-error-row">
                  <AlertTriangle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />
                  <div className="ea-error-info">
                    <div className="ea-error-name">{e.name ?? "Error"}</div>
                    <div className="ea-error-meta">
                      {e.attributes?.exceptionType ?? e.component ?? "runtime"}
                      {e.attributes?.exceptionMessage && <> · {e.attributes.exceptionMessage.slice(0, 80)}</>}
                    </div>
                  </div>
                  <span className="ea-error-time">{formatTimestamp(e.timestamp)}</span>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === "events" && (
          matchingEvents.length === 0 ? (
            <div className="ea-empty">No events captured for this endpoint.</div>
          ) : (
            <div className="ea-event-log">
              {matchingEvents.slice(0, 30).map((e, i) => (
                <div key={i} className="ea-event-row">
                  <span className="ea-event-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span className={`ea-event-type ${e.type === "ERROR" || e.status === "ERROR" ? "is-error" : e.type === "SPAN_FINISHED" ? "is-span" : e.type === "HTTP_REQUEST" || e.type === "HTTP_RESPONSE" ? "is-http" : ""}`}>
                    {e.type}
                  </span>
                  <span className="ea-event-name">{e.name ?? e.className ?? "—"}</span>
                  <span className="ea-event-dur">{e.durationMs ? formatDuration(e.durationMs) : ""}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}

export default function EndpointAnalyticsPage({ analytics, requests, recentEvents, diagnostics, onSelectTrace }) {
  const [sortField, setSortField] = useState("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState("");
  const [expandedEndpoint, setExpandedEndpoint] = useState(null);

  const endpoints = analytics ?? [];
  const anomalies = endpoints.filter(e => e.anomaly);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    let arr = endpoints;
    if (q) arr = arr.filter(e => e.endpoint.toLowerCase().includes(q) || (e.service ?? "").toLowerCase().includes(q));
    arr = [...arr].sort((a, b) => {
      const av = a[sortField] ?? 0, bv = b[sortField] ?? 0;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [endpoints, sortField, sortAsc, filter]);

  function toggleSort(field) {
    if (sortField === field) setSortAsc(p => !p);
    else { setSortField(field); setSortAsc(false); }
  }

  const maxP99 = Math.max(1, ...filtered.map(e => e.p99 ?? 0));

  const SortBtn = ({ field, children }) => (
    <button onClick={() => toggleSort(field)}
      style={{
        background: "none", border: "none", cursor: "pointer", display: "inline-flex",
        alignItems: "center", gap: 3, fontWeight: sortField === field ? 700 : 600,
        color: sortField === field ? "var(--accent)" : "var(--text-muted)", fontSize: 11,
        textTransform: "uppercase", letterSpacing: "0.06em",
      }}>
      {children}
      {sortField === field && (sortAsc ? <ChevronUp size={10}/> : <ChevronDown size={10}/>)}
    </button>
  );

  return (
    <>
      <div className="page-header">
        <h1>Endpoint Analytics</h1>
        <span className="card-badge">{endpoints.length} endpoints</span>
      </div>

      {/* Anomaly alerts */}
      {anomalies.length > 0 && (
        <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {anomalies.map(a => (
            <div key={a.endpoint} className="ea-anomaly-banner" onClick={() => setExpandedEndpoint(expandedEndpoint === a.endpoint ? null : a.endpoint)}
              style={{
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                borderRadius: 10, background: a.anomaly.type === "high_error_rate" ? "var(--red-glow)" : "rgba(251,191,36,0.08)",
                border: `1px solid ${a.anomaly.type === "high_error_rate" ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)"}`,
              }}>
              {a.anomaly.type === "high_error_rate"
                ? <ShieldAlert size={18} style={{ color: "var(--red)", flexShrink: 0 }} />
                : <TrendingUp size={18} style={{ color: "var(--amber)", flexShrink: 0 }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                  <span style={{ color: METHOD_COLORS[a.method] ?? "var(--accent)" }}>{a.method}</span> {a.path}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                  {a.anomaly.message}
                  {a.service && <span style={{ color: "var(--text-muted)" }}> · {a.service}</span>}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "var(--text-muted)", flexShrink: 0, transform: expandedEndpoint === a.endpoint ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
            </div>
          ))}
        </div>
      )}

      {endpoints.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: "48px 24px" }}>
            <BarChart3 size={40} />
            <h3 style={{ margin: "12px 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Endpoint Analytics</h3>
            <p style={{ maxWidth: 480, lineHeight: 1.7 }}>
              Latency percentiles, error rates, and anomaly detection will appear here once your
              instrumented app handles HTTP requests.<br/><br/>
              Each endpoint gets automatic p50/p95/p99 tracking with regression detection.
            </p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Filter */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter endpoints…"
              style={{
                width: "100%", maxWidth: 320, padding: "6px 12px", fontSize: 12,
                background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8,
                color: "var(--text-primary)", outline: "none",
              }} />
            {expandedEndpoint && (
              <button onClick={() => setExpandedEndpoint(null)} style={{
                marginLeft: "auto", background: "var(--bg-card)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-secondary)",
                cursor: "pointer",
              }}>Collapse All</button>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "10px 16px", textAlign: "left", width: 24 }}></th>
                  <th style={{ padding: "10px 8px", textAlign: "left" }}><SortBtn field="endpoint">Endpoint</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "left" }}><SortBtn field="service">Service</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}><SortBtn field="total">Calls</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}><SortBtn field="errorRate">Err %</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}><SortBtn field="p50">p50</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}><SortBtn field="p95">p95</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}><SortBtn field="p99">p99</SortBtn></th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}><SortBtn field="avg">Avg</SortBtn></th>
                  <th style={{ padding: "10px 16px", textAlign: "center", width: 40 }}>
                    <AlertTriangle size={12} style={{ color: "var(--text-muted)" }} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ep => {
                  const hasAnomaly = !!ep.anomaly;
                  const isExpanded = expandedEndpoint === ep.endpoint;
                  return (
                    <>
                      <tr key={ep.endpoint}
                        onClick={() => setExpandedEndpoint(isExpanded ? null : ep.endpoint)}
                        className={`ea-row ${isExpanded ? "ea-row-expanded" : ""}`}
                        style={{
                          borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                          background: isExpanded ? "var(--accent-glow)" : hasAnomaly ? (ep.anomaly.type === "high_error_rate" ? "var(--red-glow)" : "rgba(251,191,36,0.04)") : "transparent",
                          cursor: "pointer",
                        }}>
                        <td style={{ padding: "10px 8px 10px 16px", width: 24 }}>
                          <ChevronRight size={14} style={{
                            color: isExpanded ? "var(--accent)" : "var(--text-muted)",
                            transform: isExpanded ? "rotate(90deg)" : "none",
                            transition: "transform 0.2s",
                          }} />
                        </td>
                        <td style={{ padding: "10px 8px", maxWidth: 280 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                              color: METHOD_COLORS[ep.method] ?? "#94a3b8", flexShrink: 0,
                              padding: "2px 6px", borderRadius: 4,
                              background: `${METHOD_COLORS[ep.method] ?? "#94a3b8"}15`,
                            }}>{ep.method}</span>
                            <span style={{
                              fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden",
                              textOverflow: "ellipsis", color: "var(--text-primary)",
                            }} title={ep.path}>{ep.path}</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 8px", color: "var(--text-secondary)", fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ep.service ?? "—"}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                          {ep.total}
                        </td>
                        <td style={{
                          padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600,
                          color: ep.errorRate > 10 ? "var(--red)" : ep.errorRate > 0 ? "var(--amber)" : "var(--text-muted)",
                        }}>
                          {ep.errorRate > 0 ? `${ep.errorRate}%` : "—"}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--green)" }}>
                          {formatDuration(ep.p50)}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: ep.p95 >= 200 ? "var(--amber)" : "var(--text-secondary)" }}>
                          {formatDuration(ep.p95)}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: ep.p99 >= 500 ? "var(--red)" : "var(--text-secondary)" }}>
                          {formatDuration(ep.p99)}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                          {formatDuration(ep.avg)}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "center" }}>
                          {hasAnomaly ? (
                            <span title={ep.anomaly.message} style={{ cursor: "help" }}>
                              {ep.anomaly.type === "high_error_rate"
                                ? <ShieldAlert size={14} style={{ color: "var(--red)" }} />
                                : <TrendingUp size={14} style={{ color: "var(--amber)" }} />
                              }
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: 10 }}>—</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${ep.endpoint}-detail`}>
                          <td colSpan={10} style={{ padding: 0, borderBottom: "1px solid var(--border)" }}>
                            <EndpointDetail ep={ep} requests={requests} recentEvents={recentEvents}
                              diagnostics={diagnostics} onSelectTrace={onSelectTrace} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

