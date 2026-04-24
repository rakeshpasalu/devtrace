import { useEffect, useState } from "react";
import { formatTimestamp, formatDuration } from "../utils.js";
import { Play, Pause, Radio, SkipForward, SkipBack, Info } from "lucide-react";

const COMPONENT_LABELS = {
  "http-server": "HTTP Server",
  "http-client": "Outbound HTTP",
  controller: "Controller",
  service: "Service Layer",
  repository: "Repository",
  database: "Database",
  async: "Async",
};

export default function ReplayPanel({ events }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setCursor(0); setPlaying(false); }, [events]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const t = setInterval(() => {
      setCursor(c => { if (c >= events.length - 1) { setPlaying(false); return c; } return c + 1; });
    }, 400);
    return () => clearInterval(t);
  }, [events.length, playing]);

  const current = events[cursor];

  return (
    <>
      {/* Explanation card */}
      <div className="card" style={{ marginBottom: 16, background: "var(--accent-glow)", borderColor: "rgba(96,165,250,0.2)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Info size={18} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <strong style={{ color: "var(--text-primary)" }}>What is Request Replay?</strong><br/>
            Replay lets you step through a request event-by-event in the exact order they happened.
            Use it to understand <strong>what your app did when it handled a request</strong> —
            which controller was called, what services it invoked, whether it hit the database,
            and how long each step took. Think of it as a slow-motion video of your request processing.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {events.length > 0 ? `Step ${cursor + 1} of ${events.length}` : "Request Playback"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-ghost" disabled={events.length === 0 || cursor === 0}
              onClick={() => setCursor(c => Math.max(0, c - 1))} style={{ padding: "6px 10px" }}>
              <SkipBack size={14} />
            </button>
            <button className="btn btn-primary" disabled={events.length === 0}
              onClick={() => setPlaying(v => !v)} style={{ padding: "6px 14px" }}>
              {playing ? <><Pause size={14}/> Pause</> : <><Play size={14}/> Play</>}
            </button>
            <button className="btn btn-ghost" disabled={events.length === 0 || cursor >= events.length - 1}
              onClick={() => setCursor(c => Math.min(events.length - 1, c + 1))} style={{ padding: "6px 10px" }}>
              <SkipForward size={14} />
            </button>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="empty-state" style={{ padding: "32px 0" }}>
            <Radio size={28} />
            <p>Select a trace in the Trace Explorer and click <strong>Replay</strong> to step through it here.</p>
          </div>
        ) : (
          <>
            <input className="replay-range" type="range" min="0"
              max={Math.max(0, events.length - 1)} value={cursor}
              onChange={e => setCursor(Number(e.target.value))} />

            {current && (
              <div className="replay-card" style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 15 }}>{current.name}</strong>
                  {current.durationMs != null && (
                    <span className="chip">{formatDuration(current.durationMs)}</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                  <div><span style={{ color: "var(--text-muted)" }}>Type:</span> {current.type?.replace(/_/g, " ")}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Layer:</span> {COMPONENT_LABELS[current.component] ?? current.component ?? "runtime"}</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Offset:</span> +{current.relativeTimeMs ?? 0}ms from start</div>
                  <div><span style={{ color: "var(--text-muted)" }}>Time:</span> {formatTimestamp(current.timestamp)}</div>
                  {current.className && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-muted)" }}>Class:</span> {current.className}.{current.methodName ?? ""}</div>}
                  {current.attributes?.sql && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-muted)" }}>SQL:</span> <code style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{current.attributes.sql}</code></div>}
                  {current.attributes?.statusCode && <div><span style={{ color: "var(--text-muted)" }}>Status:</span> {current.attributes.statusCode}</div>}
                  {current.attributes?.url && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "var(--text-muted)" }}>URL:</span> {current.attributes.url}</div>}
                </div>
              </div>
            )}

            {/* Mini timeline of all events */}
            <div style={{ marginTop: 16, maxHeight: 200, overflowY: "auto" }}>
              {events.map((e, i) => (
                <div key={i} onClick={() => setCursor(i)} style={{
                  padding: "6px 10px", fontSize: 12, cursor: "pointer", borderRadius: 6,
                  background: i === cursor ? "var(--accent-glow)" : "transparent",
                  borderLeft: `3px solid ${i === cursor ? "var(--accent)" : "transparent"}`,
                  color: i <= cursor ? "var(--text-primary)" : "var(--text-muted)",
                  transition: "all 0.1s",
                }}>
                  <span style={{ fontFamily: "var(--font-mono)", marginRight: 8 }}>+{e.relativeTimeMs ?? 0}ms</span>
                  {e.name}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
