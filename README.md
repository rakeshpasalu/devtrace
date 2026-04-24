<p align="center">
  <img src="https://img.shields.io/badge/Spring_Boot-3.4.5-6DB33F?style=for-the-badge&logo=springboot&logoColor=white" alt="Spring Boot 3.4.5" />
  <img src="https://img.shields.io/badge/React-19.1-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Express-5.1-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/Java-17+-F80000?style=for-the-badge&logo=openjdk&logoColor=white" alt="Java 17+" />
  <img src="https://img.shields.io/badge/Node-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 20+" />
  <img src="https://img.shields.io/badge/OpenTelemetry-1.48-7B61FF?style=for-the-badge&logo=opentelemetry&logoColor=white" alt="OpenTelemetry" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/CVEs-0-brightgreen?style=for-the-badge" alt="0 CVEs" />
</p>

<h1 align="center">DevTrace Studio</h1>

<p align="center">
  <strong>Enterprise-grade observability workspace for Spring Boot applications</strong><br/>
  Watch everything from JVM boot to live request handling — without modifying business code.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#dashboard-views">Dashboard</a> ·
  <a href="#instrumentation-modes">Instrumentation</a> ·
  <a href="#api-reference">API</a> ·
  <a href="#security">Security</a> ·
  <a href="#deployment">Deployment</a>
</p>

---

## Overview

DevTrace Studio is a developer-focused observability platform that provides deep runtime visibility into Spring Boot applications. It captures JVM startup sequences, Spring lifecycle events, bean dependency graphs, HTTP request flows, SQL queries, async handoffs, and outbound calls — then presents them through a real-time React control center with 20+ specialized views.

**Two instrumentation modes. Zero business-code changes.**

| Mode | How | What you get |
|------|-----|-------------|
| **Java Agent** | Attach via `-javaagent` flag | JVM boot, class loading, Spring lifecycle, servlet tracing, controller tracing, RestTemplate |
| **Spring Starter** | Add one Maven/Gradle dependency | HTTP tracing, service/repository tracing, WebClient, async propagation, Hibernate SQL, bean graph, auto-config reports |
| **Both** | Agent + Starter together | Full coverage — agent handles startup, starter handles runtime, no duplication |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Spring Boot Application                       │
│  ┌──────────────────┐  ┌──────────────────────────────────────────┐ │
│  │  DevTrace Agent   │  │  spring-boot-starter-devtrace            │ │
│  │  (ByteBuddy)      │  │  (AOP interceptors + filters)           │ │
│  └────────┬─────────┘  └──────────────┬───────────────────────────┘ │
└───────────┼────────────────────────────┼────────────────────────────┘
            │                            │
            ▼                            ▼
     ┌──────────────────────────────────────┐
     │          trace-common                 │
     │   (event model + W3C propagation)     │
     └──────────────┬───────────────────────┘
                    │  HTTP POST /ingest
                    ▼
     ┌──────────────────────────────────────┐
     │       Node.js Collector (Express 5)   │
     │  ┌────────────┐ ┌─────────────────┐  │
     │  │ In-Memory   │ │ WebSocket       │  │
     │  │ Event Store  │ │ Broadcast       │  │
     │  └────────────┘ └────────┬────────┘  │
     └──────────────────────────┼───────────┘
                                │  ws://
                                ▼
     ┌──────────────────────────────────────┐
     │     React 19 Control Center           │
     │  26 specialized views                 │
     │  Real-time WebSocket updates          │
     │  URL deep linking                     │
     └──────────────────────────────────────┘
