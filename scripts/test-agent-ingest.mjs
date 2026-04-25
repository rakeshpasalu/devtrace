#!/usr/bin/env node
// Ingest a realistic agent session for testing the Agent Trace Page

const now = Date.now();

const events = [
  { type: "AGENT_SESSION_START", timestamp: now, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "order-processor",
    attributes: { sessionId: "sess-001", agentId: "order-processor-v2", agentName: "Order Processor", model: "claude-sonnet-4-20250514", goal: "Process customer order #2025-8832",
      agent: { agentId: "order-processor-v2", agentName: "Order Processor", model: "claude-sonnet-4-20250514", sessionId: "sess-001", goal: "Process customer order #2025-8832" } } },

  { type: "AGENT_DECISION", timestamp: now + 200, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "Need order details first",
    attributes: { sessionId: "sess-001", reasoning: "Customer asked about order status. Need to fetch order details before responding.",
      decision: { reasoning: "Customer asked about order status. Need to fetch order details before responding.", alternativesConsidered: ["search_orders", "get_customer_history"], confidenceScore: 0.94 },
      agent: { sessionId: "sess-001" } } },

  { type: "LLM_COMPLETION", timestamp: now + 300, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "claude-sonnet-4-20250514",
    attributes: { sessionId: "sess-001", model: "claude-sonnet-4-20250514", promptTokens: 890, completionTokens: 124, costUsd: 0.0034, latencyMs: 280, agent: { sessionId: "sess-001" } } },

  { type: "AGENT_TOOL_CALL", timestamp: now + 500, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "get_order_details", durationMs: 340,
    attributes: { sessionId: "sess-001", tool: { name: "get_order_details", server: "ngsd-mcp-server", input: { orderId: "2025-8832" }, output: { status: "pending", items: 3, total: 847.50 }, inputTokens: 124, outputTokens: 89, latencyMs: 340, costUsd: 0.0012 },
      agent: { sessionId: "sess-001" } } },

  { type: "AGENT_DECISION", timestamp: now + 900, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "Check inventory for all 3 items",
    attributes: { sessionId: "sess-001", reasoning: "Order has 3 items. Need to check inventory for each before processing.",
      decision: { reasoning: "Order has 3 items. Need to check inventory for each before processing." }, agent: { sessionId: "sess-001" } } },

  { type: "AGENT_TOOL_CALL", timestamp: now + 1000, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "check_inventory", durationMs: 120,
    attributes: { sessionId: "sess-001", tool: { name: "check_inventory", server: "ngsd-mcp-server", input: { sku: "SKU-1234" }, output: { available: true, quantity: 47 }, inputTokens: 45, outputTokens: 32, latencyMs: 120, costUsd: 0.0004 },
      agent: { sessionId: "sess-001" } } },

  { type: "AGENT_TOOL_CALL", timestamp: now + 1200, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "check_inventory", durationMs: 95,
    attributes: { sessionId: "sess-001", tool: { name: "check_inventory", server: "ngsd-mcp-server", input: { sku: "SKU-5678" }, output: { available: true, quantity: 12 }, inputTokens: 45, outputTokens: 32, latencyMs: 95, costUsd: 0.0004 },
      agent: { sessionId: "sess-001" } } },

  { type: "AGENT_TOOL_ERROR", timestamp: now + 3500, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "check_inventory", durationMs: 2340, status: "ERROR",
    attributes: { sessionId: "sess-001", tool: { name: "check_inventory", input: { sku: "SKU-9999" }, latencyMs: 2340 }, error: "Connection timeout after 2340ms", agent: { sessionId: "sess-001" } } },

  { type: "AGENT_RETRY", timestamp: now + 3600, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "Retrying check_inventory",
    attributes: { sessionId: "sess-001", retryCount: 1, maxRetries: 3, toolName: "check_inventory", agent: { sessionId: "sess-001" } } },

  { type: "AGENT_TOOL_CALL", timestamp: now + 3800, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "check_inventory", durationMs: 180,
    attributes: { sessionId: "sess-001", tool: { name: "check_inventory", server: "ngsd-mcp-server", input: { sku: "SKU-9999" }, output: { available: false, quantity: 0 }, inputTokens: 45, outputTokens: 28, latencyMs: 180, costUsd: 0.0003 },
      agent: { sessionId: "sess-001" } } },

  { type: "AGENT_DECISION", timestamp: now + 4000, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "Item unavailable - spawn fulfillment agent",
    attributes: { sessionId: "sess-001", reasoning: "SKU-9999 is out of stock. Need to find an alternative. Delegating to fulfillment agent.",
      decision: { reasoning: "SKU-9999 is out of stock. Need to find an alternative. Delegating to fulfillment agent." }, agent: { sessionId: "sess-001" } } },

  { type: "AGENT_SPAWN", timestamp: now + 4100, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "Spawning fulfillment-agent",
    attributes: { sessionId: "sess-001", childSessionId: "sub-sess-001", childAgentName: "Fulfillment Agent", goal: "Find alternative for SKU-9999", agent: { sessionId: "sess-001" } } },

  { type: "AGENT_SESSION_START", timestamp: now + 4200, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sub-sess-001", name: "fulfillment-agent",
    attributes: { sessionId: "sub-sess-001", agentId: "fulfillment-agent-v1", agentName: "Fulfillment Agent", model: "claude-haiku-20250514", goal: "Find alternative for SKU-9999",
      agent: { agentId: "fulfillment-agent-v1", agentName: "Fulfillment Agent", model: "claude-haiku-20250514", sessionId: "sub-sess-001", parentAgentId: "sess-001", goal: "Find alternative for SKU-9999" } } },

  { type: "AGENT_TOOL_CALL", timestamp: now + 5000, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sub-sess-001", name: "search_alternatives", durationMs: 890,
    attributes: { sessionId: "sub-sess-001", tool: { name: "search_alternatives", server: "ngsd-mcp-server", input: { sku: "SKU-9999", category: "electronics" },
      output: [{ sku: "SKU-9999-B", name: "Alternative Widget B", price: 12.99 }], inputTokens: 67, outputTokens: 89, latencyMs: 890, costUsd: 0.0008 },
      agent: { sessionId: "sub-sess-001", agentName: "Fulfillment Agent", parentAgentId: "sess-001" } } },

  { type: "AGENT_SESSION_END", timestamp: now + 5500, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sub-sess-001", name: "Sub-agent complete",
    attributes: { sessionId: "sub-sess-001", outcome: "success", agent: { sessionId: "sub-sess-001" } } },

  { type: "AGENT_TOOL_CALL", timestamp: now + 8000, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "update_order", durationMs: 450,
    attributes: { sessionId: "sess-001", tool: { name: "update_order", server: "ngsd-mcp-server",
      input: { orderId: "2025-8832", substitutions: [{ original: "SKU-9999", replacement: "SKU-9999-B", price: 12.99 }] },
      output: { updated: true, newTotal: 835.49 }, inputTokens: 156, outputTokens: 45, latencyMs: 450, costUsd: 0.0010 },
      agent: { sessionId: "sess-001" },
      budget: { tokensUsed: 2847, tokenBudget: 50000, costAccumulatedUsd: 0.047, costBudgetUsd: 1.00 } } },

  { type: "LLM_COMPLETION", timestamp: now + 8500, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "claude-sonnet-4-20250514",
    attributes: { sessionId: "sess-001", model: "claude-sonnet-4-20250514", promptTokens: 2100, completionTokens: 340, costUsd: 0.0089, latencyMs: 420, agent: { sessionId: "sess-001" } } },

  { type: "AGENT_SESSION_END", timestamp: now + 9000, service: "ngsd-order-management", traceId: "agent-trace-001", spanId: "sess-001", name: "Session Complete",
    attributes: { sessionId: "sess-001", outcome: "success", totalToolCalls: 6, totalTokens: 4847, totalCostUsd: 0.047, agent: { sessionId: "sess-001" } } },
];

fetch("http://127.0.0.1:9000/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(events),
}).then(r => r.json()).then(d => {
  console.log("Ingested:", d);
  return fetch("http://127.0.0.1:9000/api/v1/agent-sessions");
}).then(r => r.json()).then(sessions => {
  console.log(`Agent sessions: ${sessions.length}`);
  sessions.forEach(s => {
    console.log(`  ${s.agentName} (${s.sessionId}): ${s.status} | ${s.toolCalls} tools | ${s.totalTokens} tokens | $${s.totalCostUsd}`);
  });
}).catch(e => console.error(e));

