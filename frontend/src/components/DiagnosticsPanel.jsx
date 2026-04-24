import { formatDuration, formatTimestamp, healthClassName } from "../utils.js";
import { AlertTriangle, Flame, Server, Zap, Activity } from "lucide-react";

const NOISE_EVENTS = new Set(["CLASS_LOADING_SNAPSHOT", "CLASS_TRANSFORMED"]);
const COMPONENT_LABELS = {
  "http-server": "HTTP Server",
  "http-client": "Outbound HTTP",
  controller: "Controller",
  service: "Service Layer",
  repository: "Repository / DB",
  database: "Database",
  async: "Async",
  "spring-boot": "Spring Boot",
  "spring-beans": "Spring Beans",
  runtime: "Runtime",
};

export default function DiagnosticsPanel({ diagnostics, selectedTrace, recentEvents }) {
  const hottestComponents = diagnostics?.hottestComponents ?? [];
  const slowSpans = diagnostics?.slowSpans ?? [];
  const errors = diagnostics?.errors ?? [];
  const services = diagnostics?.services ?? [];

  // Filter out noise events for the live feed
  const meaningfulEvents = (recentEvents ?? []).filter(e => !NOISE_EVENTS.has(e.type));

  return (
    <>
      {/* Health Summary */}
      <div className="card" style={{ marginBottom: 20, background: errors.length > 0 ? "var(--red-glow)" : "var(--green-glow)", borderColor: errors.length > 0 ? "rgba(248,113,113,0.2)" : "rgba(52,211,153,0.2)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
          {errors.length > 0 ? `${errors.length} error${errors.length > 1 ? "s" : ""} detected` : "System Healthy"}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {services.length} service{services.length !== 1 ? "s" : ""} tracked · {slowSpans.length} slow span{slowSpans.length !== 1 ? "s" : ""} · {hottestComponents.length} active component{hottestComponents.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Performance Hotspots</span>
          <span className="card-badge">{hottestComponents.length}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Components ranked by error count and average latency. Focus optimization here.</p>
        <div className="signal-list">
          {hottestComponents.length === 0
            ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No component metrics yet — send some traffic to your app.</p>
            : hottestComponents.map(c => (
              <div key={c.component} className="signal-row">
                <div>
                  <strong>{COMPONENT_LABELS[c.component] ?? c.component}</strong><br/>
                  <small>{c.eventCount} calls · {c.slowSpanCount} slow · {c.errorCount} errors</small>
                </div>
                <span className="chip">{formatDuration(c.averageDurationMs)} avg</span>
              </div>
            ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Services</span>
          <span className="card-badge">{services.length}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Each Spring Boot app connected to DevTrace appears here.</p>
        <div className="signal-list">
          {services.length === 0
            ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No services detected yet — start an app with the agent or starter.</p>
            : services.map(s => (
              <div key={s.service} className="signal-row">
                <div>
                  <strong>{s.service}</strong><br/>
                  <small>{s.requestCount} requests · {s.errorCount > 0 ? <span style={{ color: "var(--red)" }}>{s.errorCount} errors</span> : "0 errors"}</small>
                </div>
                <span className="chip">{s.eventCount} events</span>
              </div>
            ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Errors</span>
          <span className="card-badge">{errors.length}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Runtime exceptions and error responses from your app.</p>
        <div className="signal-list">
          {errors.length === 0
            ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No runtime errors captured — that's a good sign!</p>
            : errors.slice(-12).reverse().map(e => (
              <div key={e.eventId} className="signal-row is-error">
                <div>
                  <strong>{e.name}</strong><br/>
                  <small>{e.attributes?.exceptionType ?? e.component ?? "runtime"} · {formatTimestamp(e.timestamp)}</small>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Slow Operations</span>
          <span className="card-badge">{slowSpans.length}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Methods exceeding the slow threshold (default 150ms). These are your optimization targets.</p>
        <div className="signal-list">
          {slowSpans.length === 0
            ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No slow spans — your app is performing well.</p>
            : slowSpans.slice(-12).reverse().map(e => (
              <div key={e.eventId} className="signal-row">
                <div>
                  <strong>{e.name}</strong><br/>
                  <small>{COMPONENT_LABELS[e.component] ?? e.component} · {e.service ?? ""}</small>
                </div>
                <span className="chip" style={{ background: "rgba(251,191,36,0.12)", color: "var(--amber)" }}>{formatDuration(e.durationMs)}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Live Activity</span>
          <span className="card-badge">{meaningfulEvents.length} recent</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Real-time events from your apps (background noise like class-loading snapshots is filtered out).</p>
        <div className="signal-list">
          {meaningfulEvents.length === 0
            ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Waiting for events — send traffic to your instrumented app.</p>
            : meaningfulEvents.slice(-20).reverse().map(e => (
              <div key={e.eventId} className={`signal-row ${e.status === "ERROR" ? "is-error" : ""}`}>
                <div>
                  <strong>{e.name}</strong><br/>
                  <small>{COMPONENT_LABELS[e.component] ?? e.component ?? "runtime"} · {formatTimestamp(e.timestamp)}</small>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