```

---

## Dashboard Views

DevTrace ships with **26 purpose-built views** organized into logical groups:

### Observe

| View | Description |
|------|-------------|
| **Trace Explorer** | Live request index with search by trace ID, request ID, method, path, service. Split-pane with detail view. |
| **Execution Timeline** | Gantt-style span timing visualization for the selected trace. |
| **Request Flow** | Nested call tree showing controller → service → repository → SQL execution. |
| **Flame Graph** | Interactive flame chart with zoom, click-to-inspect, component color coding, and SQL highlighting. |
| **Live Tail** | Real-time event stream with type/component/service filters, severity toggles, pause/resume, auto-scroll, expandable detail, JSON copy. |
| **Service Topology** | D3 force-directed graph showing inter-service communication patterns. |
| **Nerd Console** | Terminal-style event feed with category filters, search, stats strip, expandable rows. |

### Analyze

| View | Description |
|------|-------------|
| **Endpoint Analytics** | Per-endpoint p50/p95/p99 latency, error rates, component breakdown, trace drill-down, anomaly detection. |
| **Trace Diff** | Side-by-side comparison of two traces — span timing diffs, added/removed spans, component breakdown delta. |
| **Blast Radius** | Select any bean → see transitive dependency impact with D3 graph, affected list, severity rating. |
| **Architecture Score** | 5-dimension scoring (complexity, performance, reliability, maintainability, scalability) with radar chart. |
| **Service Autopsy** | Full health report — grade, bottlenecks, recommendations, bean inventory, error summary. |

### Operate

| View | Description |
|------|-------------|
| **Diagnostics** | Errors, slow spans, hottest components, service health at a glance. |
| **SLO Tracker** | Define latency/error-rate/availability SLOs, track burn rate, breach alerts. |
| **Alert Rules** | Configurable rules for p95, error rate, slow span count — with violation history. |
| **Saved Views** | Server-synced bookmarks with notes, tags, starring, search, JSON export/import. |
| **Request Replay** | Step through any trace event-by-event in timestamp order. |

### Setup

| View | Description |
|------|-------------|
| **Onboarding** | Step-by-step setup wizard with connection verification and sample commands. |
| **Boot Sequence** | Spring startup lifecycle, class-loading snapshots, auto-configuration decisions. |
| **Bean Graph** | 2D/3D force-directed visualization of Spring bean dependencies. |
| **Settings** | Connection config, API key, theme (dark/light/system), preferences. |
| **FAQ** | Categorized answers to common questions. |
| **Command Palette** | `Cmd+K` / `Ctrl+K` quick navigation across all views. |

---

## Quick Start

### Prerequisites

- **Java 17+** and **Maven 3.8+** (for building Java modules)
- **Node.js 20+** (for the collector backend and React frontend)

### 1. Build Java modules

```bash
mvn -DskipTests package
```

### 2. Start the collector

```bash
cd backend
npm install
npm start
```

The collector runs at `http://localhost:9000`.

### 3. Start the dashboard

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Run the sample app

```bash
./scripts/run-boot-app-with-agent.sh \
  sample-app/target/sample-app-1.0.0-SNAPSHOT.jar \
  --service-name sample-app \
  --app-packages com.example.demo \
  --server-port 18081 \
  -- --devtrace.sample-port=18081
```

Hit `http://localhost:18081/api/orders/1` and watch trace data appear in the dashboard.

---

## Instrumentation Modes

### Mode A: Zero-Code Agent (any existing JAR)

No code changes. Attach the agent to any Spring Boot fat JAR:

```bash
./scripts/run-boot-app-with-agent.sh \
  /path/to/your-app.jar \
  --service-name my-service \
  --app-packages com.mycompany.myservice
```

**Options:**

| Flag | Description |
|------|-------------|
| `--service-name` | Logical name shown in the dashboard |
| `--app-packages` | Your base package (improves signal/noise ratio) |
| `--server-port` | Override the app's HTTP port |
| `--api-key` | Authenticate with the collector |
| `--` | Separator — everything after is passed to Spring Boot |

**Capabilities:** JVM start/class loading, Spring lifecycle, bean creation, servlet tracing, controller tracing, RestTemplate tracing.

### Mode B: Spring Boot Starter

Add one dependency for the richest experience:

