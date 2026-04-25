import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import pino from "pino";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from "ws";

import { config } from "./config.js";
import { EventStore } from "./store.js";
import { apiKeyAuth, wsAuthCheck } from "./middleware/auth.js";
import { validateIngestPayload } from "./middleware/validate.js";

// ─── Logger ──────────────────────────────────────────────────────────────
const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv !== "production" && {
    transport: { target: "pino/file", options: { destination: 1 } },
  }),
});

// ─── Store ───────────────────────────────────────────────────────────────
const store = new EventStore(config.maxEvents);

// ─── Express App ─────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS – respect DEVTRACE_CORS_ORIGINS
app.use(cors({
  origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// Structured request logging
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/v1/health" } }));

// API key auth (no-op when DEVTRACE_API_KEY is unset)
app.use(apiKeyAuth);

// ─── Rate limiters ──────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowSeconds * 1000,
  max: config.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down." },
});

const ingestLimiter = rateLimit({
  windowMs: config.rateLimitWindowSeconds * 1000,
  max: config.ingestRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Ingest rate limit exceeded." },
});

app.use("/api/", apiLimiter);

// ─── API v1 routes ──────────────────────────────────────────────────────
const v1 = express.Router();

v1.get("/health", (_req, res) => {
  res.json({
    status: "UP",
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage().rss,
    eventCount: store.snapshot().stats.totalEvents,
    version: "1.0.0",
  });
});

v1.get("/snapshot", (_req, res) => res.json(store.snapshot()));
v1.get("/startup", (_req, res) => res.json(store.startupSummary()));
v1.get("/diagnostics", (_req, res) => res.json(store.diagnostics()));

v1.get("/requests", (req, res) => {
  res.json(store.queryRequests({
    q: req.query.q,
    status: req.query.status,
    requestId: req.query.requestId,
    limit: req.query.limit,
  }));
});

v1.get("/request-id/:requestId", (req, res) => {
  res.json(store.findByRequestId(req.params.requestId));
});

v1.get("/requests/:traceId", (req, res) => {
  const trace = store.request(req.params.traceId);
  if (!trace) return res.status(404).json({ error: "Trace not found." });
  res.json(trace);
});

v1.get("/requests/:traceId/replay", (req, res) => {
  const replay = store.replay(req.params.traceId);
  if (!replay) return res.status(404).json({ error: "Trace not found." });
  res.json(replay);
});

v1.get("/analytics", (_req, res) => res.json(store.analytics()));

// ─── Natural Language Query ──────────────────────────────────────────
v1.get("/query", (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Provide ?q=your question" });
  const result = store.naturalLanguageQuery(q);
  res.json(result);
});

// ─── Trace → Test Generator ─────────────────────────────────────────
v1.get("/requests/:traceId/generate-test", (req, res) => {
  const test = store.generateTest(req.params.traceId);
  if (!test) return res.status(404).json({ error: "Trace not found." });
  res.json(test);
});

v1.get("/logs", (req, res) => {
  res.json(store.queryLogs({
    level: req.query.level,
    q: req.query.q,
    traceId: req.query.traceId,
    limit: req.query.limit,
  }));
});

v1.get("/report", (_req, res) => res.json(store.report()));
v1.get("/architecture-score", (_req, res) => res.json(store.architectureScore()));

// ─── Agent Sessions ──────────────────────────────────────────────────
v1.get("/agent-sessions", (req, res) => {
  res.json(store.queryAgentSessions({
    agentId: req.query.agentId,
    status: req.query.status,
    limit: req.query.limit,
  }));
});

v1.get("/agent-sessions/:sessionId", (req, res) => {
  const session = store.agentSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Agent session not found." });
  res.json(session);
});

// ─── Shareable Trace Links ───────────────────────────────────────────
v1.post("/share", (req, res) => {
  const result = store.createShareLink(req.body);
  if (!result) return res.status(400).json({ error: "Provide traceId or sessionId." });
  res.json(result);
});

v1.get("/share/:token", (req, res) => {
  const data = store.resolveShareLink(req.params.token);
  if (!data) return res.status(404).json({ error: "Share link expired or not found." });
  res.json(data);
});

// ─── Bookmarks (server-synced saved views) ──────────────────────────────
v1.get("/bookmarks", (_req, res) => res.json(store.listBookmarks()));

v1.get("/bookmarks/:traceId", (req, res) => {
  const b = store.getBookmark(req.params.traceId);
  if (!b) return res.status(404).json({ error: "Bookmark not found." });
  res.json(b);
});

v1.put("/bookmarks/:traceId", (req, res) => {
  const bookmark = store.upsertBookmark({ ...req.body, traceId: req.params.traceId });
  if (!bookmark) return res.status(400).json({ error: "Invalid bookmark payload." });
  res.json(bookmark);
});

v1.delete("/bookmarks/:traceId", (req, res) => {
  store.deleteBookmark(req.params.traceId);
  res.json({ deleted: true });
});

v1.post("/bookmarks/import", (req, res) => {
  const count = store.importBookmarks(req.body);
  res.json({ imported: count });
});

v1.get("/diff", (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: "Provide ?a=traceId&b=traceId" });
  const result = store.diff(a, b);
  if (!result) return res.status(404).json({ error: "One or both traces not found." });
  res.json(result);
});

