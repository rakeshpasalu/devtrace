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

test("EventStore processes LOG events and includes them in snapshot", () => {
  const store = new EventStore();

  store.ingest([
    {
      type: "LOG",
      timestamp: 1000,
      name: "Starting application",
      service: "demo",
      traceId: "trace-abc",
      component: "logging",
      status: "INFO",
      attributes: {
        level: "INFO",
        logger: "com.example.demo.Application",
        message: "Starting application on port 8080",
        thread: "main"
      }
    },
    {
      type: "LOG",
      timestamp: 2000,
      name: "Connection error",
      service: "demo",
      component: "logging",
      status: "ERROR",
      attributes: {
        level: "ERROR",
        logger: "com.example.demo.DatabaseService",
        message: "Failed to connect to database",
        thread: "pool-1",
        exception: "java.sql.SQLException: Connection refused\n\tat com.example..."
      }
    }
  ]);

  const snapshot = store.snapshot();

  // Verify logs are in the snapshot
  assert.equal(snapshot.stats.logCount, 2);
  assert.equal(snapshot.logs.length, 2);

  // Verify first log
  assert.equal(snapshot.logs[0].level, "INFO");
  assert.equal(snapshot.logs[0].logger, "com.example.demo.Application");
  assert.equal(snapshot.logs[0].message, "Starting application on port 8080");
  assert.equal(snapshot.logs[0].thread, "main");
  assert.equal(snapshot.logs[0].traceId, "trace-abc");

  // Verify second log (error with exception)
  assert.equal(snapshot.logs[1].level, "ERROR");
  assert.equal(snapshot.logs[1].logger, "com.example.demo.DatabaseService");
  assert.ok(snapshot.logs[1].exception.includes("SQLException"));

  // Verify queryLogs works
  const errorLogs = store.queryLogs({ level: "ERROR" });
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0].level, "ERROR");

  const searchLogs = store.queryLogs({ q: "database" });
  assert.equal(searchLogs.length, 1);
});

