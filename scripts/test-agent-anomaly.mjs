#!/usr/bin/env node
// Ingest an anomalous agent session to test anomaly detection

const now = Date.now();

const events = [
  { type: "AGENT_SESSION_START", timestamp: now, service: "data-enrichment", traceId: "agent-trace-anomaly", spanId: "sess-bad-001", name: "data-enricher",
    attributes: { sessionId: "sess-bad-001", agentId: "data-enricher-v1", agentName: "Data Enricher (Anomalous)", model: "gpt-4o", goal: "Enrich customer profiles with external data",
      agent: { agentId: "data-enricher-v1", agentName: "Data Enricher (Anomalous)", model: "gpt-4o", sessionId: "sess-bad-001", goal: "Enrich customer profiles with external data" } } },
];

// Generate 8 retries of the same tool (infinite loop + excessive retries)
for (let i = 0; i < 8; i++) {
  events.push({
    type: "AGENT_TOOL_CALL", timestamp: now + (i + 1) * 500, service: "data-enrichment", traceId: "agent-trace-anomaly", spanId: "sess-bad-001",
    name: "fetch_profile", durationMs: 400 + Math.random() * 200,
    attributes: { sessionId: "sess-bad-001",
      tool: { name: "fetch_profile", server: "profile-mcp", input: { customerId: "CUS-001" }, output: null, inputTokens: 80, outputTokens: 0, latencyMs: 400, costUsd: 0.003 },
      error: i < 6 ? "Service unavailable" : undefined,
      agent: { sessionId: "sess-bad-001" } }
  });
  if (i < 6) {
    events.push({
      type: "AGENT_TOOL_ERROR", timestamp: now + (i + 1) * 500 + 100, service: "data-enrichment", traceId: "agent-trace-anomaly", spanId: "sess-bad-001",
      name: "fetch_profile", status: "ERROR",
      attributes: { sessionId: "sess-bad-001", tool: { name: "fetch_profile" }, error: "Service unavailable - attempt " + (i + 1), agent: { sessionId: "sess-bad-001" } }
    });
    events.push({
      type: "AGENT_RETRY", timestamp: now + (i + 1) * 500 + 200, service: "data-enrichment", traceId: "agent-trace-anomaly", spanId: "sess-bad-001",
      name: "Retrying fetch_profile",
      attributes: { sessionId: "sess-bad-001", retryCount: i + 1, maxRetries: 10, toolName: "fetch_profile", agent: { sessionId: "sess-bad-001" } }
    });
  }
}

// Expensive LLM calls pushing cost high
for (let i = 0; i < 5; i++) {
  events.push({
    type: "LLM_COMPLETION", timestamp: now + 5000 + i * 1000, service: "data-enrichment", traceId: "agent-trace-anomaly", spanId: "sess-bad-001",
    name: "gpt-4o",
    attributes: { sessionId: "sess-bad-001", model: "gpt-4o", promptTokens: 8000, completionTokens: 2000, costUsd: 0.25, latencyMs: 3000, agent: { sessionId: "sess-bad-001" } }
  });
}

fetch("http://127.0.0.1:9000/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(events),
}).then(r => r.json()).then(d => {
  console.log("Ingested:", d);
  return fetch("http://127.0.0.1:9000/api/v1/agent-sessions/sess-bad-001");
}).then(r => r.json()).then(session => {
  console.log(`\nAgent: ${session.agentName}`);
  console.log(`Status: ${session.status}`);
  console.log(`Tool calls: ${session.toolCalls}`);
  console.log(`Errors: ${session.errors}`);
  console.log(`Retries: ${session.retries}`);
  console.log(`Cost: $${session.totalCostUsd}`);
  console.log(`Tokens: ${session.totalTokens}`);
  console.log(`\n🚨 Anomalies detected: ${session.anomalies?.length ?? 0}`);
  (session.anomalies ?? []).forEach(a => {
    console.log(`  [${a.severity.toUpperCase()}] ${a.type}: ${a.message}`);
  });
}).catch(e => console.error(e));

