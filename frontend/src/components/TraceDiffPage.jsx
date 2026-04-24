import { useCallback, useEffect, useState } from "react";
import { apiBase, authFetch, formatDuration, spanColor } from "../utils.js";
import { GitCompare, ArrowRight, Plus, Minus, Equal, Search } from "lucide-react";

const COMPONENT_LABELS = {
  "http-server": "HTTP Server", "http-client": "Outbound HTTP",
  controller: "Controller", service: "Service", repository: "Repository",
  database: "Database", async: "Async",
};

export default function TraceDiffPage({ requests }) {
  const [traceIdA, setTraceIdA] = useState("");
  const [traceIdB, setTraceIdB] = useState("");
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");

  const loadDiff = useCallback(async () => {
    if (!traceIdA || !traceIdB) return;
    setLoading(true);
    setError("");
    try {
      const r = await authFetch(`${apiBase()}/api/v1/diff?a=${traceIdA}&b=${traceIdB}`);
      if (!r.ok) { setError("Could not load diff. Check that both trace IDs exist."); setDiff(null); }
      else setDiff(await r.json());
    } catch { setError("Network error."); setDiff(null); }
    setLoading(false);
  }, [traceIdA, traceIdB]);

  const filteredA = requests.filter(r => {
    const q = searchA.toLowerCase();
    return !q || [r.traceId, r.path, r.method, r.service].some(v => String(v ?? "").toLowerCase().includes(q));
  }).slice(0, 30);

  const filteredB = requests.filter(r => {
    const q = searchB.toLowerCase();
    return !q || [r.traceId, r.path, r.method, r.service].some(v => String(v ?? "").toLowerCase().includes(q));
  }).slice(0, 30);

  return (
    <>
      <div className="page-header">
        <h1>Trace Diff</h1>
        <span className="card-badge" style={{ background: "rgba(167,139,250,0.12)", color: "var(--purple)" }}>Comparative Analysis</span>
      </div>

      {/* Picker */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, marginBottom: 24, alignItems: "start" }}>
        <TracePicker label="Trace A (Baseline)" traceId={traceIdA} onSelect={setTraceIdA}
          requests={filteredA} search={searchA} onSearch={setSearchA} color="var(--accent)" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 44 }}>
          <ArrowRight size={20} style={{ color: "var(--text-muted)" }} />
        </div>
        <TracePicker label="Trace B (Comparison)" traceId={traceIdB} onSelect={setTraceIdB}
          requests={filteredB} search={searchB} onSearch={setSearchB} color="var(--purple)" />
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-primary" disabled={!traceIdA || !traceIdB || loading} onClick={loadDiff}>
          <GitCompare size={14}/> {loading ? "Loading…" : "Compare Traces"}
        </button>
      </div>

      {error && <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--red-glow)", border: "1px solid rgba(248,113,113,0.2)", color: "var(--red)", fontSize: 13, marginBottom: 20 }}>{error}</div>}

      {!diff && !error && (
        <div className="card">
          <div className="empty-state" style={{ padding: "48px 24px" }}>
            <GitCompare size={40} />
            <h3 style={{ margin: "12px 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Comparative Trace Diff</h3>
            <p style={{ maxWidth: 520, lineHeight: 1.7 }}>
              Select two traces to compare their execution side by side.<br/><br/>
              Use this to debug performance regressions — pick a fast trace as baseline (A) and
              a slow trace as comparison (B) to see exactly which spans changed.
            </p>
          </div>
        </div>
      )}

      {diff && <DiffResult diff={diff} />}
    </>
  );
}

