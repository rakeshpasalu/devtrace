import { useMemo, useState } from "react";
import { formatDuration, spanColor } from "../utils.js";
import { BarChart3, ChevronRight, Copy } from "lucide-react";

const COMPONENT_LABELS = {
  "http-server": "HTTP Server",
  "http-client": "Outbound HTTP",
  controller: "Controller",
  service: "Service",
  repository: "Repository",
  database: "Database",
  async: "Async",
};

export default function TimelineView({ events }) {
  const [expandedSpan, setExpandedSpan] = useState(null);

  const spans = useMemo(
    () =>
      (events ?? [])
        .filter((e) => e.type === "SPAN_FINISHED" && e.startTime != null)
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0)),
    [events]
  );

  if (spans.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Execution Waterfall</span>
        </div>
        <div className="empty-state" style={{ padding: "24px 0" }}>
          <BarChart3 size={28} />
          <p>No span timing data available for this trace.</p>
        </div>
      </div>
    );
  }

  const minTime = spans[0].startTime;
  const maxTime = spans.reduce(
    (c, s) => Math.max(c, s.endTime ?? s.startTime ?? c),
    minTime + 1
  );
  const totalMs = Math.max(1, maxTime - minTime);

  // Build depth map using parent-child relationships
  const depthMap = new Map();
  const spanMap = new Map(spans.map((s) => [s.spanId, s]));
  function getDepth(span) {
    if (depthMap.has(span.spanId)) return depthMap.get(span.spanId);
    if (!span.parentSpanId || !spanMap.has(span.parentSpanId)) {
      depthMap.set(span.spanId, 0);
      return 0;
    }
    const d = getDepth(spanMap.get(span.parentSpanId)) + 1;
    depthMap.set(span.spanId, d);
    return d;
  }
  spans.forEach((s) => getDepth(s));

  // Summary stats
  const layerBreakdown = {};
  spans.forEach((s) => {
    const c = s.component ?? "other";
    if (!layerBreakdown[c]) layerBreakdown[c] = { count: 0, totalMs: 0 };
    layerBreakdown[c].count += 1;
    layerBreakdown[c].totalMs += Number(s.durationMs ?? 0);
  });

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Execution Waterfall</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
            }}
          >
            {spans.length} spans | {formatDuration(totalMs)} total
          </span>
        </div>
      </div>

      {/* Layer breakdown bar */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            height: 6,
            borderRadius: 3,
            overflow: "hidden",
            background: "var(--bg-input)",
          }}
        >
          {Object.entries(layerBreakdown).map(([comp, data]) => (
            <div
              key={comp}
              style={{
                width: `${Math.max(2, (data.totalMs / totalMs) * 100)}%`,
                background: spanColor(comp),
                minWidth: 2,
              }}
              title={`${COMPONENT_LABELS[comp] ?? comp}: ${data.count} spans, ${formatDuration(
                data.totalMs
              )}`}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          {Object.entries(layerBreakdown).map(([comp, data]) => (
            <div
              key={comp}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: spanColor(comp),
                  flexShrink: 0,
                }}
              />
              <span style={{ color: "var(--text-secondary)" }}>
                {COMPONENT_LABELS[comp] ?? comp} ({data.count}) —{" "}
                {formatDuration(data.totalMs)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Time ruler */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          marginBottom: 4,
          paddingLeft: 160,
        }}
      >
        <span>0ms</span>
        <span>{formatDuration(totalMs / 4)}</span>
        <span>{formatDuration(totalMs / 2)}</span>
        <span>{formatDuration(totalMs * 3 / 4)}</span>
        <span>{formatDuration(totalMs)}</span>
      </div>

      {/* Waterfall rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {spans.slice(0, 80).map((s) => {
          const depth = depthMap.get(s.spanId) ?? 0;
          const leftPct = ((s.startTime - minTime) / totalMs) * 100;
          const widthPct = Math.max(
            0.5,
            ((s.endTime ?? s.startTime) - s.startTime) / totalMs * 100
          );
          const isSlow = Number(s.durationMs ?? 0) >= 150;
          const label = s.className
            ? `${s.className.split(".").pop()}.${s.methodName ?? ""}`
            : s.name;
          const isExpanded = expandedSpan === s.eventId;

          return (
            <div key={s.eventId}>
              <div
                onClick={() => setExpandedSpan(isExpanded ? null : s.eventId)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 1fr",
                  alignItems: "center",
                  padding: "3px 0",
                  fontSize: 12,
                  borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                  cursor: "pointer",
                  background: isExpanded ? "var(--accent-glow)" : "transparent",
                  borderRadius: isExpanded ? "4px 4px 0 0" : 0,
                }}
              >
                {/* Label */}
                <div
                  style={{
                    paddingLeft: depth * 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    overflow: "hidden",
                  }}
                >
                  <ChevronRight
                    size={10}
                    style={{
                      color: isExpanded ? "var(--accent)" : "var(--text-muted)",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      flexShrink: 0,
                      background: spanColor(s.component),
                    }}
                  />
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: isSlow ? "var(--red)" : "var(--text-primary)",
                      fontWeight: depth === 0 ? 600 : 400,
                      fontSize: 11,
                    }}
                    title={`${label} (${COMPONENT_LABELS[s.component] ?? s.component})`}
                  >
                    {label}
                  </span>
                </div>

                {/* Bar */}
                <div style={{ position: "relative", height: 18 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: 14,
                      top: 2,
                      borderRadius: 2,
                      minWidth: 4,
                      background: isSlow
                        ? `linear-gradient(90deg, ${spanColor(s.component)}, var(--red))`
                        : spanColor(s.component),
                      opacity: 0.85,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: `${leftPct + widthPct + 0.5}%`,
                      top: 2,
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: isSlow ? "var(--red)" : "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDuration(s.durationMs)}
                  </span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="wf-span-detail">
                  <div className="wf-detail-grid">
                    <div className="wf-detail-item">
                      <span className="wf-detail-label">Component</span>
                      <span className="wf-detail-value">
                        {COMPONENT_LABELS[s.component] ?? s.component ?? "—"}
                      </span>
                    </div>
                    <div className="wf-detail-item">
                      <span className="wf-detail-label">Duration</span>
                      <span className="wf-detail-value">
                        {formatDuration(s.durationMs)}
                      </span>
                    </div>
                    <div className="wf-detail-item">
                      <span className="wf-detail-label">Span ID</span>
                      <span className="wf-detail-value wf-mono">
                        {s.spanId ?? "—"}
                      </span>
                    </div>
                    <div className="wf-detail-item">
                      <span className="wf-detail-label">Parent ID</span>
                      <span className="wf-detail-value wf-mono">
                        {s.parentSpanId ?? "root"}
                      </span>
                    </div>
                    {s.className && (
                      <div className="wf-detail-item">
                        <span className="wf-detail-label">Class</span>
                        <span className="wf-detail-value wf-mono">
                          {s.className}
                        </span>
                      </div>
                    )}
                    {s.methodName && (
                      <div className="wf-detail-item">
                        <span className="wf-detail-label">Method</span>
                        <span className="wf-detail-value wf-mono">
                          {s.methodName}
                        </span>
                      </div>
                    )}
                    {s.attributes?.method && (
                      <div className="wf-detail-item">
                        <span className="wf-detail-label">HTTP Method</span>
                        <span className="wf-detail-value">
                          {s.attributes.method}
                        </span>
                      </div>
                    )}
                    {s.attributes?.path && (
                      <div className="wf-detail-item">
                        <span className="wf-detail-label">Path</span>
                        <span className="wf-detail-value wf-mono">
                          {s.attributes.path}
                        </span>
                      </div>
                    )}
                    {s.attributes?.statusCode && (
                      <div className="wf-detail-item">
                        <span className="wf-detail-label">Status</span>
                        <span className="wf-detail-value">
                          {s.attributes.statusCode}
                        </span>
                      </div>
                    )}
                    {s.attributes?.sql && (
                      <div className="wf-detail-item wf-full">
                        <span className="wf-detail-label">SQL</span>
                        <pre className="wf-sql">{s.attributes.sql}</pre>
                      </div>
                    )}
                  </div>
                  {Object.keys(s.attributes ?? {})
                    .filter(
                      (k) =>
                        !["method", "path", "statusCode", "sql", "routePattern"].includes(
                          k
                        )
                    )
                    .length > 0 && (
                    <details className="wf-attrs">
                      <summary>
                        All Attributes (
                        {Object.keys(s.attributes).length})
                      </summary>
                      <pre className="wf-attrs-pre">
                        {JSON.stringify(s.attributes, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
