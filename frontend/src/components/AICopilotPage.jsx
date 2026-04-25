import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain, Sparkles, Copy, Check, ChevronDown, ChevronRight, AlertTriangle,
  Zap, Database, Search, RefreshCw, Lightbulb, Bug, Gauge, ArrowRight,
  MessageSquare, Code, ExternalLink, Shield, Repeat, Clock, Layers
} from "lucide-react";
import { formatDuration, authFetch, apiBase } from "../utils.js";

/* ═══════════════════════════════════════════
   Pattern Detection Engine (no LLM needed)
   ═══════════════════════════════════════════ */

function detectPatterns(trace) {
  if (!trace || !trace.events) return [];
  const patterns = [];
  const events = trace.events ?? [];
  const spans = events.filter(e => e.type === "SPAN_FINISHED");
  const sqls = events.filter(e => e.type === "SQL_STATEMENT");
  const errors = events.filter(e => e.type === "ERROR" || e.status === "ERROR");
  const httpOuts = events.filter(e =>
    e.type === "SPAN_FINISHED" && (e.component === "RestTemplate" || e.component === "WebClient")
  );

  // 1. N+1 Query Detection
  const sqlByParent = new Map();
  for (const sql of sqls) {
    const key = sql.parentSpanId ?? "root";
    if (!sqlByParent.has(key)) sqlByParent.set(key, []);
    sqlByParent.get(key).push(sql);
  }
  for (const [parentId, queries] of sqlByParent) {
    if (queries.length >= 3) {
      const similar = groupSimilarQueries(queries);
      for (const [pattern, group] of similar) {
        if (group.length >= 3) {
          const totalMs = group.reduce((s, q) => s + Number(q.durationMs ?? 0), 0);
          patterns.push({
            type: "n-plus-one",
            severity: group.length >= 10 ? "critical" : group.length >= 5 ? "high" : "medium",
            title: `N+1 Query Detected (${group.length} similar queries)`,
            detail: `${group.length} similar SQL statements executed under the same span, totaling ${formatDuration(totalMs)}. This is typically caused by lazy-loading in a loop.`,
            evidence: { count: group.length, pattern: pattern.slice(0, 120), totalMs, parentId },
            fix: "Use JOIN FETCH, @EntityGraph, or a projection query to batch-load related entities.",
          });
        }
      }
    }
  }

  // 2. Slow Span Chain
  const slowThreshold = 150;
  const slowSpans = spans.filter(s => Number(s.durationMs ?? 0) >= slowThreshold);
  if (slowSpans.length >= 2) {
    const totalSlowMs = slowSpans.reduce((s, sp) => s + Number(sp.durationMs ?? 0), 0);
    patterns.push({
      type: "slow-chain",
      severity: totalSlowMs > 2000 ? "critical" : totalSlowMs > 500 ? "high" : "medium",
      title: `${slowSpans.length} Slow Spans (${formatDuration(totalSlowMs)} total)`,
      detail: `Multiple spans exceed the ${slowThreshold}ms threshold. The slowest is ${slowSpans[0]?.name ?? "unknown"} at ${formatDuration(Math.max(...slowSpans.map(s => Number(s.durationMs ?? 0))))}ms.`,
      evidence: { spans: slowSpans.slice(0, 5).map(s => ({ name: s.name, ms: s.durationMs, component: s.component })) },
      fix: "Profile the slowest spans. Consider caching, query optimization, or async execution for independent operations.",
    });
  }

  // 3. Error Propagation Chain
  if (errors.length > 0) {
    const errorTypes = new Map();
    for (const e of errors) {
      const type = e.attributes?.exceptionClass ?? e.name ?? "UnknownError";
      if (!errorTypes.has(type)) errorTypes.set(type, []);
      errorTypes.get(type).push(e);
    }
    for (const [type, errs] of errorTypes) {
      patterns.push({
        type: "error-chain",
        severity: errs.length > 3 ? "critical" : "high",
        title: `Error: ${type} (${errs.length}x)`,
        detail: errs[0]?.attributes?.exceptionMessage ?? `${type} occurred ${errs.length} time(s) in this trace.`,
        evidence: { errorClass: type, count: errs.length, first: errs[0] },
        fix: "Check the stack trace. Verify input validation, null checks, and external service availability.",
      });
    }
  }

  // 4. Redundant Outbound Calls
  const outboundByUrl = new Map();
  for (const call of httpOuts) {
    const url = call.attributes?.url ?? call.name ?? "unknown";
    if (!outboundByUrl.has(url)) outboundByUrl.set(url, []);
    outboundByUrl.get(url).push(call);
  }
  for (const [url, calls] of outboundByUrl) {
    if (calls.length >= 2) {
      patterns.push({
        type: "redundant-call",
        severity: calls.length >= 4 ? "high" : "medium",
        title: `Redundant HTTP Call (${calls.length}x to same endpoint)`,
        detail: `${calls.length} outbound HTTP requests to "${url.length > 80 ? url.slice(0, 77) + "…" : url}" — likely cacheable or batchable.`,
        evidence: { url, count: calls.length, totalMs: calls.reduce((s, c) => s + Number(c.durationMs ?? 0), 0) },
        fix: "Cache the response, batch multiple IDs into one call, or use a circuit breaker.",
      });
    }
  }

  // 5. Sequential Operations (could be parallel)
  const topLevelSpans = spans.filter(s => s.parentSpanId === (trace.rootSpanId ?? trace.traceId));
  if (topLevelSpans.length >= 3) {
    const independent = topLevelSpans.filter(s => {
      const others = topLevelSpans.filter(o => o !== s);
      return !others.some(o => o.spanId === s.parentSpanId);
    });
    if (independent.length >= 3) {
      const totalMs = independent.reduce((s, sp) => s + Number(sp.durationMs ?? 0), 0);
      const maxMs = Math.max(...independent.map(s => Number(s.durationMs ?? 0)));
      if (totalMs > maxMs * 1.5) {
        patterns.push({
          type: "sequential-opportunity",
          severity: "medium",
          title: `${independent.length} Sequential Operations (async opportunity)`,
          detail: `${independent.length} independent operations are running sequentially (${formatDuration(totalMs)} total). Running them in parallel could reduce latency to ~${formatDuration(maxMs)}.`,
          evidence: { count: independent.length, totalMs, potentialMs: maxMs },
          fix: "Use CompletableFuture.allOf(), @Async, or reactive composition to parallelize independent calls.",
        });
      }
    }
  }

  // 6. Large SQL Result Sets (heuristic: many SQL calls + high duration)
  if (sqls.length > 0) {
    const totalSqlMs = sqls.reduce((s, q) => s + Number(q.durationMs ?? 0), 0);
    const sqlPct = trace.durationMs > 0 ? (totalSqlMs / trace.durationMs * 100) : 0;
    if (sqlPct > 60) {
      patterns.push({
        type: "sql-heavy",
        severity: sqlPct > 80 ? "high" : "medium",
        title: `SQL-Heavy Request (${sqlPct.toFixed(0)}% of time in DB)`,
        detail: `${sqls.length} SQL statements consumed ${formatDuration(totalSqlMs)} out of ${formatDuration(trace.durationMs)} total (${sqlPct.toFixed(0)}%).`,
        evidence: { sqlCount: sqls.length, totalSqlMs, pct: sqlPct },
        fix: "Review query plans. Add indexes, reduce selected columns, or paginate large result sets.",
      });
    }
  }

  // Sort by severity
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  patterns.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  return patterns;
}

