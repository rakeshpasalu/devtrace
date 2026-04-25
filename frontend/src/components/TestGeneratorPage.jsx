import { useCallback, useEffect, useState } from "react";
import {
  Code, Copy, Check, Activity, FileText, Database, ArrowRight,
  AlertTriangle, Wrench, Download
} from "lucide-react";
import { formatDuration, authFetch, apiBase } from "../utils.js";

export default function TestGeneratorPage({ requests }) {
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async (traceId) => {
    const id = traceId ?? selectedTraceId;
    if (!id) return;
    setSelectedTraceId(id);
    setLoading(true);
    try {
      const r = await authFetch(`${apiBase()}/api/v1/requests/${id}/generate-test`);
      if (r.ok) setTestResult(await r.json());
      else setTestResult(null);
    } catch { setTestResult(null); }
    setLoading(false);
  }, [selectedTraceId]);

  const copyCode = useCallback(() => {
    if (!testResult?.code) return;
    navigator.clipboard.writeText(testResult.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [testResult]);

  const downloadFile = useCallback(() => {
    if (!testResult?.code) return;
    const blob = new Blob([testResult.code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${testResult.testClassName ?? "GeneratedTest"}.java`;
    a.click();
    URL.revokeObjectURL(url);
  }, [testResult]);

  // Auto-select first trace with events
  useEffect(() => {
    if (!selectedTraceId && requests?.length > 0) {
      setSelectedTraceId(requests[0].traceId);
    }
  }, [requests, selectedTraceId]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Code size={22} /> Trace → Test Generator
        </h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Select a captured trace and generate a runnable JUnit integration test with mocked external calls and SQL assertions.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={selectedTraceId ?? ""} onChange={e => setSelectedTraceId(e.target.value)}
            className="trace-filter-select" style={{ flex: 1, maxWidth: 500 }}>
            <option value="">Select a trace…</option>
            {(requests ?? []).slice(0, 50).map(r => (
              <option key={r.traceId} value={r.traceId}>
                {r.method} {r.path} — {r.status} — {formatDuration(r.durationMs)} — {r.traceId?.slice(0, 12)}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => handleGenerate()} disabled={!selectedTraceId || loading}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {loading ? <Activity size={14} /> : <Code size={14} />}
            {loading ? "Generating…" : "Generate Test"}
          </button>
        </div>
      </div>

      {testResult && (
        <>
          {/* Summary */}
          <div className="card" style={{ marginBottom: 12, background: "var(--accent-glow)", borderColor: "rgba(96,165,250,0.2)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              {testResult.testClassName}.java
            </div>
            <div className="trace-meta">
              <Stat label="Method" value={testResult.summary?.method} />
              <Stat label="Path" value={testResult.summary?.path} />
              <Stat label="Status" value={testResult.summary?.status} />
              <Stat label="Duration" value={formatDuration(testResult.summary?.durationMs)} />
              <Stat label="Controllers" value={testResult.summary?.controllerSpans} />
              <Stat label="Services" value={testResult.summary?.serviceSpans} />
              <Stat label="SQL" value={testResult.summary?.sqlStatements} />
              <Stat label="HTTP Out" value={testResult.summary?.outboundCalls} />
              {testResult.summary?.errors > 0 && <Stat label="Errors" value={testResult.summary.errors} color="var(--red)" />}
            </div>
          </div>

          {/* Code */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <FileText size={14} /> Generated JUnit Test
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-primary" onClick={copyCode} style={{ fontSize: 11, padding: "4px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button className="btn btn-primary" onClick={downloadFile} style={{ fontSize: 11, padding: "4px 12px", display: "flex", alignItems: "center", gap: 4 }}>
                  <Download size={12} /> Download .java
                </button>
              </div>
            </div>
            <pre style={{
              background: "rgba(0,0,0,0.3)", padding: 16, borderRadius: 8, overflowX: "auto",
              fontSize: 12, lineHeight: 1.6, color: "var(--text-primary)", fontFamily: "var(--font-mono)",
              maxHeight: 600, overflow: "auto", border: "1px solid var(--border)",
            }}>
              {testResult.code}
            </pre>
          </div>
        </>
      )}

      {!testResult && !loading && (
        <div className="empty-state" style={{ minHeight: 300 }}>
          <Code size={40} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Select a trace to generate a test</h3>
          <p style={{ fontSize: 13 }}>
            Choose any captured request trace above and click "Generate Test".<br />
            DevTrace will create a JUnit 5 + Spring Boot Test with mocked outbound calls<br />
            and SQL assertions — based on the actual production execution.
          </p>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="trace-datum">
      <div className="trace-datum-label">{label}</div>
      <div className="trace-datum-value" style={color ? { color } : {}}>{value}</div>
    </div>
  );
}

