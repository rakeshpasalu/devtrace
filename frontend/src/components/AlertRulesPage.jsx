import { useEffect, useMemo, useState } from "react";
import {
  Bell, Plus, Trash2, Edit3, Save, X, CheckCircle, AlertTriangle,
  AlertOctagon, Clock, Activity, Zap, Shield, Volume2, VolumeX, ToggleLeft, ToggleRight
} from "lucide-react";
import { formatDuration, formatTimestamp } from "../utils.js";

/* ─── Alert Evaluation ─── */
function evaluateAlerts(rules, analytics, diagnostics) {
  const now = Date.now();
  return rules.map(rule => {
    if (!rule.enabled) return { ...rule, state: "disabled", violations: [] };

    const violations = [];

    if (rule.scope === "endpoint") {
      const ep = (analytics ?? []).find(a => a.endpoint === rule.endpoint);
      if (!ep) return { ...rule, state: "no-data", violations: [] };

      if (rule.metric === "p95" && ep.p95 > rule.threshold) violations.push({ endpoint: rule.endpoint, metric: "p95", value: ep.p95, threshold: rule.threshold });
      if (rule.metric === "p99" && ep.p99 > rule.threshold) violations.push({ endpoint: rule.endpoint, metric: "p99", value: ep.p99, threshold: rule.threshold });
      if (rule.metric === "avg" && ep.avg > rule.threshold) violations.push({ endpoint: rule.endpoint, metric: "avg", value: ep.avg, threshold: rule.threshold });
      if (rule.metric === "error-rate" && ep.errorRate > rule.threshold) violations.push({ endpoint: rule.endpoint, metric: "error-rate", value: ep.errorRate, threshold: rule.threshold });
      if (rule.metric === "total" && ep.total > rule.threshold) violations.push({ endpoint: rule.endpoint, metric: "total", value: ep.total, threshold: rule.threshold });
    } else if (rule.scope === "global") {
      const errs = diagnostics?.errors ?? [];
      const slowSpans = diagnostics?.slowSpans ?? [];

      if (rule.metric === "error-count" && errs.length > rule.threshold) violations.push({ metric: "error-count", value: errs.length, threshold: rule.threshold });
      if (rule.metric === "slow-span-count" && slowSpans.length > rule.threshold) violations.push({ metric: "slow-span-count", value: slowSpans.length, threshold: rule.threshold });
      if (rule.metric === "anomaly-count") {
        const anomalies = (analytics ?? []).filter(a => a.anomaly).length;
        if (anomalies > rule.threshold) violations.push({ metric: "anomaly-count", value: anomalies, threshold: rule.threshold });
      }
    }

    const state = violations.length > 0 ? (rule.severity === "critical" ? "critical" : "warning") : "ok";
    return { ...rule, state, violations, evaluatedAt: now };
  });
}