function groupSimilarQueries(queries) {
  const groups = new Map();
  for (const q of queries) {
    const sql = (q.attributes?.sql ?? q.name ?? "").replace(/\b\d+\b/g, "?").replace(/'[^']*'/g, "?");
    const normalized = sql.slice(0, 200);
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(q);
  }
  return groups;
}

/* ═══════════════════════════════════════════
   Prompt Generator
   ═══════════════════════════════════════════ */

function generatePrompt(trace, patterns, promptType) {
  if (!trace) return "";

  const header = [
    `Service: ${trace.service ?? "unknown"}`,
    `Endpoint: ${trace.method} ${trace.path}`,
    `Status: ${trace.status}`,
    `Duration: ${formatDuration(trace.durationMs)}`,
    `Events: ${trace.eventCount ?? (trace.events?.length ?? 0)}`,
    `Errors: ${trace.errorCount ?? 0}`,
    `Trace ID: ${trace.traceId}`,
  ].join("\n");

  const events = trace.events ?? [];
  const spans = events.filter(e => e.type === "SPAN_FINISHED").map(s => ({
    name: s.name,
    component: s.component,
    duration: s.durationMs,
    status: s.status,
    ...(s.attributes?.sql ? { sql: s.attributes.sql.slice(0, 200) } : {}),
    ...(s.attributes?.url ? { url: s.attributes.url } : {}),
  }));
  const errors = events.filter(e => e.type === "ERROR" || e.status === "ERROR").map(e => ({
    class: e.attributes?.exceptionClass ?? e.name,
    message: (e.attributes?.exceptionMessage ?? "").slice(0, 300),
    span: e.name,
  }));

  const patternSummary = patterns.length > 0
    ? "\n\nDetected Issues:\n" + patterns.map(p => `- [${p.severity.toUpperCase()}] ${p.title}: ${p.detail}`).join("\n")
    : "";

  const spanSummary = spans.length > 0
    ? "\n\nSpan Timeline (top 15 by duration):\n" + spans
      .sort((a, b) => Number(b.duration ?? 0) - Number(a.duration ?? 0))
      .slice(0, 15)
      .map(s => `  ${s.component}/${s.name} — ${formatDuration(s.duration)}${s.sql ? ` [SQL: ${s.sql.slice(0, 80)}]` : ""}${s.url ? ` [HTTP: ${s.url}]` : ""}`)
      .join("\n")
    : "";

  const errorSummary = errors.length > 0
    ? "\n\nErrors:\n" + errors.slice(0, 5).map(e => `  ${e.class}: ${e.message}`).join("\n")
    : "";

  if (promptType === "explain") {
    return `I have a Spring Boot request trace that I need help understanding. Please explain what this request does step-by-step, identify any performance or reliability concerns, and suggest improvements.

${header}${patternSummary}${spanSummary}${errorSummary}

Please provide:
1. A plain-English summary of what this request does
2. Analysis of any performance bottlenecks
3. Specific, actionable recommendations with code examples where helpful`;
  }

  if (promptType === "debug") {
    return `I have a Spring Boot request that ${trace.status === "ERROR" ? "failed with an error" : "is experiencing performance issues"}. Help me debug the root cause and fix it.

${header}${patternSummary}${spanSummary}${errorSummary}

Please:
1. Identify the most likely root cause
2. Explain the error/performance chain
3. Provide a specific fix with code example
4. Suggest preventive measures`;
  }

  if (promptType === "optimize") {
    return `I need to optimize this Spring Boot request. Current latency is ${formatDuration(trace.durationMs)} which is too slow for our SLO target. Help me reduce it.

${header}${patternSummary}${spanSummary}

Please:
1. Identify the biggest optimization opportunities
2. Estimate the potential improvement for each
3. Provide concrete code changes (Java/Spring Boot)
4. Suggest architectural improvements if applicable`;
  }

  if (promptType === "review") {
    return `Please review this Spring Boot request execution for architectural and code quality concerns.

${header}${patternSummary}${spanSummary}${errorSummary}

Please evaluate:
1. Separation of concerns — are responsibilities properly layered?
2. Data access patterns — any N+1, missing indexes, over-fetching?
3. Error handling — are errors properly caught and propagated?
4. Resilience — are external calls protected with timeouts/retries/circuit breakers?
5. Concurrency — are independent operations properly parallelized?`;
  }

  if (promptType === "incident") {
    return `Generate an incident report for this failed/degraded Spring Boot request.

${header}${patternSummary}${spanSummary}${errorSummary}

Please produce a structured incident report with:
1. **Summary** — one-line description
2. **Impact** — what users/systems are affected
3. **Timeline** — key events in order
4. **Root Cause** — most likely explanation
5. **Resolution** — immediate fix steps
6. **Follow-up** — preventive actions for the future`;
  }

  // Default: general analysis
  return `Analyze this Spring Boot request trace:\n\n${header}${patternSummary}${spanSummary}${errorSummary}`;
}

