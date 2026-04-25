#!/usr/bin/env node
const now = Date.now();
const traceId = "trace-test-gen-001";
const events = [
  { type: "HTTP_REQUEST", timestamp: now, traceId, service: "ngsd-order-management", component: "http-server",
    attributes: { method: "POST", path: "/api/v1/orders", routePattern: "/api/v1/orders" } },
  { type: "SPAN_STARTED", timestamp: now + 1, traceId, spanId: "s1", component: "controller", className: "de.telekom.OrderController", methodName: "createOrder", service: "ngsd-order-management" },
  { type: "SPAN_FINISHED", timestamp: now + 3, traceId, spanId: "s1", component: "controller", className: "de.telekom.OrderController", methodName: "createOrder", durationMs: 45, service: "ngsd-order-management" },
  { type: "SPAN_STARTED", timestamp: now + 4, traceId, spanId: "s2", parentSpanId: "s1", component: "service", className: "de.telekom.OrderService", methodName: "validate", service: "ngsd-order-management" },
  { type: "SPAN_FINISHED", timestamp: now + 7, traceId, spanId: "s2", parentSpanId: "s1", component: "service", className: "de.telekom.OrderService", methodName: "validate", durationMs: 3, service: "ngsd-order-management" },
  { type: "SPAN_STARTED", timestamp: now + 8, traceId, spanId: "s3", parentSpanId: "s1", component: "service", className: "de.telekom.OrderService", methodName: "processOrder", service: "ngsd-order-management" },
  { type: "SQL_STATEMENT", timestamp: now + 10, traceId, spanId: "s4", parentSpanId: "s3", component: "database", name: "INSERT INTO orders", durationMs: 5, service: "ngsd-order-management",
    attributes: { sql: "INSERT INTO orders (id, customer_id, total) VALUES (?, ?, ?)" } },
  { type: "SQL_STATEMENT", timestamp: now + 16, traceId, spanId: "s5", parentSpanId: "s3", component: "database", name: "INSERT INTO order_items", durationMs: 3, service: "ngsd-order-management",
    attributes: { sql: "INSERT INTO order_items (order_id, sku, quantity) VALUES (?, ?, ?)" } },
  { type: "SPAN_FINISHED", timestamp: now + 20, traceId, spanId: "s3", parentSpanId: "s1", component: "service", className: "de.telekom.OrderService", methodName: "processOrder", durationMs: 12, service: "ngsd-order-management" },
  { type: "SPAN_STARTED", timestamp: now + 21, traceId, spanId: "s6", parentSpanId: "s1", component: "RestTemplate", className: "de.telekom.PaymentClient", methodName: "authorize", service: "ngsd-order-management" },
  { type: "SPAN_FINISHED", timestamp: now + 121, traceId, spanId: "s6", parentSpanId: "s1", component: "RestTemplate", className: "de.telekom.PaymentClient", methodName: "authorize", durationMs: 100, service: "ngsd-order-management" },
  { type: "SPAN_FINISHED", timestamp: now + 130, traceId, spanId: "s1-http", component: "http-server", durationMs: 130, service: "ngsd-order-management" },
  { type: "HTTP_RESPONSE", timestamp: now + 130, traceId, service: "ngsd-order-management", status: "201",
    attributes: { statusCode: 201 } },
];

fetch("http://127.0.0.1:9000/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(events),
}).then(r => r.json()).then(d => {
  console.log("Ingested:", d);
  return fetch(`http://127.0.0.1:9000/api/v1/requests/${traceId}/generate-test`);
}).then(r => r.json()).then(test => {
  console.log(`\nTest class: ${test.testClassName}`);
  console.log(`Framework: ${test.framework}`);
  console.log(`Summary: ${test.summary.controllerSpans} controller, ${test.summary.serviceSpans} service, ${test.summary.sqlStatements} SQL, ${test.summary.outboundCalls} HTTP out`);
  console.log(`\n${"─".repeat(60)}\n`);
  console.log(test.code);
}).catch(e => console.error(e));

