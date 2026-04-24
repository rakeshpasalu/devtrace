/**
 * Centralized configuration loaded from environment variables.
 *
 * Environment variables:
 *   PORT                        – HTTP port (default 9000)
 *   DEVTRACE_MAX_EVENTS         – Max retained events (default 20000)
 *   DEVTRACE_SLOW_THRESHOLD_MS  – Slow span threshold in ms (default 150)
 *   DEVTRACE_API_KEY            – Shared secret for API key auth (optional; when set, all clients must send it)
 *   DEVTRACE_CORS_ORIGINS       – Comma-separated allowed origins (default "*")
 *   DEVTRACE_RATE_LIMIT_WINDOW  – Rate limit window in seconds (default 60)
 *   DEVTRACE_RATE_LIMIT_MAX     – Max requests per window (default 300)
 *   DEVTRACE_INGEST_RATE_MAX    – Max ingest calls per window (default 600)
 *   DEVTRACE_LOG_LEVEL          – pino log level (default "info")
 *   NODE_ENV                    – "production" | "development" | "test"
 */

const env = process.env;

export const config = Object.freeze({
  port: Number(env.PORT ?? 9000),
  nodeEnv: env.NODE_ENV ?? "development",

  // Storage
  maxEvents: Number(env.DEVTRACE_MAX_EVENTS ?? 20_000),
  slowThresholdMs: Number(env.DEVTRACE_SLOW_THRESHOLD_MS ?? 150),

  // Security
  apiKey: env.DEVTRACE_API_KEY ?? null,
  corsOrigins: env.DEVTRACE_CORS_ORIGINS
    ? env.DEVTRACE_CORS_ORIGINS.split(",").map((o) => o.trim())
    : ["*"],

  // Rate limiting
  rateLimitWindowSeconds: Number(env.DEVTRACE_RATE_LIMIT_WINDOW ?? 60),
  rateLimitMax: Number(env.DEVTRACE_RATE_LIMIT_MAX ?? 300),
  ingestRateLimitMax: Number(env.DEVTRACE_INGEST_RATE_MAX ?? 600),

  // Logging
  logLevel: env.DEVTRACE_LOG_LEVEL ?? "info",
});

