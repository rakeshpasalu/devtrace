import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Target, TrendingDown, TrendingUp, AlertTriangle, CheckCircle, Clock,
  Plus, Trash2, Edit3, Save, X, Activity, BarChart3, Shield
} from "lucide-react";
import { formatDuration } from "../utils.js";

/* ─── SLO Budget Computation ─── */
function computeSLO(slo, analytics) {
  const ep = analytics.find(a => a.endpoint === slo.endpoint);
  if (!ep) return { ...slo, status: "no-data", current: null, budget: 100, burnRate: 0 };

  let current, target, budget, status;

  if (slo.type === "latency") {
    current = ep[slo.percentile] ?? ep.p95;
    target = slo.threshold;
    budget = target > 0 ? Math.max(0, ((target - current) / target) * 100) : 100;
    status = current <= target ? "healthy" : budget > -20 ? "warning" : "breached";
  } else if (slo.type === "error-rate") {
    current = ep.errorRate;
    target = slo.threshold;
    budget = target > 0 ? Math.max(0, ((target - current) / target) * 100) : 100;
    status = current <= target ? "healthy" : current <= target * 1.5 ? "warning" : "breached";
  } else if (slo.type === "availability") {
    const avail = ep.total > 0 ? ((ep.total - ep.errors) / ep.total) * 100 : 100;
    current = avail;
    target = slo.threshold;
    budget = Math.max(0, current - target);
    status = current >= target ? "healthy" : current >= target - 1 ? "warning" : "breached";
  }

  // Burn rate (how fast we're consuming budget, normalized to 1.0 = steady)
  const burnRate = budget > 0 ? Math.max(0, (100 - budget) / Math.max(1, 100 - budget)) : 999;

  return { ...slo, status, current, budget: Math.round(budget * 100) / 100, burnRate: Math.round(burnRate * 100) / 100, ep };
}

/* ─── Mini Gauge ─── */
function BudgetGauge({ budget, size = 64 }) {
  const pct = Math.max(0, Math.min(100, budget));
  const color = pct > 50 ? "var(--green)" : pct > 20 ? "var(--amber)" : "var(--red)";
  const r = 24;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          transform="rotate(-90 32 32)" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color
      }}>
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