**Maven:**
```xml
<dependency>
  <groupId>com.devtrace.studio</groupId>
  <artifactId>spring-boot-starter-devtrace</artifactId>
  <version>1.0.0-SNAPSHOT</version>
</dependency>
```

**Gradle:**
```kotlin
implementation("com.devtrace.studio:spring-boot-starter-devtrace:1.0.0-SNAPSHOT")
```

**Configuration (application.yml):**
```yaml
devtrace:
  backend-url: http://127.0.0.1:9000
  service-name: my-service
  api-key: ""  # set if collector requires authentication
```

**Additional capabilities:** WebClient tracing, async executor propagation, Hibernate SQL, bean dependency graph, auto-configuration reports.

### Mode C: Agent + Starter (recommended for production apps)

Use both together for maximum coverage. The agent automatically backs off duplicated runtime hooks when the starter is present.

### Runtime Attach

Attach to an already-running JVM without restart:

```bash
java -cp java-agent/target/java-agent-1.0.0-SNAPSHOT.jar \
  com.devtrace.studio.agent.AgentAttacher \
  java-agent/target/java-agent-1.0.0-SNAPSHOT.jar \
  <PID> \
  'backendUrl=http://127.0.0.1:9000;serviceName=my-service;appPackages=com.mycompany'
```

### Capability Matrix

| Capability | Agent | Starter | Both |
|---|:---:|:---:|:---:|
| JVM start & class loading | ✅ | — | ✅ |
| Spring lifecycle events | ✅ | ✅ | ✅ |
| Bean creation tracking | ✅ | ✅ | ✅ |
| Servlet request tracing | ✅ | ✅ | ✅ |
| Controller invocation | ✅ | ✅ | ✅ |
| RestTemplate tracing | ✅ | ✅ | ✅ |
| WebClient tracing | — | ✅ | ✅ |
| Async executor propagation | — | ✅ | ✅ |
| Hibernate SQL visibility | — | ✅ | ✅ |
| Bean dependency graph | — | ✅ | ✅ |
| Auto-config report | — | ✅ | ✅ |

---

## API Reference

All endpoints are available under `/api/v1/` with backward-compatible `/api/` aliases.

### Trace & Request APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Collector health status, uptime, memory, event count |
| `GET` | `/api/v1/snapshot` | Full state snapshot (stats, recent events, requests, bean graph, diagnostics) |
| `GET` | `/api/v1/requests` | Query requests — `?q=`, `?status=`, `?requestId=`, `?limit=` |
| `GET` | `/api/v1/requests/:traceId` | Full trace detail with all events |
| `GET` | `/api/v1/requests/:traceId/replay` | Replay-ready event sequence with relative timestamps |
| `GET` | `/api/v1/request-id/:requestId` | Lookup traces by business request ID |
| `GET` | `/api/v1/startup` | Spring startup lifecycle, class loading, auto-config summary |
| `GET` | `/api/v1/diagnostics` | Errors, slow spans, component metrics, service health |
| `GET` | `/api/v1/analytics` | Per-endpoint latency percentiles, anomaly detection |
| `GET` | `/api/v1/diff?a=&b=` | Comparative trace diff |
| `GET` | `/api/v1/report` | Full service autopsy report |
| `GET` | `/api/v1/architecture-score` | Architecture Intelligence Score dimensions |
| `POST` | `/ingest` | Ingest events from agents/starters |

### Saved Views APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/bookmarks` | List all bookmarks |
| `GET` | `/api/v1/bookmarks/:traceId` | Get single bookmark |
| `PUT` | `/api/v1/bookmarks/:traceId` | Create or update bookmark |
| `DELETE` | `/api/v1/bookmarks/:traceId` | Delete bookmark |
| `POST` | `/api/v1/bookmarks/import` | Bulk import bookmarks |

### Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/export/traces?format=json` | Export traces as JSON |
| `GET` | `/api/v1/export/traces?format=csv` | Export traces as CSV |

