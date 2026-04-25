# Changelog

All notable changes to **DevTrace Studio** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Agent Execution Tree** — full-stack MCP agent tracing:
  - 16 new event types: `AGENT_SESSION_START`, `AGENT_DECISION`, `AGENT_TOOL_CALL`,
    `AGENT_TOOL_ERROR`, `AGENT_TOOL_RESULT`, `AGENT_SPAWN`, `AGENT_CONTEXT_HANDOFF`,
    `AGENT_RETRY`, `AGENT_FALLBACK`, `AGENT_GUARDRAIL_HIT`, `AGENT_SESSION_END`,
    `LLM_COMPLETION`, `LLM_STREAMING_CHUNK`, `MCP_SERVER_CONNECT`,
    `MCP_SERVER_DISCONNECT`, `MCP_TOOL_DISCOVERY`
  - Backend session tracking with tool call counts, token usage, cost accumulation,
    retry counts, error counts, and sub-agent spawns
  - `GET /api/v1/agent-sessions` and `GET /api/v1/agent-sessions/:sessionId` endpoints
  - Interactive execution tree UI with collapsible event nodes, cost breakdown panel,
    token budget progress bar, and session metrics dashboard

- **Agent Anomaly Detection** — six real-time detectors:
  - Infinite tool loop (same tool called 5+ times)
  - Runaway cost (session exceeds $1.00)
  - Excessive retries (3+ retries in a session)
  - Token budget blowout (>80% utilization)
  - Long-running session (>60 seconds)
  - Deep sub-agent nesting (>3 spawns)
  - Anomalies displayed in the agent trace UI with severity badges

- **Shareable Trace Links**:
  - `POST /api/v1/share` creates a time-limited token (24h default)
  - `GET /api/v1/share/:token` resolves to full trace or agent session data
  - One-click Share button in the Agent Trace page with URL copy

- **Natural Language Query Engine**:
  - `GET /api/v1/query?q=...` endpoint
  - 8 intent classifiers: errors, slow requests, database queries, agent sessions,
    service-specific, endpoint-specific, throughput stats, full-text fallback
  - Time window parsing ("last 5 minutes", "last 1 hour", "today")
  - Agent sub-queries ("most expensive sessions", "sessions with anomalies")
  - Frontend "Ask DevTrace" page with search bar, click-to-query suggestions,
    interpreted-as badge, stats summary cards, and rich result tables

- **Trace → Test Generator**:
  - `GET /api/v1/requests/:traceId/generate-test` endpoint
  - Generates complete JUnit 5 + Spring Boot Test + MockMvc code:
    `@MockBean` for outbound HTTP clients, `mockMvc.perform()` with status assertion,
    SQL statement counts, service layer call documentation
  - Frontend page with trace selector, syntax-highlighted code view, copy-to-clipboard,
    and download-as-`.java` file

- **Dashboard agent metrics** — agent session count in header bar and dashboard
  metrics row.

### Fixed

- **Log forwarding pipeline — ingest URL resolution**: `DevTraceConfigurationFactory`
  now auto-appends `/ingest` to the `devtrace.backend-url` property so that the
  `BatchingHttpTracePublisher` POSTs events to the correct endpoint.

- **Log capture for non-additive Logback loggers**: `DevTraceLogAppenderInstaller` now
  attaches the DevTrace appender to every logger with `additivity="false"`, not just the
  root logger.

- **OTel SDK global registration resilience**: `TraceEnvironment.initialize()` now
  catches exceptions from `buildAndRegisterGlobal()` when another OpenTelemetry SDK is
  already registered and falls back to a local SDK instance.

- **Blast Radius graph stability**: replaced D3 force-simulation with a deterministic
  radial layout. Structural fingerprinting prevents unnecessary re-renders.

- **Blast Radius graph scalability**: smart pruning (first 3 depth levels, max 14 nodes
  per ring), adaptive node sizing, hover-to-reveal labels, zoom/pan support.

- **WebSocket real-time log delivery**: the WebSocket `events` handler now extracts
  `LOG`-type events and appends them to `snapshot.logs` in real time.

### Changed

- `DevTraceConfigurationFactory` normalises the backend URL — trailing slashes are
  stripped and `/ingest` is appended when missing.
- `DevTraceLogAppenderInstaller.uninstall()` detaches the appender from all loggers it
  was attached to.

## [1.0.0-SNAPSHOT] — 2026-04-23

### Added

- **Trace Explorer** — full request lifecycle view with timeline, request flow, and
  span-level detail.
- **Dashboard** — throughput sparkline, error-rate gauge, live activity feed, slowest
  endpoints, hot components, and service overview.
- **Boot Sequence** — Spring application lifecycle event timeline and auto-configuration
  condition report.
- **Bean Graph** — interactive dependency graph of Spring-managed beans.
- **Endpoint Analytics** — per-endpoint latency percentiles (p50 / p95 / p99),
  throughput, and error rate.
- **Service Autopsy** — deep-dive diagnostics per service.
- **Architecture Score** — quantified health score based on coupling, error rate, and
  latency.
- **Service Topology** — auto-discovered service map from inter-service calls.
- **Live Tail** — real-time event stream with filtering.
- **Log Explorer** — structured log search with level / logger / trace-ID filters.
- **Blast Radius (Dependency Impact)** — visualise downstream impact of a component
  change.
- **Trace Diff** — side-by-side comparison of two request traces.
- **AI Copilot** — pattern detection and LLM prompt generator for trace analysis.
- **Diagnostics Panel** — automatic error and slow-span detection.
- **Request Replay** — step-through replay of captured request events.
- **Nerd Console** — power-user query console over raw event data.
- **Flame Graph** — aggregated flame graph from span data.
- **SLO Tracker** — define and monitor service-level objectives.
- **Alert Rules** — configurable threshold-based alerting.
- **Saved Views** — bookmark and recall filtered trace views.
- **Settings** — API key management, theme, and backend configuration.
- **FAQ** — built-in onboarding guide and frequently asked questions.
- **Command Palette** — `⌘K` quick navigation and trace search.
- **spring-boot-starter-devtrace** — zero-config Spring Boot starter with:
  - Servlet request tracing filter
  - Method-level `@Traced` AOP aspect
  - Hibernate SQL statement inspector
  - RestTemplate / WebClient interceptors
  - Async task decorator with context propagation
  - Bean graph emitter
  - Auto-configuration condition report emitter
  - Logback log forwarding appender
- **trace-common** — shared event model, batching HTTP publisher, and OpenTelemetry
  integration.
- **java-agent** — bytecode-level instrumentation agent (alternative to starter).
- **sample-app** — reference Spring Boot application pre-wired with the starter.
- Docker Compose and Dockerfile for containerised deployment.

[Unreleased]: https://github.com/devtrace/studio/compare/v1.0.0-SNAPSHOT...HEAD
[1.0.0-SNAPSHOT]: https://github.com/devtrace/studio/releases/tag/v1.0.0-SNAPSHOT