function TracePicker({ label, traceId, onSelect, requests, search, onSearch, color }) {
  const [open, setOpen] = useState(false);
  const selected = requests.find(r => r.traceId === traceId);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", padding: "10px 14px", borderRadius: 10,
        border: `1px solid ${traceId ? color + "55" : "var(--border)"}`,
        background: traceId ? color + "11" : "var(--bg-card)",
        cursor: "pointer", textAlign: "left", fontSize: 12, color: "var(--text-primary)",
      }}>
        {selected ? (
          <div>
            <div style={{ fontWeight: 600 }}>{selected.method} {selected.path}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {selected.service} · {formatDuration(selected.durationMs)} · {selected.status}
            </div>
          </div>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Click to select a trace…</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: "var(--bg-sidebar)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 12px 40px rgba(0,0,0,0.3)", maxHeight: 300, overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}>
            <Search size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input value={search} onChange={e => onSearch(e.target.value)} autoFocus
              placeholder="Filter by path, service…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--text-primary)" }} />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {requests.map(r => (
              <button key={r.traceId} onClick={() => { onSelect(r.traceId); setOpen(false); }} style={{
                display: "block", width: "100%", padding: "8px 12px", border: "none", textAlign: "left",
                background: r.traceId === traceId ? color + "18" : "transparent",
                cursor: "pointer", fontSize: 12, color: "var(--text-primary)",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{ fontWeight: 600 }}>{r.method} {r.path}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                  {r.service} · {formatDuration(r.durationMs)} · {r.status}
                </div>
              </button>
            ))}
            {requests.length === 0 && (
              <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>No traces found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffResult({ diff }) {
  const { traceA, traceB, spanDiffs } = diff;
  const durA = traceA.summary.durationMs ?? 0;
  const durB = traceB.summary.durationMs ?? 0;
  const durDiff = durB - durA;
  const durPct = durA > 0 ? Math.round((durDiff / durA) * 100) : 0;

  return (
    <div className="trace-detail">
      {/* Summary comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, marginBottom: 0 }}>
        <SummaryCard trace={traceA} label="A — Baseline" color="var(--accent)" />
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 8, padding: "20px 16px",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
            color: durDiff > 0 ? "var(--red)" : durDiff < 0 ? "var(--green)" : "var(--text-muted)",
          }}>
            {durDiff > 0 ? "+" : ""}{formatDuration(durDiff)}
          </div>
          {durPct !== 0 && (
            <div style={{
              fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
              background: durDiff > 0 ? "var(--red-glow)" : "var(--green-glow)",
              color: durDiff > 0 ? "var(--red)" : "var(--green)",
            }}>
              {durDiff > 0 ? "+" : ""}{durPct}%
            </div>
          )}
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Δ Duration</div>
        </div>
        <SummaryCard trace={traceB} label="B — Comparison" color="var(--purple)" />
      </div>

      {/* Component breakdown comparison */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Component Breakdown</span>
        </div>
        <ComponentCompare a={traceA.componentBreakdown} b={traceB.componentBreakdown} />
      </div>

      {/* Span diff table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Span Diff</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 10 }}>
            {spanDiffs.length} unique spans
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Span</th>
                <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>Layer</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--accent)" }}>A Time</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--purple)" }}>B Time</th>
                <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, fontSize: 11, color: "var(--text-muted)" }}>Δ</th>
              </tr>
            </thead>
            <tbody>
              {spanDiffs.slice(0, 60).map((s, i) => (
                <tr key={i} style={{
                  borderBottom: "1px solid var(--border)",
                  background: s.status === "added" ? "rgba(52,211,153,0.04)" : s.status === "removed" ? "rgba(248,113,113,0.04)" : "transparent",
                }}>
                  <td style={{ padding: "8px 16px", maxWidth: 260 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {s.status === "added" && <Plus size={12} style={{ color: "var(--green)", flexShrink: 0 }} />}
                      {s.status === "removed" && <Minus size={12} style={{ color: "var(--red)", flexShrink: 0 }} />}
                      {s.status === "both" && <Equal size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                      <span style={{
                        fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        color: s.status === "removed" ? "var(--red)" : s.status === "added" ? "var(--green)" : "var(--text-primary)",
                      }} title={s.name}>{s.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10,
                      padding: "2px 6px", borderRadius: 4,
                      background: spanColor(s.component) + "18", color: spanColor(s.component),
                      fontWeight: 600,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 2, background: spanColor(s.component) }} />
                      {COMPONENT_LABELS[s.component] ?? s.component}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: s.inA ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {s.inA ? `${formatDuration(s.inA.totalMs)} ×${s.inA.count}` : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "var(--font-mono)", color: s.inB ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {s.inB ? `${formatDuration(s.inB.totalMs)} ×${s.inB.count}` : "—"}
                  </td>
                  <td style={{
                    padding: "8px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: s.diffMs > 10 ? "var(--red)" : s.diffMs < -10 ? "var(--green)" : "var(--text-muted)",
                  }}>
                    {s.status === "both" ? (s.diffMs > 0 ? "+" : "") + formatDuration(s.diffMs) : s.status === "added" ? "+new" : "−gone"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ trace, label, color }) {
  const s = trace.summary;
  return (
    <div className="card" style={{ borderColor: color + "33" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{s.method} {s.path}</div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>{s.service} · {s.status}</div>
      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
        <div><span style={{ color: "var(--text-muted)" }}>Duration</span> <strong>{formatDuration(s.durationMs)}</strong></div>
        <div><span style={{ color: "var(--text-muted)" }}>Spans</span> <strong>{trace.totalSpans}</strong></div>
        <div><span style={{ color: "var(--text-muted)" }}>Events</span> <strong>{s.eventCount}</strong></div>
      </div>
    </div>
  );
}

function ComponentCompare({ a, b }) {
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (all.size === 0) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No component data</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[...all].map(comp => {
        const aMs = a[comp]?.totalMs ?? 0;
        const bMs = b[comp]?.totalMs ?? 0;
        const maxMs = Math.max(aMs, bMs, 1);
        const diff = bMs - aMs;
        return (
          <div key={comp} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 80px", gap: 10, alignItems: "center", fontSize: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: spanColor(comp), flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)" }}>{COMPONENT_LABELS[comp] ?? comp}</span>
            </span>
            <div style={{ height: 14, borderRadius: 3, background: "var(--bg-input)", position: "relative", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(aMs / maxMs) * 100}%`, background: "var(--accent)", borderRadius: 3, opacity: 0.8 }} />
              <span style={{ position: "absolute", right: 4, top: 0, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: "14px" }}>{formatDuration(aMs)}</span>
            </div>
            <div style={{ height: 14, borderRadius: 3, background: "var(--bg-input)", position: "relative", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(bMs / maxMs) * 100}%`, background: "var(--purple)", borderRadius: 3, opacity: 0.8 }} />
              <span style={{ position: "absolute", right: 4, top: 0, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-primary)", lineHeight: "14px" }}>{formatDuration(bMs)}</span>
            </div>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textAlign: "right",
              color: diff > 10 ? "var(--red)" : diff < -10 ? "var(--green)" : "var(--text-muted)",
            }}>
              {diff > 0 ? "+" : ""}{formatDuration(diff)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