// ─── Export endpoint ────────────────────────────────────────────────────
v1.get("/export/traces", (req, res) => {
  const format = req.query.format ?? "json";
  const requests = store.queryRequests({ limit: req.query.limit ?? 1000 });

  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=devtrace-export-${Date.now()}.csv`);
    const header = "traceId,requestId,service,method,path,status,durationMs,eventCount,errorCount,firstSeen,lastSeen\n";
    const rows = requests.map((r) =>
      [r.traceId, r.requestId, r.service, r.method, r.path, r.status, r.durationMs, r.eventCount, r.errorCount, r.firstSeen, r.lastSeen].join(",")
    ).join("\n");
    return res.send(header + rows);
  }

  res.setHeader("Content-Disposition", `attachment; filename=devtrace-export-${Date.now()}.json`);
  res.json({ exportedAt: new Date().toISOString(), count: requests.length, traces: requests });
});

app.use("/api/v1", v1);

// ─── Backward-compatible /api/* routes (proxy to v1) ────────────────────
app.get("/api/health", (req, res, next) => { req.url = "/health"; v1.handle(req, res, next); });
app.get("/api/snapshot", (req, res, next) => { req.url = "/snapshot"; v1.handle(req, res, next); });
app.get("/api/startup", (req, res, next) => { req.url = "/startup"; v1.handle(req, res, next); });
app.get("/api/diagnostics", (req, res, next) => { req.url = "/diagnostics"; v1.handle(req, res, next); });
app.get("/api/requests", (req, res, next) => { req.url = "/requests"; v1.handle(req, res, next); });
app.get("/api/request-id/:requestId", (req, res, next) => { req.url = `/request-id/${req.params.requestId}`; v1.handle(req, res, next); });
app.get("/api/requests/:traceId", (req, res, next) => { req.url = `/requests/${req.params.traceId}`; v1.handle(req, res, next); });
app.get("/api/requests/:traceId/replay", (req, res, next) => { req.url = `/requests/${req.params.traceId}/replay`; v1.handle(req, res, next); });

// Bookmark backward-compat routes
app.get("/api/bookmarks", (req, res, next) => { req.url = "/bookmarks"; v1.handle(req, res, next); });
app.get("/api/bookmarks/:traceId", (req, res, next) => { req.url = `/bookmarks/${req.params.traceId}`; v1.handle(req, res, next); });
app.put("/api/bookmarks/:traceId", (req, res, next) => { req.url = `/bookmarks/${req.params.traceId}`; v1.handle(req, res, next); });
app.delete("/api/bookmarks/:traceId", (req, res, next) => { req.url = `/bookmarks/${req.params.traceId}`; v1.handle(req, res, next); });
app.post("/api/bookmarks/import", (req, res, next) => { req.url = "/bookmarks/import"; v1.handle(req, res, next); });

// ─── Ingest ─────────────────────────────────────────────────────────────
app.post("/ingest", ingestLimiter, validateIngestPayload, (req, res) => {
  const accepted = store.ingest(req.body);
  broadcast({ type: "events", payload: accepted });
  logger.info({ acceptedCount: accepted.length }, "ingested events");
  res.status(202).json({ accepted: accepted.length });
});

// ─── WebSocket ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: "/ws", verifyClient: ({ req }, done) => {
  const allowed = wsAuthCheck(req);
  if (!allowed) {
    logger.warn({ ip: req.socket.remoteAddress }, "ws connection rejected: bad API key");
  }
  done(allowed);
}});

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "snapshot", payload: store.snapshot() }));
});

// ─── Error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error." });
});

// ─── Start ──────────────────────────────────────────────────────────────
server.listen(config.port, () => {
  logger.info({
    port: config.port,
    env: config.nodeEnv,
    authEnabled: !!config.apiKey,
    corsOrigins: config.corsOrigins,
    rateLimitMax: config.rateLimitMax,
  }, `devtrace backend listening on http://localhost:${config.port}`);
});

function broadcast(message) {
  const encoded = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(encoded);
    }
  }
}