/* ═══════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════ */

const PROMPT_TYPES = [
  { id: "explain", label: "Explain Trace", icon: MessageSquare, desc: "Step-by-step explanation" },
  { id: "debug", label: "Debug Issue", icon: Bug, desc: "Root cause analysis" },
  { id: "optimize", label: "Optimize", icon: Gauge, desc: "Performance improvements" },
  { id: "review", label: "Code Review", icon: Code, desc: "Architecture review" },
  { id: "incident", label: "Incident Report", icon: Shield, desc: "Structured report" },
];

const SEVERITY_COLORS = {
  critical: "var(--red)",
  high: "var(--amber)",
  medium: "#facc15",
  low: "var(--green)",
};

const SEVERITY_BG = {
  critical: "var(--red-glow)",
  high: "rgba(251,191,36,0.12)",
  medium: "rgba(250,204,21,0.1)",
  low: "var(--green-glow)",
};

const PATTERN_ICONS = {
  "n-plus-one": Database,
  "slow-chain": Clock,
  "error-chain": AlertTriangle,
  "redundant-call": Repeat,
  "sequential-opportunity": Layers,
  "sql-heavy": Database,
};

export default function AICopilotPage({ requests, snapshot, selectedTraceId, onSelectTrace, onNavigate }) {
  const [traceId, setTraceId] = useState(selectedTraceId ?? "");
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [promptType, setPromptType] = useState("explain");
  const [copied, setCopied] = useState(false);
  const [expandedPatterns, setExpandedPatterns] = useState(new Set());
  const [search, setSearch] = useState("");

  // Load trace when traceId changes
  useEffect(() => {
    if (selectedTraceId && selectedTraceId !== traceId) {
      setTraceId(selectedTraceId);
    }
  }, [selectedTraceId]);

  const loadTrace = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await authFetch(`${apiBase()}/api/v1/requests/${id}`);
      if (res.ok) {
        const data = await res.json();
        setTrace(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (traceId) loadTrace(traceId);
  }, [traceId, loadTrace]);

  const patterns = useMemo(() => detectPatterns(trace), [trace]);
  const prompt = useMemo(() => generatePrompt(trace, patterns, promptType), [trace, patterns, promptType]);

  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [prompt]);

  const togglePattern = useCallback((idx) => {
    setExpandedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  // Recent requests for quick selection
  const recentRequests = useMemo(() => {
    let arr = requests ?? [];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(r =>
        (r.traceId ?? "").toLowerCase().includes(q) ||
        (r.path ?? "").toLowerCase().includes(q) ||
        (r.method ?? "").toLowerCase().includes(q) ||
        (r.service ?? "").toLowerCase().includes(q)
      );
    }
    return arr.slice(0, 15);
  }, [requests, search]);

  // Summary stats
  const statSummary = useMemo(() => {
    if (!patterns.length) return null;
    const critical = patterns.filter(p => p.severity === "critical").length;
    const high = patterns.filter(p => p.severity === "high").length;
    const medium = patterns.filter(p => p.severity === "medium").length;
    return { critical, high, medium, total: patterns.length };
  }, [patterns]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Brain size={22} /> AI Trace Copilot
        </h1>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Powered by pattern detection + LLM prompts</span>
        </div>
      </div>

      <div className="aico-layout">
        {/* Left: Trace selector */}
        <div className="aico-sidebar">
          <div className="aico-sidebar-header">Select a Trace</div>
          <div className="aico-search">
            <Search size={13} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search traces…" />
          </div>
          <div className="aico-trace-list">
            {recentRequests.map(r => (
              <button key={r.traceId}
                className={`aico-trace-item ${traceId === r.traceId ? "active" : ""} ${r.status === "ERROR" ? "has-error" : ""}`}
                onClick={() => setTraceId(r.traceId)}>
                <div className="aico-trace-item-top">
                  <span style={{
                    color: r.method === "GET" ? "var(--green)" : r.method === "POST" ? "var(--accent)" : "var(--amber)",
                    fontWeight: 700, fontSize: 10, fontFamily: "var(--font-mono)"
                  }}>{r.method}</span>
                  <span className="aico-trace-item-path">{r.path}</span>
                </div>
                <div className="aico-trace-item-bottom">
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatDuration(r.durationMs)}</span>
                  <span style={{ fontSize: 10, color: r.status === "ERROR" ? "var(--red)" : "var(--text-muted)" }}>{r.status}</span>
                </div>
              </button>
            ))}
            {recentRequests.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                No traces available. Send traffic to your app.
              </div>
            )}
          </div>
        </div>

        {/* Right: Analysis */}
        <div className="aico-main">
          {!trace && !loading && (
            <div className="aico-empty">
              <Brain size={48} style={{ color: "var(--accent)", opacity: 0.3 }} />
              <h3>AI Trace Copilot</h3>
              <p>Select a trace to get instant pattern detection and AI-ready debugging prompts.</p>
              <div className="aico-features">
                <div className="aico-feature"><Database size={16} /> N+1 query detection</div>
                <div className="aico-feature"><Clock size={16} /> Slow span analysis</div>
                <div className="aico-feature"><AlertTriangle size={16} /> Error chain tracing</div>
                <div className="aico-feature"><Repeat size={16} /> Redundant call detection</div>
                <div className="aico-feature"><Layers size={16} /> Async parallelization opportunities</div>
                <div className="aico-feature"><Sparkles size={16} /> One-click LLM prompt generation</div>
              </div>
            </div>
          )}

          {loading && (
            <div className="aico-empty">
              <RefreshCw size={24} className="spin" style={{ color: "var(--accent)" }} />
              <p>Loading trace…</p>
            </div>
          )}

          {trace && !loading && (
            <>
              {/* Trace header */}
              <div className="aico-trace-header">
                <div className="aico-trace-route">
                  <span style={{
                    color: trace.method === "GET" ? "var(--green)" : trace.method === "POST" ? "var(--accent)" : "var(--amber)",
                    fontWeight: 700, fontSize: 14, fontFamily: "var(--font-mono)"
                  }}>{trace.method}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{trace.path}</span>
                </div>
                <div className="aico-trace-meta">
                  <span>{trace.service}</span>
                  <span>{formatDuration(trace.durationMs)}</span>
                  <span style={{ color: trace.status === "ERROR" ? "var(--red)" : "var(--green)" }}>{trace.status}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{trace.traceId?.slice(0, 16)}…</span>
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }}
                    onClick={() => { onSelectTrace?.(trace.traceId); onNavigate?.("traces"); }}>
                    <ExternalLink size={10} /> View in Explorer
                  </button>
                </div>
              </div>

              {/* Pattern Detection Results */}
              <div className="aico-section">
                <div className="aico-section-title">
                  <Sparkles size={16} style={{ color: "var(--accent)" }} />
                  Pattern Detection
                  {statSummary && (
                    <div className="aico-stat-pills">
                      {statSummary.critical > 0 && <span className="aico-pill" style={{ background: "var(--red-glow)", color: "var(--red)" }}>{statSummary.critical} critical</span>}
                      {statSummary.high > 0 && <span className="aico-pill" style={{ background: "rgba(251,191,36,0.12)", color: "var(--amber)" }}>{statSummary.high} high</span>}
                      {statSummary.medium > 0 && <span className="aico-pill" style={{ background: "rgba(250,204,21,0.08)", color: "#facc15" }}>{statSummary.medium} medium</span>}
                    </div>
                  )}
                </div>

                {patterns.length === 0 ? (
                  <div className="aico-no-patterns">
                    <Shield size={20} style={{ color: "var(--green)" }} />
                    <span>No issues detected — this trace looks clean.</span>
                  </div>
                ) : (
                  <div className="aico-patterns">
                    {patterns.map((p, i) => {
                      const Icon = PATTERN_ICONS[p.type] ?? AlertTriangle;
                      const expanded = expandedPatterns.has(i);
                      return (
                        <div key={i} className={`aico-pattern aico-pattern-${p.severity}`}>
                          <div className="aico-pattern-header" onClick={() => togglePattern(i)}>
                            <span className="aico-pattern-severity" style={{ color: SEVERITY_COLORS[p.severity], background: SEVERITY_BG[p.severity] }}>
                              {p.severity.toUpperCase()}
                            </span>
                            <Icon size={14} style={{ color: SEVERITY_COLORS[p.severity] }} />
                            <span className="aico-pattern-title">{p.title}</span>
                            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>
                          {expanded && (
                            <div className="aico-pattern-body">
                              <p className="aico-pattern-detail">{p.detail}</p>
                              {p.fix && (
                                <div className="aico-pattern-fix">
                                  <Lightbulb size={12} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                                  <span>{p.fix}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Prompt Generator */}
              <div className="aico-section">
                <div className="aico-section-title">
                  <Brain size={16} style={{ color: "var(--purple)" }} />
                  LLM Prompt Generator
                </div>

                <div className="aico-prompt-types">
                  {PROMPT_TYPES.map(pt => {
                    const PIcon = pt.icon;
                    return (
                      <button key={pt.id}
                        className={`aico-prompt-type ${promptType === pt.id ? "active" : ""}`}
                        onClick={() => setPromptType(pt.id)}>
                        <PIcon size={14} />
                        <div>
                          <div className="aico-prompt-type-label">{pt.label}</div>
                          <div className="aico-prompt-type-desc">{pt.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="aico-prompt-output">
                  <div className="aico-prompt-header">
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                      Generated Prompt — ready to paste into ChatGPT, Copilot, or Claude
                    </span>
                    <button className="btn btn-primary" onClick={copyPrompt} style={{ fontSize: 11, padding: "4px 12px" }}>
                      {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Prompt</>}
                    </button>
                  </div>
                  <pre className="aico-prompt-text">{prompt}</pre>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

