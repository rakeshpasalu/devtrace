import { useMemo } from "react";
import { buildSpanTree, formatDuration, spanColor } from "../utils.js";
import { GitBranch, ArrowRight, Database, Globe } from "lucide-react";

const COMPONENT_LABELS = {
  "http-server": "HTTP Server",
  "http-client": "Outbound HTTP",
  controller: "Controller",
  service: "Service",
  repository: "Repository",
  database: "Database",
  async: "Async",
};

export default function RequestFlow({ events }) {
  const roots = useMemo(() => buildSpanTree(events), [events]);
  const sqlEvents = useMemo(() => (events ?? []).filter(e => e.type === "SQL_STATEMENT"), [events]);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Call Hierarchy</span>
        <span className="card-badge">{roots.length} root{roots.length !== 1 ? "s" : ""}</span>
      </div>
      {roots.length === 0 ? (
        <div className="empty-state" style={{ padding: "24px 0" }}>
          <GitBranch size={28} />
          <p>No call hierarchy data for this trace.<br/>
          <small style={{ color: "var(--text-muted)" }}>This typically means the request is still in progress or only the HTTP layer was captured.</small></p>
        </div>
      ) : (
        <div className="flow-tree">
          {roots.map(s => <FlowNode key={s.spanId} span={s} depth={0} sqlEvents={sqlEvents} />)}
        </div>
      )}
    </div>
  );
}

function FlowNode({ span, depth, sqlEvents }) {
  const isSlow = Number(span.durationMs ?? 0) >= 150;
  const isOutbound = span.component === "http-client";
  const isDb = span.component === "repository" || span.component === "database";
  const className = span.className?.split(".").pop() ?? "";
  const methodName = span.methodName ?? "";
  const displayName = className && methodName ? `${className}.${methodName}()` : span.name;

  // Find SQL statements that occurred within this span's time window
  const relatedSql = isDb ? sqlEvents.filter(sq =>
    sq.timestamp >= (span.startTime ?? 0) && sq.timestamp <= (span.endTime ?? Infinity)
  ) : [];

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flow-node-row" style={{
        borderLeft: `3px solid ${spanColor(span.component)}`,
        marginBottom: 2,
        padding: "8px 12px",
        background: isSlow ? "var(--red-glow)" : "transparent",
      }}>
        <span className="component-dot" style={{ background: spanColor(span.component) }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontWeight: 600, fontSize: 13,
              color: isSlow ? "var(--red)" : "var(--text-primary)",
            }}>{displayName}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {COMPONENT_LABELS[span.component] ?? span.component}
            {span.className && <span> — {span.className}</span>}
          </div>
          {/* Outbound HTTP details */}
          {isOutbound && span.attributes?.url && (
            <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
              <Globe size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {span.attributes.method ?? "GET"} {span.attributes.url}
              {span.attributes.statusCode && <span> — {span.attributes.statusCode}</span>}
            </div>
          )}
          {/* SQL details */}
          {relatedSql.length > 0 && relatedSql.slice(0, 3).map((sq, i) => (
            <div key={i} style={{
              fontSize: 11, color: "var(--purple)", marginTop: 4, fontFamily: "var(--font-mono)",
              padding: "4px 8px", background: "rgba(167,139,250,0.06)", borderRadius: 4,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              <Database size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {sq.attributes?.sql ?? sq.name}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
            color: isSlow ? "var(--red)" : "var(--text-secondary)",
          }}>{formatDuration(span.durationMs)}</span>
          {span.attributes?.statusCode && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>HTTP {span.attributes.statusCode}</span>
          )}
        </div>
      </div>
      {span.children.map(c => <FlowNode key={c.spanId} span={c} depth={depth + 1} sqlEvents={sqlEvents} />)}
    </div>
  );
}
