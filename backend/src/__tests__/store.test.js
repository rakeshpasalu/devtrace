import test from "node:test";
import assert from "node:assert/strict";
import { EventStore } from "../store.js";

test("EventStore groups request events and exposes startup diagnostics", () => {
  const store = new EventStore();

  store.ingest([
    {
      type: "SPRING_LIFECYCLE",
      timestamp: 1,
      name: "ApplicationStartedEvent",
      service: "demo",
      attributes: { eventType: "ApplicationStartedEvent" }
    },
    {
      type: "HTTP_REQUEST",
      timestamp: 2,
      traceId: "trace-1",
      requestId: "request-1",
      service: "demo",
      component: "http-server",
      name: "GET /orders/1",
      attributes: { method: "GET", path: "/orders/1" }
    },
    {
      type: "SPAN_FINISHED",
      timestamp: 12,
      traceId: "trace-1",
      requestId: "request-1",
      service: "demo",
      component: "http-server",
      name: "GET /orders/1",
      durationMs: 180,
      startTime: 2,
      endTime: 12,
      attributes: { statusCode: 200 }
    },
    {
      type: "HTTP_RESPONSE",
      timestamp: 12,
      traceId: "trace-1",
      requestId: "request-1",
      service: "demo",
      component: "http-server",
      name: "GET /orders/1",
      attributes: { statusCode: 200 }
    }
  ]);

  const snapshot = store.snapshot();
  assert.equal(snapshot.stats.retainedRequests, 1);
  assert.equal(snapshot.startup.lifecycle.length, 1);
  assert.equal(snapshot.requests[0].traceId, "trace-1");
  assert.equal(snapshot.diagnostics.slowSpans.length, 1);
});
