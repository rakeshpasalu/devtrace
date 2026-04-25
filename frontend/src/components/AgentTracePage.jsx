import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot, Brain, ChevronDown, ChevronRight, Wrench, AlertTriangle, RefreshCw,
  DollarSign, Zap, Clock, Hash, ArrowRight, Copy, Check, GitBranch,
  Shield, MessageSquare, Layers, Activity, Search, Filter, Share2, Link, ExternalLink
} from "lucide-react";
import { formatDuration, authFetch, apiBase } from "../utils.js";

/* ─── Cost formatter ─── */
const fmtCost = (usd) => {
  if (!usd || usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
};

const fmtTokens = (n) => {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
};

/* ─── Severity color ─── */
const sevColor = (type) => {
  if (type === "AGENT_TOOL_ERROR" || type === "AGENT_GUARDRAIL_HIT" || type === "ERROR") return "var(--red)";
  if (type === "AGENT_RETRY" || type === "AGENT_FALLBACK") return "var(--amber)";
  if (type === "AGENT_SPAWN") return "var(--purple, #a78bfa)";
  if (type === "AGENT_DECISION") return "var(--accent)";
  if (type === "LLM_COMPLETION") return "#38bdf8";
  if (type === "AGENT_SESSION_END") return "var(--green)";
  if (type === "AGENT_TOOL_CALL" || type === "AGENT_TOOL_RESULT") return "var(--green)";
  return "var(--text-secondary)";
};

const typeIcon = (type) => {
  switch (type) {
    case "AGENT_SESSION_START": return <Bot size={14} />;
    case "AGENT_DECISION": return <Brain size={14} />;
    case "AGENT_TOOL_CALL": return <Wrench size={14} />;
    case "AGENT_TOOL_RESULT": return <Check size={14} />;
    case "AGENT_TOOL_ERROR": return <AlertTriangle size={14} />;
    case "AGENT_RETRY": return <RefreshCw size={14} />;
    case "AGENT_SPAWN": return <GitBranch size={14} />;
    case "AGENT_GUARDRAIL_HIT": return <Shield size={14} />;
    case "AGENT_SESSION_END": return <Check size={14} />;
    case "AGENT_FALLBACK": return <ArrowRight size={14} />;
    case "AGENT_CONTEXT_HANDOFF": return <Layers size={14} />;
    case "LLM_COMPLETION": return <MessageSquare size={14} />;
    case "MCP_SERVER_CONNECT": return <Zap size={14} />;
    case "MCP_TOOL_DISCOVERY": return <Search size={14} />;
    default: return <Activity size={14} />;
  }
};

const typeLabel = (type) => {
  const map = {
    AGENT_SESSION_START: "Session Start",
    AGENT_DECISION: "Decision",
    AGENT_TOOL_CALL: "Tool Call",
    AGENT_TOOL_RESULT: "Tool Result",
    AGENT_TOOL_ERROR: "Tool Error",
    AGENT_RETRY: "Retry",
    AGENT_SPAWN: "Sub-Agent Spawn",
    AGENT_GUARDRAIL_HIT: "Guardrail Hit",
    AGENT_SESSION_END: "Session End",
    AGENT_FALLBACK: "Fallback",
    AGENT_CONTEXT_HANDOFF: "Context Handoff",
    LLM_COMPLETION: "LLM Completion",
    MCP_SERVER_CONNECT: "MCP Connect",
    MCP_SERVER_DISCONNECT: "MCP Disconnect",
    MCP_TOOL_DISCOVERY: "Tool Discovery",
  };
  return map[type] ?? type;
};

/* ═══════════════════════════════════════════════════
   Agent Trace Page — Session List + Execution Tree
   ═══════════════════════════════════════════════════ */

export default function AgentTracePage({ snapshot }) {
  const sessions = useMemo(() => snapshot?.agentSessions ?? [], [snapshot?.agentSessions]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");

  // Load session detail
  useEffect(() => {
    if (!selectedSessionId) { setSessionDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    authFetch(`${apiBase()}/api/v1/agent-sessions/${selectedSessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) { setSessionDetail(data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setSessionDetail(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [selectedSessionId]);

  // Auto-select first session
  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].sessionId);
    }
  }, [sessions, selectedSessionId]);

  const filteredSessions = useMemo(() => {
    if (!filter.trim()) return sessions;
    const q = filter.toLowerCase();
    return sessions.filter(s =>
      [s.agentName, s.agentId, s.goal, s.model, s.sessionId].filter(Boolean).some(v => v.toLowerCase().includes(q))
    );
  }, [sessions, filter]);

  // Summary stats
  const stats = useMemo(() => {
    const active = sessions.filter(s => s.status === "running").length;
    const totalCost = sessions.reduce((s, sess) => s + (sess.totalCostUsd ?? 0), 0);
    const totalTools = sessions.reduce((s, sess) => s + (sess.toolCalls ?? 0), 0);
    const totalTokens = sessions.reduce((s, sess) => s + (sess.totalTokens ?? 0), 0);
    const errors = sessions.reduce((s, sess) => s + (sess.errors ?? 0), 0);
    return { active, totalCost, totalTools, totalTokens, errors, total: sessions.length };
  }, [sessions]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={22} /> Agent Traces
        </h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div className="header-stat"><Bot size={14} /> <strong>{stats.total}</strong> sessions</div>
          <div className="header-stat" style={{ color: stats.active > 0 ? "var(--green)" : undefined }}>
            <Activity size={14} /> <strong>{stats.active}</strong> active
          </div>
          <div className="header-stat"><Wrench size={14} /> <strong>{stats.totalTools}</strong> tool calls</div>
          <div className="header-stat"><Hash size={14} /> <strong>{fmtTokens(stats.totalTokens)}</strong> tokens</div>
          <div className="header-stat"><DollarSign size={14} /> <strong>{fmtCost(stats.totalCost)}</strong></div>
          {stats.errors > 0 && (
            <div className="header-stat" style={{ color: "var(--red)" }}>
              <AlertTriangle size={14} /> <strong>{stats.errors}</strong> errors
            </div>
          )}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state" style={{ minHeight: 400 }}>
          <Bot size={48} />
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>No Agent Sessions Yet</h3>
          <p style={{ maxWidth: 480, textAlign: "center" }}>
            Connect an MCP-instrumented agent to DevTrace and agent execution traces will appear here automatically.
            <br /><br />
            <strong>Quick start:</strong>
            <code style={{ display: "block", background: "var(--bg-card)", padding: "8px 12px", borderRadius: 6, margin: "8px 0", fontSize: 13 }}>
              pip install devtrace
            </code>
            Then wrap your MCP client:
            <code style={{ display: "block", background: "var(--bg-card)", padding: "8px 12px", borderRadius: 6, margin: "8px 0", fontSize: 13 }}>
              from devtrace import trace_mcp<br />
              client = trace_mcp(your_mcp_client)
            </code>
          </p>
        </div>
      ) : (
        <div className="trace-split" style={{ minHeight: "calc(100vh - 200px)" }}>
          {/* Session List */}
          <div className="trace-split-list" style={{ minWidth: 320, maxWidth: 400 }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-card)", borderRadius: 6, padding: "4px 8px", border: "1px solid var(--border)" }}>
                <Search size={14} style={{ color: "var(--text-muted)" }} />
                <input value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder="Filter sessions…" style={{ background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 13, width: "100%" }} />
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredSessions.map(s => (
                <button key={s.sessionId}
                  className={`sidebar-link ${selectedSessionId === s.sessionId ? "active" : ""}`}
                  onClick={() => setSelectedSessionId(s.sessionId)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--border)", borderRadius: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <Bot size={14} style={{ flexShrink: 0, color: s.status === "running" ? "var(--green)" : "var(--text-muted)" }} />
                      <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.agentName ?? s.agentId}</span>
                    </div>
                    <span className={`status-badge ${s.status === "running" ? "pending" : s.errors > 0 ? "error" : "ok"}`}
                      style={{ fontSize: 10, flexShrink: 0 }}>
                      {s.status === "running" ? "⏳ running" : s.status === "completed" || s.status === "success" ? "✓ done" : s.status}
                    </span>
                  </div>
                  {s.goal && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.goal}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, marginTop: 6, fontSize: 11, color: "var(--text-secondary)" }}>
                    <span><Wrench size={10} /> {s.toolCalls}</span>
                    <span><Hash size={10} /> {fmtTokens(s.totalTokens)}</span>
                    <span><DollarSign size={10} /> {fmtCost(s.totalCostUsd)}</span>
                    <span><Clock size={10} /> {formatDuration(s.durationMs)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Session Detail — Execution Tree */}
          <div className="trace-split-detail" style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div className="empty-state"><Activity size={24} /> Loading…</div>
            ) : sessionDetail ? (
              <AgentSessionDetail session={sessionDetail} />
            ) : (
              <div className="empty-state" style={{ minHeight: 300 }}>
                <Bot size={40} />
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Select a session</h3>
                <p>Choose an agent session from the list to see its execution tree.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Session Detail ─── */
function AgentSessionDetail({ session }) {
  const events = session.events ?? [];
  const anomalies = session.anomalies ?? [];
  const durationMs = session.durationMs ?? (session.endTime ? session.endTime - session.startTime : Date.now() - session.startTime);
  const [shareUrl, setShareUrl] = useState(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = useCallback(async () => {
    setSharing(true);
    try {
      const r = await authFetch(`${apiBase()}/api/v1/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
      if (r.ok) {
        const data = await r.json();
        const url = `${window.location.origin}${window.location.pathname}#share/${data.token}`;
        setShareUrl(url);
        navigator.clipboard.writeText(url).catch(() => {});
      }
    } catch {}
    setSharing(false);
  }, [session.sessionId]);

  // Build cost breakdown
  const costBreakdown = useMemo(() => {
    const breakdown = { llm: 0, tools: 0, retries: 0, total: session.totalCostUsd ?? 0 };
    for (const e of events) {
      const cost = Number(e.attributes?.costUsd ?? e.attributes?.tool?.costUsd ?? 0);
      if (e.type === "LLM_COMPLETION") breakdown.llm += cost;
      else if (e.type === "AGENT_TOOL_CALL") breakdown.tools += cost;
      else if (e.type === "AGENT_RETRY") breakdown.retries += cost;
    }
    return breakdown;
  }, [events, session.totalCostUsd]);

  // Budget info
  const budget = useMemo(() => {
    const last = [...events].reverse().find(e => e.attributes?.budget);
    return last?.attributes?.budget ?? null;
  }, [events]);

  return (
    <div className="trace-detail" style={{ padding: "0 16px 24px" }}>
      {/* Header card */}
      <div className="card" style={{
        background: session.errors > 0 ? "var(--red-glow)" : "var(--accent-glow)",
        borderColor: session.errors > 0 ? "rgba(248,113,113,0.2)" : "rgba(96,165,250,0.2)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Bot size={18} /> {session.agentName ?? session.agentId}
              {session.model && <span className="chip" style={{ fontSize: 11, fontWeight: 400 }}>{session.model}</span>}
            </div>
            {session.goal && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
                Goal: {session.goal}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="btn btn-primary" onClick={handleShare} disabled={sharing}
              style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}>
              {shareUrl ? <Check size={12} /> : <Share2 size={12} />}
              {shareUrl ? "Copied!" : sharing ? "…" : "Share"}
            </button>
            <span className={`status-badge ${session.status === "running" ? "pending" : session.errors > 0 ? "error" : "ok"}`}>
              {session.status}
            </span>
          </div>
        </div>

        {/* Metrics row */}
        <div className="trace-meta" style={{ marginTop: 12 }}>
          <MetricPill icon={<Clock size={12} />} label="Duration" value={formatDuration(durationMs)} />
          <MetricPill icon={<Wrench size={12} />} label="Tool Calls" value={session.toolCalls} />
          <MetricPill icon={<Hash size={12} />} label="Tokens" value={fmtTokens(session.totalTokens)} />
          <MetricPill icon={<DollarSign size={12} />} label="Cost" value={fmtCost(session.totalCostUsd)} />
          <MetricPill icon={<GitBranch size={12} />} label="Sub-Agents" value={session.subAgents?.length ?? 0} />
          {session.errors > 0 && <MetricPill icon={<AlertTriangle size={12} />} label="Errors" value={session.errors} color="var(--red)" />}
          {session.retries > 0 && <MetricPill icon={<RefreshCw size={12} />} label="Retries" value={session.retries} color="var(--amber)" />}
        </div>

        {/* Budget bar */}
        {budget && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              <span>Token Budget</span>
              <span>{fmtTokens(budget.tokensUsed ?? session.totalTokens)} / {fmtTokens(budget.tokenBudget)}</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 3, transition: "width 0.3s",
                width: `${Math.min(100, ((budget.tokensUsed ?? session.totalTokens) / (budget.tokenBudget || 1)) * 100)}%`,
                background: ((budget.tokensUsed ?? session.totalTokens) / (budget.tokenBudget || 1)) > 0.9 ? "var(--red)" :
                  ((budget.tokensUsed ?? session.totalTokens) / (budget.tokenBudget || 1)) > 0.7 ? "var(--amber)" : "var(--green)",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Share URL display */}
      {shareUrl && (
        <div className="card" style={{ marginTop: 12, background: "var(--accent-glow)", borderColor: "rgba(96,165,250,0.2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <Link size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--accent)" }}>{shareUrl}</code>
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(shareUrl)} style={{ fontSize: 11 }}>⎘ Copy</button>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Share this link — anyone can view this trace for 24 hours, no login required.</div>
        </div>
      )}

      {/* Anomaly alerts */}
      {anomalies.length > 0 && (
        <div className="card" style={{ marginTop: 12, background: "var(--red-glow)", borderColor: "rgba(248,113,113,0.15)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, color: "var(--red)" }}>
            <AlertTriangle size={14} /> Anomalies Detected
            <span className="chip" style={{ fontSize: 10, background: "rgba(248,113,113,0.15)", color: "var(--red)" }}>{anomalies.length}</span>
          </div>
          {anomalies.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderTop: i > 0 ? "1px solid rgba(248,113,113,0.1)" : "none" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: a.severity === "critical" ? "rgba(248,113,113,0.2)" : "rgba(251,191,36,0.2)",
                color: a.severity === "critical" ? "var(--red)" : "var(--amber)",
              }}>{a.severity.toUpperCase()}</span>
              <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                <div>{a.message}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{a.type.replace(/_/g, " ")}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cost breakdown */}
      {session.totalCostUsd > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            <DollarSign size={14} /> Cost Breakdown
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
            <CostBar label="LLM Reasoning" cost={costBreakdown.llm} total={costBreakdown.total} color="var(--accent)" />
            <CostBar label="Tool Calls" cost={costBreakdown.tools} total={costBreakdown.total} color="var(--green)" />
            {costBreakdown.retries > 0 && <CostBar label="Retries (waste)" cost={costBreakdown.retries} total={costBreakdown.total} color="var(--red)" />}
          </div>
        </div>
      )}

      {/* Execution Tree */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Layers size={14} /> Execution Tree
          <span className="chip" style={{ fontSize: 10 }}>{events.length} events</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
          {events.length === 0 ? (
            <div style={{ color: "var(--text-muted)", padding: 16, textAlign: "center" }}>Waiting for events…</div>
          ) : (
            events.map((event, i) => (
              <AgentEventNode key={event.eventId ?? i} event={event} index={i} sessionStart={session.startTime} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Single event node in the tree ─── */
function AgentEventNode({ event, index, sessionStart }) {
  const [expanded, setExpanded] = useState(false);
  const relativeMs = event.timestamp - sessionStart;
  const dur = Number(event.durationMs ?? event.attributes?.tool?.latencyMs ?? event.attributes?.latencyMs ?? 0);
  const toolName = event.attributes?.tool?.name ?? event.attributes?.toolName ?? event.name;
  const reasoning = event.attributes?.decision?.reasoning ?? event.attributes?.reasoning ?? null;
  const toolInput = event.attributes?.tool?.input ?? event.attributes?.input ?? null;
  const toolOutput = event.attributes?.tool?.output ?? event.attributes?.output ?? null;
  const error = event.attributes?.error ?? event.attributes?.exception ?? event.attributes?.message ?? null;
  const tokens = Number(event.attributes?.tool?.inputTokens ?? 0) + Number(event.attributes?.tool?.outputTokens ?? 0)
    + Number(event.attributes?.promptTokens ?? 0) + Number(event.attributes?.completionTokens ?? 0);
  const cost = Number(event.attributes?.costUsd ?? event.attributes?.tool?.costUsd ?? 0);

  // Indentation based on type
  const indent = event.type === "AGENT_SPAWN" ? 0 : event.attributes?.agent?.parentAgentId ? 1 : 0;

  const hasDetail = reasoning || toolInput || toolOutput || error || (event.attributes && Object.keys(event.attributes).length > 2);

  return (
    <div style={{ borderLeft: `2px solid ${sevColor(event.type)}22`, marginBottom: 2, paddingLeft: 12 + indent * 16 }}>
      <div
        onClick={() => hasDetail && setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6,
          cursor: hasDetail ? "pointer" : "default",
          background: expanded ? "rgba(255,255,255,0.03)" : "transparent",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (hasDetail) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}
      >
        {/* Expand chevron */}
        <span style={{ width: 14, flexShrink: 0, color: "var(--text-muted)" }}>
          {hasDetail ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
        </span>

        {/* Icon */}
        <span style={{ color: sevColor(event.type), flexShrink: 0 }}>{typeIcon(event.type)}</span>

        {/* Label */}
        <span style={{ color: sevColor(event.type), fontWeight: 600, fontSize: 11, minWidth: 90, flexShrink: 0 }}>
          {typeLabel(event.type)}
        </span>

        {/* Name / Tool / Reasoning preview */}
        <span style={{ color: "var(--text-primary)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {event.type === "AGENT_TOOL_CALL" || event.type === "AGENT_TOOL_ERROR" ? (
            <>{toolName && <strong>{toolName}</strong>}{toolInput && <span style={{ color: "var(--text-muted)" }}>({typeof toolInput === "object" ? JSON.stringify(toolInput).slice(0, 60) : String(toolInput).slice(0, 60)})</span>}</>
          ) : event.type === "AGENT_DECISION" ? (
            <span style={{ color: "var(--text-secondary)", fontStyle: "italic" }}>{(reasoning ?? event.name ?? "").slice(0, 80)}</span>
          ) : event.type === "AGENT_SPAWN" ? (
            <span>→ <strong>{event.attributes?.childAgentName ?? event.attributes?.agentName ?? "sub-agent"}</strong> {event.attributes?.goal ? `"${event.attributes.goal.slice(0, 50)}"` : ""}</span>
          ) : event.type === "LLM_COMPLETION" ? (
            <span>{event.attributes?.model ?? "LLM"} · {fmtTokens(tokens)} tokens</span>
          ) : event.type === "AGENT_SESSION_END" ? (
            <span>{event.attributes?.outcome ?? event.status ?? "completed"}</span>
          ) : event.type === "AGENT_GUARDRAIL_HIT" ? (
            <span style={{ color: "var(--red)" }}>{event.attributes?.guardrail ?? event.name ?? "guardrail triggered"}</span>
          ) : (
            <span>{event.name ?? ""}</span>
          )}
        </span>

        {/* Right-side metrics */}
        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--text-muted)", flexShrink: 0, alignItems: "center" }}>
          {dur > 0 && <span style={{ color: dur > 2000 ? "var(--red)" : dur > 500 ? "var(--amber)" : "var(--text-muted)" }}>{formatDuration(dur)}</span>}
          {tokens > 0 && <span>{fmtTokens(tokens)} tok</span>}
          {cost > 0 && <span>{fmtCost(cost)}</span>}
          <span style={{ minWidth: 50, textAlign: "right" }}>+{formatDuration(relativeMs)}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div style={{ padding: "8px 8px 12px 36px", fontSize: 12, color: "var(--text-secondary)" }}>
          {reasoning && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>REASONING</div>
              <div style={{ color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.5 }}>{reasoning}</div>
            </div>
          )}
          {event.attributes?.decision?.alternativesConsidered && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>ALTERNATIVES CONSIDERED</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {event.attributes.decision.alternativesConsidered.map((alt, i) => (
                  <span key={i} className="chip" style={{ fontSize: 10 }}>❌ {alt}</span>
                ))}
              </div>
            </div>
          )}
          {toolInput && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>INPUT</div>
              <pre style={{ background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 4, overflowX: "auto", margin: 0, fontSize: 11, maxHeight: 200, overflow: "auto" }}>
                {typeof toolInput === "object" ? JSON.stringify(toolInput, null, 2) : toolInput}
              </pre>
            </div>
          )}
          {toolOutput && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>OUTPUT</div>
              <pre style={{ background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 4, overflowX: "auto", margin: 0, fontSize: 11, maxHeight: 200, overflow: "auto" }}>
                {typeof toolOutput === "object" ? JSON.stringify(toolOutput, null, 2) : toolOutput}
              </pre>
            </div>
          )}
          {error && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--red)", marginBottom: 2 }}>ERROR</div>
              <pre style={{ background: "rgba(248,113,113,0.08)", color: "var(--red)", padding: 8, borderRadius: 4, margin: 0, fontSize: 11, maxHeight: 200, overflow: "auto" }}>
                {typeof error === "object" ? JSON.stringify(error, null, 2) : error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Small components ─── */
function MetricPill({ icon, label, value, color }) {
  return (
    <div className="trace-datum">
      <div className="trace-datum-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>{icon} {label}</div>
      <div className="trace-datum-value" style={color ? { color } : {}}>{value}</div>
    </div>
  );
}

function CostBar({ label, cost, total, color }) {
  const pct = total > 0 ? (cost / total) * 100 : 0;
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
        <span>{label}</span>
        <span>{fmtCost(cost)} ({pct.toFixed(0)}%)</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}






