import { formatTimestamp } from "../utils.js";
import { Rocket } from "lucide-react";

export default function StartupPanel({ startup, stats }) {
  const lifecycle = startup?.lifecycle ?? [];
  const autoConfiguration = startup?.autoConfiguration ?? {};
  const classLoading = startup?.classLoading;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Boot Sequence</span>
        <span className="card-badge">{lifecycle.length} events</span>
      </div>

      <div className="metrics-row" style={{ marginBottom: 20 }}>
        <div className="trace-datum">
          <div className="trace-datum-label">Auto-config sources</div>
          <div className="trace-datum-value">{autoConfiguration.totalSources ?? 0}</div>
        </div>
        <div className="trace-datum">
          <div className="trace-datum-label">Matched</div>
          <div className="trace-datum-value ok">{autoConfiguration.matchedSources ?? 0}</div>
        </div>
        <div className="trace-datum">
          <div className="trace-datum-label">Beans</div>
          <div className="trace-datum-value">{stats?.beanNodes ?? 0}</div>
        </div>
      </div>

      {lifecycle.length === 0 ? (
        <div className="empty-state" style={{ padding: "24px 0" }}>
          <Rocket size={28} />
          <p>Boot lifecycle events will appear once an instrumented app starts</p>
        </div>
      ) : (
        <ul className="startup-list">
          {lifecycle.map((e) => (
            <li key={e.eventId}>
              <strong>{e.name}</strong>
              <small>{formatTimestamp(e.timestamp)} · {e.attributes?.synthetic ? "synthetic bootstrap" : e.attributes?.sourceType}</small>
            </li>
          ))}
        </ul>
      )}

      <div className="trace-datum" style={{ marginTop: 16 }}>
        <div className="trace-datum-label">Class loading snapshot</div>
        <div className="trace-datum-value">{classLoading?.attributes?.loadedClassCount ?? 0} loaded classes</div>
        <small style={{ color: "var(--text-muted)", fontSize: 11 }}>{classLoading ? formatTimestamp(classLoading.timestamp) : "Awaiting JVM samples"}</small>
      </div>
    </div>
  );
}
