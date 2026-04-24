import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, ZoomIn, ZoomOut, RotateCcw, Search, Copy, Check, ChevronRight } from "lucide-react";
import { formatDuration, spanColor, buildSpanTree, authFetch, apiBase } from "../utils.js";

/* ─── Flatten span tree into flame rows ─── */
function buildFlameRows(events) {
  const spans = (events ?? []).filter(e => e.type === "SPAN_FINISHED" && e.durationMs > 0);
  if (spans.length === 0) return { rows: [], minTime: 0, maxTime: 0, totalDepth: 0 };

  const roots = buildSpanTree(events);
  const rows = [];
  let minTime = Infinity;
  let maxTime = -Infinity;
  let totalDepth = 0;

  function walk(node, depth) {
    const start = Number(node.startTime ?? node.timestamp ?? 0);
    const dur = Number(node.durationMs ?? 0);
    const end = start + dur;
    if (start < minTime) minTime = start;
    if (end > maxTime) maxTime = end;
    if (depth > totalDepth) totalDepth = depth;

    const label = node.className
      ? `${node.className.split(".").pop()}.${node.methodName ?? ""}`
      : node.name ?? "unknown";

    rows.push({
      id: node.spanId ?? `${depth}-${rows.length}`,
      label,
      fullLabel: node.className ? `${node.className}.${node.methodName ?? ""}` : node.name,
      component: node.component ?? "runtime",
      depth,
      start,
      duration: dur,
      end,
      spanId: node.spanId,
      traceId: node.traceId,
      attributes: node.attributes,
      childCount: (node.children ?? []).length,
    });

    for (const child of (node.children ?? []).sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))) {
      walk(child, depth + 1);
    }
  }

  for (const root of roots) walk(root, 0);

  // Fallback if tree building didn't work (no parent links)
  if (rows.length === 0) {
    const sorted = [...spans].sort((a, b) => (a.startTime ?? a.timestamp ?? 0) - (b.startTime ?? b.timestamp ?? 0));
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const start = Number(s.startTime ?? s.timestamp ?? 0);
      const dur = Number(s.durationMs ?? 0);
      if (start < minTime) minTime = start;
      if (start + dur > maxTime) maxTime = start + dur;
      const label = s.className ? `${s.className.split(".").pop()}.${s.methodName ?? ""}` : s.name ?? "unknown";
      rows.push({
        id: s.spanId ?? `flat-${i}`,
        label,
        fullLabel: s.className ? `${s.className}.${s.methodName ?? ""}` : s.name,
        component: s.component ?? "runtime",
        depth: i,
        start,
        duration: dur,
        end: start + dur,
        spanId: s.spanId,
        traceId: s.traceId,
        attributes: s.attributes,
        childCount: 0,
      });
      if (i > totalDepth) totalDepth = i;
    }
  }

  return { rows, minTime, maxTime, totalDepth };
}

/* ─── Flame Bar Component ─── */
function FlameBar({ row, minTime, range, canvasWidth, rowHeight, onHover, onClick, isHighlighted, filter }) {
  const x = ((row.start - minTime) / range) * canvasWidth;
  const w = Math.max(2, (row.duration / range) * canvasWidth);
  const y = row.depth * rowHeight;
  const color = spanColor(row.component);
  const dimmed = filter && !row.label.toLowerCase().includes(filter.toLowerCase()) && !row.component.toLowerCase().includes(filter.toLowerCase());

  return (
    <g
      onMouseEnter={(e) => onHover(row, e)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(row)}
      style={{ cursor: "pointer" }}
    >
      <rect
        x={x} y={y} width={w} height={rowHeight - 2}
        rx={3} ry={3}
        fill={color}
        opacity={dimmed ? 0.15 : isHighlighted ? 1 : 0.85}
        stroke={isHighlighted ? "#fff" : "rgba(0,0,0,0.3)"}
        strokeWidth={isHighlighted ? 2 : 0.5}
      />
      {w > 40 && (
        <text
          x={x + 4} y={y + rowHeight / 2 + 1}
          fontSize={10} fontWeight={600} fontFamily="var(--font-mono)"
          fill={dimmed ? "transparent" : "rgba(0,0,0,0.8)"}
          dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          {row.label.length > Math.floor(w / 6) ? row.label.slice(0, Math.floor(w / 6)) + "…" : row.label}
        </text>
      )}
      {w > 80 && (
        <text
          x={x + w - 4} y={y + rowHeight / 2 + 1}
          fontSize={9} fontFamily="var(--font-mono)"
          fill={dimmed ? "transparent" : "rgba(0,0,0,0.6)"}
          textAnchor="end" dominantBaseline="middle"
          style={{ pointerEvents: "none" }}
        >
          {formatDuration(row.duration)}
        </text>
      )}
    </g>
  );
}

