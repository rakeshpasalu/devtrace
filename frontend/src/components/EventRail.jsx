import { formatDuration, formatTimestamp } from "../utils.js";

export default function EventRail({ events, errors, slowSpans }) {
  const recent = events.slice(-80).reverse();
  const mergedErrors = [...(errors ?? []), ...events.filter((event) => event.type === "ERROR")].slice(-20).reverse();
  const mergedSlowSpans = [...(slowSpans ?? []), ...events.filter((event) => Number(event.durationMs) >= 150)].slice(-20).reverse();

  return (
    <article className="panel event-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Live stream</p>
          <h2>Signals</h2>
        </div>
        <span className="panel-badge">{recent.length} events</span>
      </div>
      <div className="rail-grid">
        <section>
          <h3>Recent Events</h3>
          <div className="event-list">
            {recent.map((event) => (
              <EventRow key={event.eventId} event={event} />
            ))}
          </div>
        </section>
        <section>
          <h3>Errors</h3>
          <div className="event-list compact">
            {mergedErrors.length === 0 ? <p className="muted">No errors captured.</p> : mergedErrors.map((event) => <EventRow key={event.eventId} event={event} />)}
          </div>
          <h3>Slow Spans</h3>
          <div className="event-list compact">
            {mergedSlowSpans.length === 0 ? <p className="muted">No slow spans above 150ms.</p> : mergedSlowSpans.map((event) => <EventRow key={event.eventId} event={event} />)}
          </div>
        </section>
      </div>
    </article>
  );
}

function EventRow({ event }) {
  return (
    <div className={`event-row ${event.status === "ERROR" || event.type === "ERROR" ? "error" : ""}`}>
      <span>{formatTimestamp(event.timestamp)}</span>
      <strong>{event.name}</strong>
      <small>{event.type} · {event.component ?? "runtime"}{event.durationMs ? ` · ${formatDuration(event.durationMs)}` : ""}</small>
    </div>
  );
}

