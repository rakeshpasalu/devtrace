# Changelog

All notable changes to **DevTrace Studio** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Log forwarding pipeline — ingest URL resolution**: `DevTraceConfigurationFactory` now
  auto-appends `/ingest` to the `devtrace.backend-url` property so that the
  `BatchingHttpTracePublisher` POSTs events to the correct endpoint.  Previously,
  setting `devtrace.backend-url=http://127.0.0.1:9000` caused events to be sent to
  the server root instead of `/ingest`, silently losing all data.

- **Log capture for non-additive Logback loggers**: `DevTraceLogAppenderInstaller` now
  scans the Logback `LoggerContext` and attaches the DevTrace appender to every logger
  with `additivity="false"`, not just the root logger.  Applications that define
  package-level loggers with `additivity="false"` in `logback.xml` / `logback-spring.xml`
  were invisible to DevTrace — those logs never propagated to the root logger where the
  appender was installed.

- **OTel SDK global registration resilience**: `TraceEnvironment.initialize()` now
  catches the `IllegalStateException` thrown by `buildAndRegisterGlobal()` when another
  OpenTelemetry SDK is already registered and falls back to a local SDK instance.
  Previously this exception prevented `INITIALIZED` from being set to `true`, causing
  `DevTraceLogbackAppender` to silently drop every log event.

- **Blast Radius graph stability**: replaced the D3 force-simulation layout with a
  deterministic radial layout.  The graph no longer "dances" or re-renders every polling
  cycle.  Structural fingerprinting (`nodeFingerprint` / `linkFingerprint`) ensures the
  D3 effect only re-runs when graph topology actually changes.

- **Blast Radius graph scalability**: added smart pruning (first 3 depth levels, max 14
  nodes per ring), adaptive node sizing, hover-to-reveal labels, click-to-expand summary
  bubbles, and zoom/pan support to handle graphs with 100+ nodes without overlap.

- **WebSocket real-time log delivery**: the WebSocket `events` handler in `App.jsx` now
  extracts `LOG`-type events and appends them to `snapshot.logs` immediately, so the
  Log Explorer page updates in real time without waiting for the next HTTP poll.

### Changed

- `DevTraceConfigurationFactory.fromEnvironment()` and `fromSystem()` normalise the
  backend URL via `normalizeIngestUrl()` — trailing slashes are stripped and `/ingest`
  is appended when missing.

- `DevTraceLogAppenderInstaller.uninstall()` now detaches the appender from all loggers
  it was attached to (tracked via an internal list) instead of only the root logger.

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

