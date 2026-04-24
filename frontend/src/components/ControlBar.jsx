import { formatDuration } from "../utils.js";

export default function ControlBar({ connectionState, stats, requests, selectedTraceId, onSelectTrace, onReplay }) {
  const selectedRequest = requests.find((request) => request.traceId === selectedTraceId);

  return (
    <div className="control-card">
      <div className={`live-pill ${connectionState}`}>
        <span />
        {connectionState}
      </div>
      <div className="metric-row">
        <Metric label="Events" value={stats?.retainedEvents ?? 0} />
        <Metric label="Requests" value={requests.length} />
        <Metric label="Beans" value={stats?.beanNodes ?? 0} />
      </div>
      <label className="select-label">
        Request trace
        <select value={selectedTraceId} onChange={(event) => onSelectTrace(event.target.value)}>
          {requests.length === 0 && <option value="">Waiting for requests</option>}
          {requests.map((request) => (
            <option key={request.traceId} value={request.traceId}>
              {request.method} {request.path} · {request.status}
            </option>
          ))}
        </select>
      </label>
      <div className="selected-summary">
        <span>{selectedRequest?.traceId?.slice(0, 12) ?? "no trace selected"}</span>
        <strong>{selectedRequest ? formatDuration(selectedRequest.durationMs) : "n/a"}</strong>
      </div>
      <button className="replay-button" type="button" onClick={onReplay} disabled={!selectedTraceId}>
        Replay request
      </button>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

