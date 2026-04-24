import { config } from "../config.js";

/**
 * API-key authentication middleware.
 *
 * When DEVTRACE_API_KEY is set:
 *   - Every request must include `Authorization: Bearer <key>` or query param `?apiKey=<key>`.
 *   - WebSocket upgrade requests check the same header or the Sec-WebSocket-Protocol header.
 *   - Health endpoint is always public.
 *
 * When DEVTRACE_API_KEY is NOT set the middleware is a no-op (local dev mode).
 */
export function apiKeyAuth(req, res, next) {
  if (!config.apiKey) {
    return next();
  }

  // Health is always public
  if (req.path === "/api/v1/health" || req.path === "/api/health") {
    return next();
  }

  const token = extractToken(req);
  if (token === config.apiKey) {
    return next();
  }

  res.status(401).json({ error: "Unauthorized – provide a valid API key via Authorization header or apiKey query param." });
}

/**
 * Validate API key on WebSocket upgrade.
 * Returns true if the connection is allowed.
 */
export function wsAuthCheck(req) {
  if (!config.apiKey) {
    return true;
  }
  const token =
    extractBearerToken(req.headers["authorization"]) ??
    new URL(req.url, "http://localhost").searchParams.get("apiKey") ??
    req.headers["sec-websocket-protocol"];
  return token === config.apiKey;
}

function extractToken(req) {
  return (
    extractBearerToken(req.headers["authorization"]) ??
    req.query?.apiKey ??
    null
  );
}

function extractBearerToken(header) {
  if (!header) return null;
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return header; // Allow raw key for simple clients
}