### WebSocket

Connect to `ws://localhost:9000/ws` for real-time event streaming. Include `?apiKey=` if authentication is enabled.

---

## Security

DevTrace is built with enterprise security in mind. **Zero known CVEs** across all dependencies.

### Authentication

```bash
# Require API key on the collector
DEVTRACE_API_KEY=my-secret-key npm start
```

All API calls and WebSocket connections must include the key:

```bash
curl -H 'Authorization: Bearer my-secret-key' http://localhost:9000/api/v1/snapshot
```

Configure in the agent: `--api-key my-secret-key`

Configure in the starter:
```yaml
devtrace:
  api-key: my-secret-key
```

Configure in the dashboard: **Settings → Connection → API Key**

### CORS

```bash
DEVTRACE_CORS_ORIGINS=https://devtrace.internal.example.com npm start
```

### Rate Limiting

| Setting | Default | Environment Variable |
|---------|---------|---------------------|
| API window | 60s | `DEVTRACE_RATE_LIMIT_WINDOW` |
| API max/window | 300 | `DEVTRACE_RATE_LIMIT_MAX` |
| Ingest max/window | 600 | `DEVTRACE_INGEST_RATE_MAX` |

### Ingest Validation

- Request body must contain at least one event
- Max batch size: 5,000 events
- Every event must have a valid `type` field

### Security Headers