/* ─── Alert Card ─── */
function AlertCard({ alert, onToggle, onEdit, onDelete }) {
  const stateIcon = alert.state === "critical" ? <AlertOctagon size={18} style={{ color: "var(--red)" }} />
    : alert.state === "warning" ? <AlertTriangle size={18} style={{ color: "var(--amber)" }} />
    : alert.state === "ok" ? <CheckCircle size={18} style={{ color: "var(--green)" }} />
    : alert.state === "disabled" ? <VolumeX size={18} style={{ color: "var(--text-muted)" }} />
    : <Clock size={18} style={{ color: "var(--text-muted)" }} />;

  const borderColor = alert.state === "critical" ? "rgba(248,113,113,0.3)"
    : alert.state === "warning" ? "rgba(251,191,36,0.2)"
    : alert.state === "ok" ? "rgba(52,211,153,0.2)"
    : "var(--border)";

  const bg = alert.state === "critical" ? "var(--red-glow)"
    : alert.state === "warning" ? "rgba(251,191,36,0.04)"
    : "transparent";

  return (
    <div className="alert-card" style={{ borderColor, background: bg }}>
      <div className="alert-card-header">
        <div className="alert-card-left">
          {stateIcon}
          <div>
            <div className="alert-card-name">{alert.name}</div>
            <div className="alert-card-meta">
              <span className={`chip ${alert.severity === "critical" ? "chip-critical" : "chip-warning"}`}>{alert.severity}</span>
              <span className="alert-card-scope">{alert.scope === "endpoint" ? alert.endpoint : "Global"}</span>
            </div>
          </div>
        </div>
        <div className="alert-card-actions">
          <button className="btn btn-ghost" onClick={() => onToggle(alert.id)} style={{ padding: "4px 6px" }} title={alert.enabled ? "Disable" : "Enable"}>
            {alert.enabled ? <ToggleRight size={18} style={{ color: "var(--green)" }} /> : <ToggleLeft size={18} style={{ color: "var(--text-muted)" }} />}
          </button>
          <button className="btn btn-ghost" onClick={() => onEdit(alert)} style={{ padding: "4px 6px" }}><Edit3 size={12} /></button>
          <button className="btn btn-ghost" onClick={() => onDelete(alert.id)} style={{ padding: "4px 6px", color: "var(--red)" }}><Trash2 size={12} /></button>
        </div>
      </div>

      <div className="alert-card-condition">
        <span className="alert-condition-label">Condition:</span>
        <span className="alert-condition-text">
          {alert.metric} {alert.metric.includes("rate") || alert.metric.includes("count") ? ">" : ">"} {alert.metric.includes("rate") ? `${alert.threshold}%` : alert.metric.includes("count") ? alert.threshold : formatDuration(alert.threshold)}
        </span>
      </div>

      {alert.violations?.length > 0 && (
        <div className="alert-violations">
          {alert.violations.map((v, i) => (
            <div key={i} className="alert-violation-row">
              <AlertTriangle size={12} style={{ color: alert.state === "critical" ? "var(--red)" : "var(--amber)", flexShrink: 0 }} />
              <span>
                {v.endpoint ? `${v.endpoint}: ` : ""}
                {v.metric} = <strong>{v.metric.includes("rate") ? `${v.value}%` : v.metric.includes("count") ? v.value : formatDuration(v.value)}</strong>
                {" "}(threshold: {v.metric.includes("rate") ? `${v.threshold}%` : v.metric.includes("count") ? v.threshold : formatDuration(v.threshold)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Rule Editor Modal ─── */
function RuleEditor({ rule, endpoints, onSave, onCancel }) {
  const [form, setForm] = useState(rule ?? {
    name: "", scope: "endpoint", endpoint: endpoints[0]?.endpoint ?? "",
    metric: "p95", threshold: 500, severity: "warning", enabled: true,
  });

  function update(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  const metrics = form.scope === "endpoint"
    ? [{ v: "p95", l: "p95 Latency" }, { v: "p99", l: "p99 Latency" }, { v: "avg", l: "Avg Latency" }, { v: "error-rate", l: "Error Rate (%)" }, { v: "total", l: "Request Count" }]
    : [{ v: "error-count", l: "Total Errors" }, { v: "slow-span-count", l: "Slow Span Count" }, { v: "anomaly-count", l: "Anomaly Count" }];

  return (
    <div className="slo-editor-overlay" onClick={onCancel}>
      <div className="slo-editor" onClick={e => e.stopPropagation()}>
        <div className="slo-editor-header">
          <h3>{rule ? "Edit Alert Rule" : "New Alert Rule"}</h3>
          <button className="btn btn-ghost" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="slo-editor-body">
          <div className="slo-field">
            <label>Rule Name</label>
            <input value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. High latency on /api/orders" className="settings-input" />
          </div>
          <div className="slo-field">
            <label>Scope</label>
            <select value={form.scope} onChange={e => { update("scope", e.target.value); update("metric", e.target.value === "endpoint" ? "p95" : "error-count"); }} className="settings-input">
              <option value="endpoint">Single Endpoint</option>
              <option value="global">Global (all endpoints)</option>
            </select>
          </div>
          {form.scope === "endpoint" && (
            <div className="slo-field">
              <label>Endpoint</label>
              <select value={form.endpoint} onChange={e => update("endpoint", e.target.value)} className="settings-input">
                {endpoints.map(ep => <option key={ep.endpoint} value={ep.endpoint}>{ep.endpoint}</option>)}
              </select>
            </div>
          )}
          <div className="slo-field">
            <label>Metric</label>
            <select value={form.metric} onChange={e => update("metric", e.target.value)} className="settings-input">
              {metrics.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
            </select>
          </div>
          <div className="slo-field">
            <label>Threshold</label>
            <input type="number" value={form.threshold} onChange={e => update("threshold", Number(e.target.value))} className="settings-input" min={0} />
          </div>
          <div className="slo-field">
            <label>Severity</label>
            <select value={form.severity} onChange={e => update("severity", e.target.value)} className="settings-input">
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="slo-editor-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, id: rule?.id ?? `alert-${Date.now()}` })} disabled={!form.name}>
            <Save size={14} /> Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AlertRulesPage({ analytics, diagnostics }) {
  const endpoints = analytics ?? [];
  const [rules, setRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem("devtrace-alert-rules") ?? "[]"); } catch { return []; }
  });
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    localStorage.setItem("devtrace-alert-rules", JSON.stringify(rules));
  }, [rules]);

  const evaluated = useMemo(() => evaluateAlerts(rules, endpoints, diagnostics), [rules, endpoints, diagnostics]);

  const summary = useMemo(() => ({
    total: evaluated.length,
    critical: evaluated.filter(a => a.state === "critical").length,
    warning: evaluated.filter(a => a.state === "warning").length,
    ok: evaluated.filter(a => a.state === "ok").length,
    disabled: evaluated.filter(a => a.state === "disabled").length,
  }), [evaluated]);

  function handleSave(rule) {
    setRules(prev => {
      const idx = prev.findIndex(r => r.id === rule.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = rule; return next; }
      return [...prev, rule];
    });
    setShowEditor(false);
    setEditing(null);
  }

  function handleToggle(id) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  }

  function handleDelete(id) {
    setRules(prev => prev.filter(r => r.id !== id));
  }

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={22} /> Alert Rules
        </h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowEditor(true); }} disabled={endpoints.length === 0}>
          <Plus size={14} /> New Rule
        </button>
      </div>

      {/* Summary */}
      {evaluated.length > 0 && (
        <div className="metrics-row">
          <div className="metric-card"><div className="metric-label"><Bell size={14} /> Total Rules</div><div className="metric-value">{summary.total}</div></div>
          <div className="metric-card"><div className="metric-label" style={{ color: "var(--red)" }}><AlertOctagon size={14} /> Critical</div><div className="metric-value" style={{ color: "var(--red)" }}>{summary.critical}</div></div>
          <div className="metric-card"><div className="metric-label" style={{ color: "var(--amber)" }}><AlertTriangle size={14} /> Warning</div><div className="metric-value" style={{ color: "var(--amber)" }}>{summary.warning}</div></div>
          <div className="metric-card"><div className="metric-label" style={{ color: "var(--green)" }}><CheckCircle size={14} /> OK</div><div className="metric-value" style={{ color: "var(--green)" }}>{summary.ok}</div></div>
          <div className="metric-card"><div className="metric-label"><VolumeX size={14} /> Disabled</div><div className="metric-value">{summary.disabled}</div></div>
        </div>
      )}

      {/* Firing alerts first */}
      {evaluated.filter(a => a.state === "critical" || a.state === "warning").length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--red)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Volume2 size={16} /> Firing Alerts
          </div>
          <div className="alert-grid">
            {evaluated.filter(a => a.state === "critical" || a.state === "warning").map(a => (
              <AlertCard key={a.id} alert={a} onToggle={handleToggle} onEdit={r => { setEditing(r); setShowEditor(true); }} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* All rules */}
      {evaluated.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Bell size={40} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Alert Rules Engine</h3>
          <p style={{ color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
            Configure threshold-based alert rules for your endpoints. Get instant visibility
            into latency spikes, error rate surges, and anomaly patterns.<br /><br />
            {endpoints.length === 0 ? "Waiting for endpoint data…" : `${endpoints.length} endpoints available. Click "New Rule" to start.`}
          </p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 10, marginTop: 16 }}>All Rules</div>
          <div className="alert-grid">
            {evaluated.filter(a => a.state !== "critical" && a.state !== "warning").map(a => (
              <AlertCard key={a.id} alert={a} onToggle={handleToggle} onEdit={r => { setEditing(r); setShowEditor(true); }} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}

      {showEditor && (
        <RuleEditor rule={editing} endpoints={endpoints} onSave={handleSave} onCancel={() => { setShowEditor(false); setEditing(null); }} />
      )}
    </>
  );
}