/* ─── Tooltip ─── */
function FlameTooltip({ row, x, y }) {
  if (!row) return null;
  return (
    <div className="flame-tooltip" style={{ left: x + 12, top: y - 10 }}>
      <div className="flame-tooltip-title">{row.fullLabel ?? row.label}</div>
      <div className="flame-tooltip-meta">
        <span className="flame-tooltip-chip" style={{ background: spanColor(row.component) + "30", color: spanColor(row.component) }}>{row.component}</span>
        <span>{formatDuration(row.duration)}</span>
        {row.childCount > 0 && <span>{row.childCount} children</span>}
      </div>
      {row.attributes?.sql && (
        <div className="flame-tooltip-sql">{row.attributes.sql.slice(0, 120)}</div>
      )}
    </div>
  );
}

/* ─── Detail Panel ─── */
function SpanDetail({ row, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!row) return null;

  function copyJSON() {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flame-detail">
      <div className="flame-detail-header">
        <div>
          <div className="flame-detail-title">{row.fullLabel ?? row.label}</div>
          <div className="flame-detail-sub">
            <span className="chip" style={{ background: spanColor(row.component) + "20", color: spanColor(row.component) }}>{row.component}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatDuration(row.duration)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="copy-btn" onClick={copyJSON}>
            {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> JSON</>}
          </button>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: 11, padding: "4px 8px" }}>✕</button>
        </div>
      </div>
      <div className="flame-detail-grid">
        <DetailRow label="Span ID" value={row.spanId ?? "n/a"} mono />
        <DetailRow label="Trace ID" value={row.traceId ?? "n/a"} mono />
        <DetailRow label="Component" value={row.component} />
        <DetailRow label="Duration" value={formatDuration(row.duration)} />
        <DetailRow label="Start Offset" value={`${row.start}ms`} mono />
        <DetailRow label="Children" value={row.childCount} />
        <DetailRow label="Depth" value={row.depth} />
      </div>
      {row.attributes && Object.keys(row.attributes).length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Attributes</div>
          <div className="flame-detail-attrs">
            {Object.entries(row.attributes).map(([k, v]) => (
              <div key={k} className="flame-detail-attr">
                <span className="flame-detail-attr-key">{k}</span>
                <span className="flame-detail-attr-val">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="flame-detail-row">
      <span className="flame-detail-row-label">{label}</span>
      <span className={`flame-detail-row-value ${mono ? "mono" : ""}`}>{value}</span>
    </div>
  );
}

/* ─── Main Flame Graph Page ─── */
export default function FlameGraphPage({ requests }) {
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [traceData, setTraceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selectedSpan, setSelectedSpan] = useState(null);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);

  // Load trace detail
  useEffect(() => {
    if (!selectedTraceId) { setTraceData(null); return; }
    let c = false;
    setLoading(true);
    authFetch(`${apiBase()}/api/requests/${selectedTraceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!c) { setTraceData(d); setLoading(false); } })
      .catch(() => { if (!c) { setTraceData(null); setLoading(false); } });
    return () => { c = true; };
  }, [selectedTraceId]);

  const flame = useMemo(() => {
    if (!traceData?.events) return { rows: [], minTime: 0, maxTime: 0, totalDepth: 0 };
    return buildFlameRows(traceData.events);
  }, [traceData]);

  const rowHeight = 24;
  const canvasWidth = 1200 * zoom;
  const canvasHeight = (flame.totalDepth + 2) * rowHeight;
  const range = Math.max(1, flame.maxTime - flame.minTime);

  // Component-level stats
  const componentStats = useMemo(() => {
    const map = {};
    for (const r of flame.rows) {
      if (!map[r.component]) map[r.component] = { component: r.component, count: 0, totalMs: 0 };
      map[r.component].count += 1;
      map[r.component].totalMs += r.duration;
    }
    return Object.values(map).sort((a, b) => b.totalMs - a.totalMs);
  }, [flame.rows]);

  function handleHover(row, e) {
    if (row && e) {
      const rect = containerRef.current?.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
    }
    setHoveredRow(row);
  }

  // Auto-select first trace
  useEffect(() => {
    if (!selectedTraceId && requests?.length > 0) setSelectedTraceId(requests[0].traceId);
  }, [requests]);

  const recent = useMemo(() => [...(requests ?? [])].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 30), [requests]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Flame size={22} /> Flame Graph
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Search size={14} style={{ color: "var(--text-muted)" }} />
            <input value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter spans…"
              style={{ width: 180, padding: "5px 10px", fontSize: 12, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }} />
          </div>
          <button className="btn btn-ghost" onClick={() => setZoom(z => Math.min(5, z * 1.5))} title="Zoom In"><ZoomIn size={14} /></button>
          <button className="btn btn-ghost" onClick={() => setZoom(z => Math.max(0.5, z / 1.5))} title="Zoom Out"><ZoomOut size={14} /></button>
          <button className="btn btn-ghost" onClick={() => { setZoom(1); setFilter(""); setSelectedSpan(null); }} title="Reset"><RotateCcw size={14} /></button>
        </div>
      </div>

      <div className="flame-layout">
        {/* Trace selector sidebar */}
        <div className="flame-trace-list">
          <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>
            Recent Traces
          </div>
          {recent.map(r => (
            <button key={r.traceId}
              className={`flame-trace-item ${selectedTraceId === r.traceId ? "active" : ""}`}
              onClick={() => { setSelectedTraceId(r.traceId); setSelectedSpan(null); setFilter(""); setZoom(1); }}>
              <div className="flame-trace-item-top">
                <span style={{ color: r.method === "GET" ? "var(--green)" : r.method === "POST" ? "var(--accent)" : r.method === "DELETE" ? "var(--red)" : "var(--amber)", fontWeight: 700, fontSize: 10, fontFamily: "var(--font-mono)" }}>{r.method}</span>
                <span className="flame-trace-item-path" title={r.path}>{r.path}</span>
              </div>
              <div className="flame-trace-item-bottom">
                <span style={{ color: r.status === "ERROR" ? "var(--red)" : "var(--text-muted)", fontSize: 10 }}>{r.status}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{formatDuration(r.durationMs)}</span>
              </div>
            </button>
          ))}
          {recent.length === 0 && (
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-muted)" }}>No traces yet</div>
          )}
        </div>

        {/* Flame canvas */}
        <div className="flame-main" ref={containerRef}>
          {loading && (
            <div className="flame-loading">
              <div className="flame-loading-spinner" />
              Loading trace data…
            </div>
          )}
          {!loading && flame.rows.length === 0 && (
            <div className="empty-state" style={{ padding: "64px 24px" }}>
              <Flame size={40} />
              <h3 style={{ margin: "12px 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Flame Graph</h3>
              <p>Select a trace from the left panel to visualize its execution as an interactive flame graph.<br />
                <small style={{ color: "var(--text-muted)" }}>Each bar represents a span. Width = duration. Depth = call stack.</small></p>
            </div>
          )}
          {!loading && flame.rows.length > 0 && (
            <>
              {/* Component legend */}
              <div className="flame-legend">
                {componentStats.map(c => (
                  <span key={c.component} className="flame-legend-item" onClick={() => setFilter(f => f === c.component ? "" : c.component)} style={{ opacity: filter && filter !== c.component ? 0.4 : 1, cursor: "pointer" }}>
                    <span className="flame-legend-dot" style={{ background: spanColor(c.component) }} />
                    {c.component}
                    <span className="flame-legend-count">{c.count} · {formatDuration(c.totalMs)}</span>
                  </span>
                ))}
              </div>

              {/* SVG */}
              <div className="flame-scroll">
                <svg width={canvasWidth} height={canvasHeight + 20} style={{ display: "block" }}>
                  {/* Time axis */}
                  {Array.from({ length: 11 }, (_, i) => {
                    const x = (i / 10) * canvasWidth;
                    const t = (i / 10) * range;
                    return (
                      <g key={i}>
                        <line x1={x} y1={0} x2={x} y2={canvasHeight} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
                        <text x={x + 4} y={canvasHeight + 14} fontSize={9} fill="rgba(148,163,184,0.5)" fontFamily="var(--font-mono)">
                          {formatDuration(t)}
                        </text>
                      </g>
                    );
                  })}
                  {/* Flame bars */}
                  {flame.rows.map(row => (
                    <FlameBar
                      key={row.id} row={row}
                      minTime={flame.minTime} range={range}
                      canvasWidth={canvasWidth} rowHeight={rowHeight}
                      onHover={handleHover}
                      onClick={setSelectedSpan}
                      isHighlighted={selectedSpan?.id === row.id || hoveredRow?.id === row.id}
                      filter={filter}
                    />
                  ))}
                </svg>
              </div>

              {/* Tooltip */}
              <FlameTooltip row={hoveredRow} x={tooltipPos.x} y={tooltipPos.y} />
            </>
          )}

          {/* Span detail panel */}
          {selectedSpan && (
            <SpanDetail row={selectedSpan} onClose={() => setSelectedSpan(null)} />
          )}
        </div>
      </div>
    </>
  );
}

