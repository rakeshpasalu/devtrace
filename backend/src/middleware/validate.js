/**
 * Validates the shape of ingest payloads.
 * Rejects clearly malformed data before it enters the EventStore.
 */

const REQUIRED_STRING = (v) => typeof v === "string" && v.length > 0 && v.length < 512;

const KNOWN_EVENT_TYPES = new Set([
  "JVM_STARTED", "AGENT_ATTACHED", "CLASS_TRANSFORMED", "CLASS_LOADING_SNAPSHOT",
  "SPRING_APPLICATION_RUN", "SPRING_LIFECYCLE", "BEAN_CREATION", "BEAN_NODE", "BEAN_EDGE",
  "AUTO_CONFIGURATION", "HTTP_REQUEST", "HTTP_RESPONSE", "SPAN_STARTED", "SPAN_FINISHED",
  "METHOD_INVOCATION", "ASYNC_SCHEDULED", "ASYNC_EXECUTION", "DATABASE_QUERY", "EXTERNAL_CALL",
  "ERROR", "SQL_STATEMENT", "ASYNC_HANDOFF", "LOG",
  // Agent / MCP event types
  "AGENT_SESSION_START", "AGENT_DECISION", "AGENT_TOOL_CALL", "AGENT_TOOL_ERROR",
  "AGENT_TOOL_RESULT", "AGENT_SPAWN", "AGENT_CONTEXT_HANDOFF", "AGENT_RETRY",
  "AGENT_FALLBACK", "AGENT_GUARDRAIL_HIT", "AGENT_SESSION_END",
  "LLM_COMPLETION", "LLM_STREAMING_CHUNK",
  "MCP_SERVER_CONNECT", "MCP_SERVER_DISCONNECT", "MCP_TOOL_DISCOVERY",
]);

export function validateIngestPayload(req, res, next) {
  const body = req.body;
  if (body === undefined || body === null) {
    return res.status(400).json({ error: "Request body is required." });
  }

  const events = Array.isArray(body) ? body : [body];

  if (events.length === 0) {
    return res.status(400).json({ error: "Payload must contain at least one event." });
  }

  if (events.length > 5_000) {
    return res.status(413).json({ error: `Batch too large: ${events.length} events (max 5000).` });
  }

  const errors = [];
  for (let i = 0; i < Math.min(events.length, 10); i++) {
    const event = events[i];
    if (!event || typeof event !== "object") {
      errors.push(`events[${i}]: must be an object`);
      continue;
    }
    if (!REQUIRED_STRING(event.type)) {
      errors.push(`events[${i}].type: missing or invalid`);
    } else if (!KNOWN_EVENT_TYPES.has(event.type)) {
      errors.push(`events[${i}].type: unknown event type "${event.type}"`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Invalid ingest payload.", details: errors });
  }

  next();
}