[Helmet](https://helmetjs.github.io/) applies `X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, and more.

### Structured Logging

All logs emitted as structured JSON via [Pino](https://getpino.io/). Control verbosity with `DEVTRACE_LOG_LEVEL`.

### Dependency Security

| Layer | Stack | CVEs |
|-------|-------|------|
| **Backend** | Express 5.1, Helmet 8.1, Pino 9.6, ws 8.18 | **0** |
| **Frontend** | React 19.1, Vite 8.0, lucide-react 0.487, jsPDF 4.2 | **0** |
| **Java** | Spring Boot 3.4.5, OpenTelemetry 1.48, Byte Buddy 1.17 | **0** |

---

## Deployment

### Docker

```bash
docker build -t devtrace-collector .
docker run -p 9000:9000 -e DEVTRACE_API_KEY=changeme devtrace-collector
```

The image includes both the collector and a production build of the React dashboard.

### Docker Compose

```bash
cp .env.example .env   # configure DEVTRACE_API_KEY and other settings
docker compose up -d
```

For frontend development:

```bash
docker compose --profile dev up -d
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `9000` | Collector listen port |
| `DEVTRACE_API_KEY` | _(empty)_ | API key for authentication |
| `DEVTRACE_CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `DEVTRACE_MAX_EVENTS` | `50000` | Max events retained in memory |
| `DEVTRACE_RATE_LIMIT_WINDOW` | `60` | Rate limit window (seconds) |
| `DEVTRACE_RATE_LIMIT_MAX` | `300` | Max API requests per window |
| `DEVTRACE_INGEST_RATE_MAX` | `600` | Max ingest requests per window |
| `DEVTRACE_LOG_LEVEL` | `info` | Pino log level |
| `DEVTRACE_SLOW_THRESHOLD_MS` | `150` | Slow method threshold (ms) |

---

## Module Layout

```
devtrace/
├── pom.xml                              # Maven parent POM
├── trace-common/                        # Shared event model, W3C propagation, OTel hooks
├── java-agent/                          # ByteBuddy Java agent (premain + runtime attach)
├── spring-boot-starter-devtrace/        # Spring Boot auto-configuration starter
├── sample-app/                          # Demo Spring Boot app (JPA + REST)
├── backend/                             # Node.js collector (Express 5 + WebSocket)
│   └── src/
│       ├── server.js                    # HTTP + WS server, API routes
│       ├── store.js                     # In-memory event store with indexing
│       ├── config.js                    # Environment-driven configuration
│       └── middleware/                  # Auth, validation
├── frontend/                            # React 19 control center
│   └── src/
│       ├── App.jsx                      # Shell with hash routing, WebSocket, state
│       ├── utils.js                     # Auth helpers, formatters, tree builders
│       └── components/                  # 26 specialized view components
├── scripts/
│   └── run-boot-app-with-agent.sh       # Agent launcher script
├── Dockerfile                           # Multi-stage production build
└── docker-compose.yml                   # Collector + optional dev frontend
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Java Agent** | ByteBuddy | 1.17.5 |
| **Tracing** | OpenTelemetry API + SDK | 1.48.0 |
| **Spring** | Spring Boot | 3.4.5 |
| **Collector** | Express | 5.1.0 |
| **Real-time** | ws (WebSocket) | 8.18.2 |
| **Security** | Helmet | 8.1.0 |
| **Logging** | Pino + pino-http | 9.6 / 10.4 |
| **Dashboard** | React | 19.1.0 |
| **Build** | Vite | 8.0.10 |
| **Visualization** | D3.js | 7.9.0 |
| **3D Graphs** | three.js + react-force-graph | 0.175 |
| **Icons** | lucide-react | 0.487.0 |
| **PDF Export** | jsPDF + jspdf-autotable | 4.2 / 5.0 |
| **Container** | Docker (Node 20 Alpine) | Multi-stage |

---

## Design Principles

- **Zero business-code modification** — agent and starter never require application code changes
- **W3C Trace Context** — propagation across requests and outbound calls follows the standard
- **Agent deduplication** — runtime hooks back off when the starter is present
- **Bounded memory** — in-memory store with configurable caps prevents OOM
- **Graceful degradation** — dashboard recovers via periodic snapshot refresh if WebSocket drops
- **URL deep linking** — hash-based routing makes every view and trace shareable
- **Offline-first bookmarks** — saved views persist to both server and localStorage
- **Security by default** — Helmet headers, rate limiting, input validation, structured logging

---

## Verification

```bash
# Java build
mvn -DskipTests package

# Starter unit tests
mvn -q -pl spring-boot-starter-devtrace -am test

# Backend tests
cd backend && npm test

# Frontend production build
cd frontend && npm run build

# Docker build
docker build -t devtrace-collector .

# Security audit (should report 0 vulnerabilities)
cd backend && npm audit
cd frontend && npm audit
```

---

## Roadmap

- [ ] OpenTelemetry Collector sidecar for OTLP export
- [ ] Elasticsearch / OpenSearch persistence for long-term storage
- [ ] Grafana / Tempo integration
- [ ] Multi-user role-based access control
- [ ] TLS termination via reverse proxy
- [ ] Kubernetes Helm chart
- [ ] Span-level alerting with webhook notifications

---

## Troubleshooting

<details>
<summary><strong>Dashboard shows no requests</strong></summary>

1. Verify the collector is running: `curl http://localhost:9000/api/v1/health`
2. Verify the app can reach `http://127.0.0.1:9000/ingest`
3. Verify the app was launched with the agent or includes the starter
4. Check the dashboard **Settings** page for the correct backend URL

</details>

<details>
<summary><strong>I only have a JAR file</strong></summary>

Use zero-code agent mode:

```bash
./scripts/run-boot-app-with-agent.sh /path/to/app.jar \
  --service-name my-service \
  --app-packages com.mycompany
```

</details>

<details>
<summary><strong>Port 8080 is busy</strong></summary>

```bash
./scripts/run-boot-app-with-agent.sh /path/to/app.jar \
  --service-name my-service \
  --server-port 18081
```

</details>

<details>
<summary><strong>Need bean graph, SQL, and async tracing</strong></summary>

Add `spring-boot-starter-devtrace` to your app. Optionally also launch with the agent for startup visibility.

</details>

---

## License

This project is proprietary. All rights reserved.