/* ─── SLO Card ─── */
function SLOCard({ slo, onEdit, onDelete }) {
  const statusIcon = slo.status === "healthy" ? <CheckCircle size={16} style={{ color: "var(--green)" }} />
    : slo.status === "warning" ? <AlertTriangle size={16} style={{ color: "var(--amber)" }} />
    : slo.status === "breached" ? <AlertTriangle size={16} style={{ color: "var(--red)" }} />
    : <Clock size={16} style={{ color: "var(--text-muted)" }} />;

  const borderColor = slo.status === "healthy" ? "rgba(52,211,153,0.2)"
    : slo.status === "warning" ? "rgba(251,191,36,0.2)"
    : slo.status === "breached" ? "rgba(248,113,113,0.3)"
    : "var(--border)";

  const bgColor = slo.status === "breached" ? "var(--red-glow)"
    : slo.status === "warning" ? "rgba(251,191,36,0.04)"
    : "transparent";

  return (
    <div className="slo-card" style={{ borderColor, background: bgColor }}>
      <div className="slo-card-header">
        <div className="slo-card-left">
          {statusIcon}
          <div>
            <div className="slo-card-name">{slo.name}</div>
            <div className="slo-card-endpoint">{slo.endpoint}</div>
          </div>
        </div>
        <div className="slo-card-actions">
          <button className="btn btn-ghost" onClick={() => onEdit(slo)} style={{ padding: "4px 6px" }}><Edit3 size={12} /></button>
          <button className="btn btn-ghost" onClick={() => onDelete(slo.id)} style={{ padding: "4px 6px", color: "var(--red)" }}><Trash2 size={12} /></button>
        </div>
      </div>

      <div className="slo-card-body">
        <BudgetGauge budget={slo.budget ?? 100} />
        <div className="slo-card-metrics">
          <div className="slo-metric">
            <span className="slo-metric-label">Type</span>
            <span className="slo-metric-value">{slo.type === "latency" ? `Latency (${slo.percentile ?? "p95"})` : slo.type === "error-rate" ? "Error Rate" : "Availability"}</span>
          </div>
          <div className="slo-metric">
            <span className="slo-metric-label">Target</span>
            <span className="slo-metric-value" style={{ fontFamily: "var(--font-mono)" }}>
              {slo.type === "latency" ? `≤ ${formatDuration(slo.threshold)}` :
               slo.type === "error-rate" ? `≤ ${slo.threshold}%` :
               `≥ ${slo.threshold}%`}
            </span>
          </div>
          <div className="slo-metric">
            <span className="slo-metric-label">Current</span>
            <span className="slo-metric-value" style={{
              fontFamily: "var(--font-mono)",
              color: slo.status === "healthy" ? "var(--green)" : slo.status === "warning" ? "var(--amber)" : slo.status === "breached" ? "var(--red)" : "var(--text-secondary)"
            }}>
              {slo.current != null
                ? slo.type === "latency" ? formatDuration(slo.current) : `${slo.current.toFixed(2)}%`
                : "—"}
            </span>
          </div>
          <div className="slo-metric">
            <span className="slo-metric-label">Error Budget</span>
            <span className="slo-metric-value" style={{
              fontFamily: "var(--font-mono)",
              color: (slo.budget ?? 100) > 50 ? "var(--green)" : (slo.budget ?? 100) > 20 ? "var(--amber)" : "var(--red)"
            }}>
              {(slo.budget ?? 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── SLO Editor Modal ─── */
function SLOEditor({ slo, endpoints, onSave, onCancel }) {
  const [form, setForm] = useState(slo ?? {
    name: "", endpoint: endpoints[0]?.endpoint ?? "", type: "latency", percentile: "p95", threshold: 200,
  });

  function update(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  return (
    <div className="slo-editor-overlay" onClick={onCancel}>
      <div className="slo-editor" onClick={e => e.stopPropagation()}>
        <div className="slo-editor-header">
          <h3>{slo ? "Edit SLO" : "New SLO"}</h3>
          <button className="btn btn-ghost" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="slo-editor-body">
          <div className="slo-field">
            <label>Name</label>
            <input value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g. Order API Latency" className="settings-input" />
          </div>
          <div className="slo-field">
            <label>Endpoint</label>
            <select value={form.endpoint} onChange={e => update("endpoint", e.target.value)} className="settings-input">
              {endpoints.map(ep => <option key={ep.endpoint} value={ep.endpoint}>{ep.endpoint}</option>)}
            </select>
          </div>
          <div className="slo-field">
            <label>SLO Type</label>
            <select value={form.type} onChange={e => update("type", e.target.value)} className="settings-input">
              <option value="latency">Latency</option>
              <option value="error-rate">Error Rate</option>
              <option value="availability">Availability</option>
            </select>
          </div>
          {form.type === "latency" && (
            <div className="slo-field">
              <label>Percentile</label>
              <select value={form.percentile ?? "p95"} onChange={e => update("percentile", e.target.value)} className="settings-input">
                <option value="p50">p50</option>
                <option value="p95">p95</option>
                <option value="p99">p99</option>
              </select>
            </div>
          )}
          <div className="slo-field">
            <label>Threshold {form.type === "latency" ? "(ms)" : form.type === "error-rate" ? "(%)" : "(% uptime)"}</label>
            <input type="number" value={form.threshold} onChange={e => update("threshold", Number(e.target.value))} className="settings-input" min={0} />
          </div>
        </div>
        <div className="slo-editor-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, id: slo?.id ?? `slo-${Date.now()}` })} disabled={!form.name || !form.endpoint}>
            <Save size={14} /> Save SLO
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function SLOTrackerPage({ analytics }) {
  const endpoints = analytics ?? [];
  const [slos, setSlos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("devtrace-slos") ?? "[]"); } catch { return []; }
  });
  const [editing, setEditing] = useState(null); // null | {} for new | slo obj for edit
  const [showEditor, setShowEditor] = useState(false);

  // Persist
  useEffect(() => {
    localStorage.setItem("devtrace-slos", JSON.stringify(slos));
  }, [slos]);

  const computed = useMemo(() => slos.map(s => computeSLO(s, endpoints)), [slos, endpoints]);

  const summary = useMemo(() => {
    const healthy = computed.filter(s => s.status === "healthy").length;
    const warning = computed.filter(s => s.status === "warning").length;
    const breached = computed.filter(s => s.status === "breached").length;
    const avgBudget = computed.length > 0 ? computed.reduce((s, c) => s + (c.budget ?? 100), 0) / computed.length : 100;
    return { healthy, warning, breached, total: computed.length, avgBudget };
  }, [computed]);

  function handleSave(slo) {
    setSlos(prev => {
      const idx = prev.findIndex(s => s.id === slo.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = slo; return next; }
      return [...prev, slo];
    });
    setShowEditor(false);
    setEditing(null);
  }

  function handleDelete(id) {
    setSlos(prev => prev.filter(s => s.id !== id));
  }

  function handleEdit(slo) {
    setEditing(slo);
    setShowEditor(true);
  }

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Target size={22} /> SLO Budget Tracker
        </h1>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowEditor(true); }} disabled={endpoints.length === 0}>
          <Plus size={14} /> Define SLO
        </button>
      </div>

      {/* Summary metrics */}
      {computed.length > 0 && (
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-label"><Shield size={14} /> Total SLOs</div>
            <div className="metric-value">{summary.total}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label" style={{ color: "var(--green)" }}><CheckCircle size={14} /> Healthy</div>
            <div className="metric-value" style={{ color: "var(--green)" }}>{summary.healthy}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label" style={{ color: "var(--amber)" }}><AlertTriangle size={14} /> Warning</div>
            <div className="metric-value" style={{ color: "var(--amber)" }}>{summary.warning}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label" style={{ color: "var(--red)" }}><AlertTriangle size={14} /> Breached</div>
            <div className="metric-value" style={{ color: "var(--red)" }}>{summary.breached}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label"><BarChart3 size={14} /> Avg Budget</div>
            <div className="metric-value" style={{
              color: summary.avgBudget > 50 ? "var(--green)" : summary.avgBudget > 20 ? "var(--amber)" : "var(--red)"
            }}>{summary.avgBudget.toFixed(1)}%</div>
          </div>
        </div>
      )}

      {/* Breached alerts */}
      {computed.filter(s => s.status === "breached").map(s => (
        <div key={s.id} className="slo-breach-alert">
          <AlertTriangle size={18} style={{ color: "var(--red)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>SLO Breached: {s.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {s.endpoint} — Current: {s.type === "latency" ? formatDuration(s.current) : `${s.current?.toFixed(2)}%`}
              {" "}(target: {s.type === "latency" ? `≤${formatDuration(s.threshold)}` : s.type === "error-rate" ? `≤${s.threshold}%` : `≥${s.threshold}%`})
            </div>
          </div>
          <span className="chip" style={{ background: "var(--red-glow)", color: "var(--red)" }}>Budget: {s.budget?.toFixed(1)}%</span>
        </div>
      ))}

      {/* SLO cards */}
      {computed.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Target size={40} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>SLO Budget Tracker</h3>
          <p style={{ color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
            Define Service Level Objectives for your endpoints. Track latency targets, error rate budgets,
            and availability goals in real-time.<br /><br />
            {endpoints.length === 0
              ? "Waiting for endpoint analytics data…"
              : <><strong>{endpoints.length} endpoints</strong> available. Click "Define SLO" to get started.</>}
          </p>
        </div>
      ) : (
        <div className="slo-grid">
          {computed.map(s => (
            <SLOCard key={s.id} slo={s} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Editor modal */}
      {showEditor && (
        <SLOEditor slo={editing} endpoints={endpoints} onSave={handleSave} onCancel={() => { setShowEditor(false); setEditing(null); }} />
      )}
    </>
  );
}

