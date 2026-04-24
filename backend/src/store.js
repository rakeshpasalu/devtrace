const DEFAULT_MAX_EVENTS = 50_000;
const DEFAULT_MAX_TRACE_EVENTS = 4_000;
const DEFAULT_MAX_REQUESTS = 1_500;
const SLOW_METHOD_THRESHOLD_MS = Number(process.env.DEVTRACE_SLOW_THRESHOLD_MS ?? 150);

const STARTUP_EVENT_TYPES = new Set([
  "JVM_STARTED",
  "AGENT_ATTACHED",
  "CLASS_TRANSFORMED",
  "CLASS_LOADING_SNAPSHOT",
  "SPRING_APPLICATION_RUN",
  "SPRING_LIFECYCLE",
  "BEAN_CREATION",
  "BEAN_NODE",
  "BEAN_EDGE",
  "AUTO_CONFIGURATION"
]);

export class EventStore {
  constructor(maxEvents = DEFAULT_MAX_EVENTS, maxRequests = DEFAULT_MAX_REQUESTS) {
    this.maxEvents = maxEvents;
    this.maxRequests = maxRequests;
    this.events = [];
    this.requests = new Map();
    this.requestIds = new Map();
    this.beanNodes = new Map();
    this.beanEdges = new Map();
    this.errors = [];
    this.slowSpans = [];
    this.startupEvents = [];
    this.lifecycleEvents = [];
    this.autoConfigurationSources = new Map();
    this.componentMetrics = new Map();
    this.serviceMetrics = new Map();
    this.eventCount = 0;
    this.lastClassLoadingSnapshot = null;
    this.endpointStats = new Map();   // key = "METHOD /path" → { durations[], errors, total, ... }
    this.bookmarks = new Map();       // traceId → bookmark object (server-synced saved views)
  }

  ingest(input) {
    const payload = Array.isArray(input) ? input : [input];
    const accepted = [];

    for (const rawEvent of payload) {
      if (!rawEvent || typeof rawEvent !== "object" || !rawEvent.type) {
        continue;
      }

      const event = this.normalizeEvent(rawEvent);
      accepted.push(event);
      this.process(event);
    }

    return accepted;
  }

  snapshot() {
    const requests = this.queryRequests();
    const diagnostics = this.diagnostics();

    return {
      stats: {
        totalEvents: this.eventCount,
        retainedEvents: this.events.length,
        retainedRequests: this.requests.size,
        activeRequests: requests.filter((request) => request.status === "IN_PROGRESS").length,
        completedRequests: requests.filter((request) => request.status !== "IN_PROGRESS").length,
        beanNodes: this.beanNodes.size,
        beanEdges: this.beanEdges.size,
        services: diagnostics.services.length
      },
      recentEvents: this.events.slice(-750),
      requests,
      beanGraph: this.beanGraph(),
      startup: this.startupSummary(),
      diagnostics,
      endpointAnalytics: this.analytics()
    };
  }

  queryRequests(filters = {}) {
    const q = filters.q?.toLowerCase();
    const status = filters.status;
    const requestId = filters.requestId;
    const limit = Math.max(1, Number(filters.limit ?? 250));

    let candidates = [...this.requests.values()].map((request) => this.summarizeRequest(request));

    if (requestId) {
      const traceIds = [...(this.requestIds.get(requestId) ?? [])];
      const allowed = new Set(traceIds);
      candidates = candidates.filter((request) => allowed.has(request.traceId) || request.requestId === requestId);
    }

    if (status) {
      candidates = candidates.filter((request) => request.status === status);
    }

    if (q) {
      candidates = candidates.filter((request) =>
        [request.traceId, request.requestId, request.method, request.path, request.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }

    return candidates
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);
  }

  request(traceId) {
    const request = this.requests.get(traceId);
    if (!request) {
      return null;
    }

    return {
      summary: this.summarizeRequest(request),
      events: request.events
    };
  }

  replay(traceId) {
    const request = this.request(traceId);
    if (!request || request.events.length === 0) {
      return null;
    }

    const firstTimestamp = request.events[0].timestamp;
    return {
      traceId,
      events: request.events.map((event, index) => ({
        ...event,
        replayIndex: index,
        relativeTimeMs: Math.max(0, event.timestamp - firstTimestamp)
      }))
    };
  }

  findByRequestId(requestId) {
    if (!requestId) {
      return [];
    }
    return this.queryRequests({ requestId, limit: 100 });
  }

  beanGraph() {
    return {
      nodes: [...this.beanNodes.values()],
      links: [...this.beanEdges.values()]
    };
  }

  startupSummary() {
    const autoConfigs = [...this.autoConfigurationSources.values()];
    return {
      lifecycle: this.lifecycleEvents.slice(-80),
      recentEvents: this.startupEvents.slice(-300),
      classLoading: this.lastClassLoadingSnapshot,
      autoConfiguration: {
        totalSources: autoConfigs.length,
        matchedSources: autoConfigs.filter((item) => item.status === "MATCH").length,
        unmatchedSources: autoConfigs.filter((item) => item.status !== "MATCH").length,
        examples: autoConfigs.slice(0, 80)
      }
    };
  }

  diagnostics() {
    return {
      errors: this.errors.slice(-120),
      slowSpans: this.slowSpans.slice(-120),
      hottestComponents: [...this.componentMetrics.values()]
        .map((item) => ({
          ...item,
          averageDurationMs: item.spanCount === 0 ? 0 : Number((item.totalDurationMs / item.spanCount).toFixed(2))
        }))
        .sort((a, b) => (b.errorCount - a.errorCount) || (b.averageDurationMs - a.averageDurationMs))
        .slice(0, 16),
      services: [...this.serviceMetrics.values()]
        .sort((a, b) => b.eventCount - a.eventCount)
        .slice(0, 12)
    };
  }

  process(event) {
    this.eventCount += 1;
    this.events.push(event);
    this.trim(this.events, this.maxEvents);

    this.processServiceMetric(event);
    this.processComponentMetric(event);

    if (STARTUP_EVENT_TYPES.has(event.type)) {
      this.startupEvents.push(event);
      this.trim(this.startupEvents, 2_500);
    }

    if (event.type === "SPRING_LIFECYCLE") {
      this.lifecycleEvents.push(event);
      this.trim(this.lifecycleEvents, 500);
    }

    if (event.type === "CLASS_LOADING_SNAPSHOT") {
      this.lastClassLoadingSnapshot = event;
    }

    if (event.traceId) {
      this.processTraceEvent(event);
    }

    if (event.requestId) {
      const traces = this.requestIds.get(event.requestId) ?? new Set();
      traces.add(event.traceId);
      this.requestIds.set(event.requestId, traces);
    }

    if (event.type === "BEAN_NODE") {
      const id = event.attributes?.beanName ?? event.name;
      if (id) {
        this.beanNodes.set(id, {
          id,
          label: id,
          className: event.className,
          role: event.attributes?.role,
          scope: event.attributes?.scope
        });
      }
    }

    if (event.type === "BEAN_EDGE") {
      const source = event.attributes?.source;
      const target = event.attributes?.target;
      if (source && target) {
        this.beanEdges.set(`${source}->${target}`, { source, target });
      }
    }

    if (event.type === "AUTO_CONFIGURATION") {
      this.autoConfigurationSources.set(event.name, {
        source: event.name,
        status: event.status ?? "UNKNOWN",
        positiveMatches: Number(event.attributes?.positiveMatches ?? 0),
        negativeMatches: Number(event.attributes?.negativeMatches ?? 0),
        message: event.attributes?.message
      });
    }

    if (event.type === "ERROR" || event.status === "ERROR") {
      this.errors.push(event);
      this.trim(this.errors, 800);
    }

    if (event.type === "SPAN_FINISHED" && Number(event.durationMs) >= SLOW_METHOD_THRESHOLD_MS) {
      this.slowSpans.push(event);
      this.trim(this.slowSpans, 800);
    }
  }

  processTraceEvent(event) {
    let request = this.requests.get(event.traceId);
    if (!request) {
      request = {
        traceId: event.traceId,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        status: "IN_PROGRESS",
        requestId: event.requestId,
        method: undefined,
        path: undefined,
        service: event.service,
        events: []
      };
      this.requests.set(event.traceId, request);
      this.trimRequests();
    }

    request.lastSeen = event.timestamp;
    request.requestId = request.requestId ?? event.requestId;
    request.method = request.method ?? event.attributes?.method;
    request.path = request.path ?? event.attributes?.path;
    request.service = request.service ?? event.service;
    request.events.push(event);
    this.trim(request.events, DEFAULT_MAX_TRACE_EVENTS);

    if (event.type === "HTTP_REQUEST") {
      request.method = event.attributes?.method ?? request.method;
      request.path = request.path ?? event.attributes?.routePattern ?? event.attributes?.path;
    }

    if (event.type === "HTTP_RESPONSE") {
      request.status = String(event.attributes?.statusCode ?? event.status ?? "OK");
      // Track endpoint analytics
      this.trackEndpoint(request);
    }

    if (event.type === "ERROR" || event.status === "ERROR") {
      request.status = "ERROR";
    }
  }

  trackEndpoint(request) {
    const method = request.method ?? "n/a";
    const path = request.path ?? "background";
    const key = `${method} ${path}`;
    const ep = this.endpointStats.get(key) ?? {
      method, path, service: request.service, total: 0, errors: 0, durations: [], lastSeen: 0,
    };
    ep.total += 1;
    ep.service = request.service ?? ep.service;
    ep.lastSeen = Date.now();
    if (request.status === "ERROR") ep.errors += 1;
    // Compute duration from http-server spans
    const dur = request.events
      .filter(e => e.type === "SPAN_FINISHED" && e.component === "http-server")
      .reduce((max, e) => Math.max(max, Number(e.durationMs ?? 0)), 0);
    if (dur > 0) {
      ep.durations.push(dur);
      if (ep.durations.length > 500) ep.durations.splice(0, ep.durations.length - 500);
    }
    this.endpointStats.set(key, ep);
  }

  analytics() {
    const endpoints = [];
    for (const [key, ep] of this.endpointStats) {
      if (ep.durations.length === 0) continue;
      const sorted = [...ep.durations].sort((a, b) => a - b);
      const len = sorted.length;
      const p50 = sorted[Math.floor(len * 0.5)] ?? 0;
      const p95 = sorted[Math.floor(len * 0.95)] ?? 0;
      const p99 = sorted[Math.floor(len * 0.99)] ?? 0;
      const avg = sorted.reduce((s, v) => s + v, 0) / len;
      const errorRate = ep.total > 0 ? ep.errors / ep.total : 0;

      // Anomaly detection: compare last 10 vs baseline
      let anomaly = null;
      if (len >= 20) {
        const recentWindow = sorted.slice(-10);
        const recentAvg = recentWindow.reduce((s, v) => s + v, 0) / recentWindow.length;
        const baselineWindow = sorted.slice(0, len - 10);
        const baselineAvg = baselineWindow.reduce((s, v) => s + v, 0) / baselineWindow.length;
        if (baselineAvg > 0 && recentAvg > baselineAvg * 2) {
          anomaly = {
            type: "latency_regression",
            message: `Avg latency increased ${Math.round((recentAvg / baselineAvg - 1) * 100)}% vs baseline`,
            recentAvg: Math.round(recentAvg),
            baselineAvg: Math.round(baselineAvg),
          };
        }
      }
      if (ep.total >= 10 && errorRate > 0.1) {
        anomaly = anomaly ?? {
          type: "high_error_rate",
          message: `Error rate is ${(errorRate * 100).toFixed(1)}% (${ep.errors}/${ep.total})`,
        };
      }

      endpoints.push({
        endpoint: key,
        method: ep.method,
        path: ep.path,
        service: ep.service,
        total: ep.total,
        errors: ep.errors,
        errorRate: Math.round(errorRate * 10000) / 100,
        p50: Math.round(p50),
        p95: Math.round(p95),
        p99: Math.round(p99),
        avg: Math.round(avg),
        min: sorted[0] ?? 0,
        max: sorted[len - 1] ?? 0,
        anomaly,
        lastSeen: ep.lastSeen,
      });
    }
    return endpoints.sort((a, b) => b.total - a.total).slice(0, 50);
  }

  diff(traceIdA, traceIdB) {
    const a = this.request(traceIdA);
    const b = this.request(traceIdB);
    if (!a || !b) return null;

    function spanSummary(events) {
      const spans = (events ?? []).filter(e => e.type === "SPAN_FINISHED");
      const byComponent = {};
      const byName = {};
      for (const s of spans) {
        const c = s.component ?? "other";
        if (!byComponent[c]) byComponent[c] = { count: 0, totalMs: 0 };
        byComponent[c].count += 1;
        byComponent[c].totalMs += Number(s.durationMs ?? 0);

        const name = s.className ? `${s.className.split(".").pop()}.${s.methodName ?? ""}` : s.name;
        if (!byName[name]) byName[name] = { count: 0, totalMs: 0, component: c };
        byName[name].count += 1;
        byName[name].totalMs += Number(s.durationMs ?? 0);
      }
      return { spans, byComponent, byName, totalSpans: spans.length };
    }

    const summA = spanSummary(a.events);
    const summB = spanSummary(b.events);

    // Find spans only in A, only in B, or in both with timing diff
    const allNames = new Set([...Object.keys(summA.byName), ...Object.keys(summB.byName)]);
    const spanDiffs = [];
    for (const name of allNames) {
      const inA = summA.byName[name];
      const inB = summB.byName[name];
      spanDiffs.push({
        name,
        component: inA?.component ?? inB?.component,
        inA: inA ? { count: inA.count, totalMs: inA.totalMs } : null,
        inB: inB ? { count: inB.count, totalMs: inB.totalMs } : null,
        diffMs: (inB?.totalMs ?? 0) - (inA?.totalMs ?? 0),
        status: !inA ? "added" : !inB ? "removed" : "both",
      });
    }
    spanDiffs.sort((a, b) => Math.abs(b.diffMs) - Math.abs(a.diffMs));

    return {
      traceA: { traceId: traceIdA, summary: a.summary, componentBreakdown: summA.byComponent, totalSpans: summA.totalSpans },
      traceB: { traceId: traceIdB, summary: b.summary, componentBreakdown: summB.byComponent, totalSpans: summB.totalSpans },
      spanDiffs,
    };
  }

  summarizeRequest(request) {
    const spans = request.events.filter((event) => event.type === "SPAN_FINISHED");
    const durationMs = spans
      .filter((event) => event.component === "http-server")
      .reduce((max, event) => Math.max(max, Number(event.durationMs ?? 0)), 0);

    return {
      traceId: request.traceId,
      requestId: request.requestId,
      service: request.service,
      method: request.method ?? "n/a",
      path: request.path ?? "background",
      status: request.status,
      firstSeen: request.firstSeen,
      lastSeen: request.lastSeen,
      durationMs,
      eventCount: request.events.length,
      errorCount: request.events.filter((event) => event.type === "ERROR" || event.status === "ERROR").length,
      slowSpanCount: request.events.filter((event) => Number(event.durationMs) >= SLOW_METHOD_THRESHOLD_MS).length
    };
  }

  processServiceMetric(event) {
    const service = event.service ?? "unknown-service";
    const summary = this.serviceMetrics.get(service) ?? {
      service,
      eventCount: 0,
      requestCount: 0,
      errorCount: 0
    };

    summary.eventCount += 1;
    if (event.type === "HTTP_REQUEST") {
      summary.requestCount += 1;
    }
    if (event.type === "ERROR" || event.status === "ERROR") {
      summary.errorCount += 1;
    }

    this.serviceMetrics.set(service, summary);
  }

  processComponentMetric(event) {
    const component = event.component ?? "runtime";
    const summary = this.componentMetrics.get(component) ?? {
      component,
      eventCount: 0,
      spanCount: 0,
      totalDurationMs: 0,
      errorCount: 0,
      slowSpanCount: 0
    };

    summary.eventCount += 1;
    if (event.type === "SPAN_FINISHED") {
      summary.spanCount += 1;
      summary.totalDurationMs += Number(event.durationMs ?? 0);
      if (Number(event.durationMs ?? 0) >= SLOW_METHOD_THRESHOLD_MS) {
        summary.slowSpanCount += 1;
      }
    }
    if (event.type === "ERROR" || event.status === "ERROR") {
      summary.errorCount += 1;
    }

    this.componentMetrics.set(component, summary);
  }

  normalizeEvent(event) {
    return {
      ...event,
      timestamp: Number(event.timestamp ?? Date.now()),
      attributes: event.attributes ?? {}
    };
  }

  trim(collection, size) {
    if (collection.length > size) {
      collection.splice(0, collection.length - size);
    }
  }

  trimRequests() {
    if (this.requests.size <= this.maxRequests) {
      return;
    }

    const oldestTraceId = [...this.requests.values()]
      .sort((a, b) => a.lastSeen - b.lastSeen)[0]?.traceId;

    if (oldestTraceId) {
      this.requests.delete(oldestTraceId);
    }
  }

  /* ─── Bookmarks (server-synced saved views) ─── */

  listBookmarks() {
    return [...this.bookmarks.values()].sort((a, b) =>
      (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.savedAt - a.savedAt
    );
  }

  getBookmark(traceId) {
    return this.bookmarks.get(traceId) ?? null;
  }

  upsertBookmark(bookmark) {
    if (!bookmark || !bookmark.traceId) return null;
    const existing = this.bookmarks.get(bookmark.traceId);
    const merged = {
      traceId: bookmark.traceId,
      requestId: bookmark.requestId ?? existing?.requestId,
      method: bookmark.method ?? existing?.method,
      path: bookmark.path ?? existing?.path,
      service: bookmark.service ?? existing?.service,
      status: bookmark.status ?? existing?.status,
      durationMs: bookmark.durationMs ?? existing?.durationMs,
      label: bookmark.label ?? existing?.label ?? "",
      notes: bookmark.notes ?? existing?.notes ?? [],
      tags: bookmark.tags ?? existing?.tags ?? [],
      starred: bookmark.starred ?? existing?.starred ?? false,
      savedAt: existing?.savedAt ?? bookmark.savedAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    this.bookmarks.set(bookmark.traceId, merged);
    return merged;
  }

  deleteBookmark(traceId) {
    return this.bookmarks.delete(traceId);
  }

  importBookmarks(bookmarkArray) {
    if (!Array.isArray(bookmarkArray)) return 0;
    let count = 0;
    for (const b of bookmarkArray) {
      if (b && b.traceId) {
        this.upsertBookmark(b);
        count++;
      }
    }
    return count;
  }

  /**
   * Full service autopsy report payload
   */
  report() {
    const snap = this.snapshot();
    const analytics = this.analytics();
    const diag = this.diagnostics();
    const startup = this.startupSummary();
    const beanG = this.beanGraph();
    const ais = this.architectureScore();

    // Bean inventory
    const beanTotal = this.beanNodes.size;
    const startupBeans = this.startupEvents.filter(e => e.type === "BEAN_CREATION").length;
    const runtimeBeans = Math.max(0, beanTotal - startupBeans);

    // Entity detection (look for beans with "Repository" or "Entity" patterns)
    const entityBeans = [...this.beanNodes.values()].filter(b =>
      /repository|dao|entity|jparepository/i.test(b.className ?? b.id ?? "")
    );
    const controllerBeans = [...this.beanNodes.values()].filter(b =>
      /controller|restcontroller|endpoint/i.test(b.className ?? b.role ?? b.id ?? "")
    );
    const serviceBeans = [...this.beanNodes.values()].filter(b =>
      /service|usecase|facade/i.test(b.className ?? b.role ?? b.id ?? "")
    );

    // Compute overall health score 0-100
    let healthScore = 100;
    const healthDeductions = [];

    // Deduct for errors
    const errorRate = snap.stats.retainedRequests > 0
      ? this.errors.length / snap.stats.retainedRequests : 0;
    if (errorRate > 0.1) {
      const d = Math.min(30, Math.round(errorRate * 100));
      healthScore -= d;
      healthDeductions.push({ reason: `High error rate (${(errorRate * 100).toFixed(1)}%)`, points: d });
    }

    // Deduct for slow spans
    const slowRatio = this.slowSpans.length / Math.max(1, this.events.length);
    if (slowRatio > 0.05) {
      const d = Math.min(20, Math.round(slowRatio * 200));
      healthScore -= d;
      healthDeductions.push({ reason: `${this.slowSpans.length} slow spans detected`, points: d });
    }

    // Deduct for anomalies
    const anomalyCount = analytics.filter(a => a.anomaly).length;
    if (anomalyCount > 0) {
      const d = Math.min(15, anomalyCount * 5);
      healthScore -= d;
      healthDeductions.push({ reason: `${anomalyCount} endpoint anomalies`, points: d });
    }

    // Deduct for God Beans
    if (ais.godBeans.length > 0) {
      const d = Math.min(10, ais.godBeans.length * 2);
      healthScore -= d;
      healthDeductions.push({ reason: `${ais.godBeans.length} God Beans detected`, points: d });
    }

    healthScore = Math.max(0, healthScore);

    // Grade
    const grade = healthScore >= 95 ? "A+" : healthScore >= 90 ? "A" : healthScore >= 85 ? "A-"
      : healthScore >= 80 ? "B+" : healthScore >= 75 ? "B" : healthScore >= 70 ? "B-"
      : healthScore >= 65 ? "C+" : healthScore >= 60 ? "C" : healthScore >= 55 ? "C-"
      : healthScore >= 50 ? "D" : "F";

    // Top bottlenecks
    const bottlenecks = analytics
      .filter(a => a.p95 > 0)
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 5)
      .map(a => ({
        endpoint: a.endpoint,
        p95: a.p95,
        p99: a.p99,
        total: a.total,
        errorRate: a.errorRate,
        anomaly: a.anomaly,
      }));

    // Recommendations
    const recommendations = [];
    if (ais.godBeans.length > 0) {
      recommendations.push({
        severity: "warning",
        title: "Refactor God Beans",
        detail: `${ais.godBeans.length} bean(s) have excessive dependencies (>5). Consider splitting: ${ais.godBeans.slice(0, 3).map(b => b.id).join(", ")}`,
      });
    }
    if (bottlenecks.length > 0 && bottlenecks[0].p95 > 500) {
      recommendations.push({
        severity: "critical",
        title: "Optimize Slow Endpoints",
        detail: `${bottlenecks[0].endpoint} has p95 of ${bottlenecks[0].p95}ms. Add caching, optimize queries, or reduce payload size.`,
      });
    }
    if (anomalyCount > 0) {
      recommendations.push({
        severity: "warning",
        title: "Investigate Latency Regressions",
        detail: `${anomalyCount} endpoint(s) show recent latency spikes vs baseline. Check recent deployments.`,
      });
    }
    if (this.errors.length > 10) {
      recommendations.push({
        severity: "critical",
        title: "Address Runtime Errors",
        detail: `${this.errors.length} errors captured. Top error types: ${[...new Set(this.errors.slice(-20).map(e => e.attributes?.exceptionType ?? e.name ?? "Unknown"))].slice(0, 3).join(", ")}`,
      });
    }
    if (startupBeans > 100) {
      recommendations.push({
        severity: "info",
        title: "Consider Lazy Bean Initialization",
        detail: `${startupBeans} beans created at startup. Use @Lazy or spring.main.lazy-initialization=true to improve boot time.`,
      });
    }
    if (beanTotal > 0 && entityBeans.length === 0) {
      recommendations.push({
        severity: "info",
        title: "No Repository/Entity Beans Detected",
        detail: "If this app uses JPA, ensure repository beans are properly instrumented.",
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      serviceName: [...this.serviceMetrics.keys()][0] ?? "Unknown Service",
      healthScore,
      grade,
      healthDeductions,
      stats: snap.stats,
      beanInventory: {
        total: beanTotal,
        startup: startupBeans,
        runtime: runtimeBeans,
        controllers: controllerBeans.length,
        services: serviceBeans.length,
        repositories: entityBeans.length,
        controllerNames: controllerBeans.map(b => b.id),
        serviceNames: serviceBeans.map(b => b.id),
        repositoryNames: entityBeans.map(b => b.id),
      },
      endpointSummary: analytics.slice(0, 20),
      bottlenecks,
      slowSpanSummary: diag.slowSpans.slice(-20).map(s => ({
        name: s.name,
        component: s.component,
        durationMs: s.durationMs,
        className: s.className,
        methodName: s.methodName,
      })),
      errorSummary: {
        totalErrors: this.errors.length,
        recentErrors: this.errors.slice(-10).map(e => ({
          name: e.name,
          type: e.attributes?.exceptionType ?? "Unknown",
          message: e.attributes?.exceptionMessage ?? "",
          timestamp: e.timestamp,
        })),
      },
      startupInfo: {
        lifecycleEventCount: startup.lifecycle.length,
        autoConfigTotal: startup.autoConfiguration.totalSources,
        autoConfigMatched: startup.autoConfiguration.matchedSources,
        autoConfigUnmatched: startup.autoConfiguration.unmatchedSources,
      },
      architectureScore: ais,
      recommendations,
    };
  }

  /**
   * Architecture Intelligence Score
   */
  architectureScore() {
    const nodes = [...this.beanNodes.values()];
    const edges = [...this.beanEdges.values()];
    const analytics = this.analytics();
    const diag = this.diagnostics();

    // Build adjacency
    const outDegree = new Map();
    const inDegree = new Map();
    for (const e of edges) {
      outDegree.set(e.source, (outDegree.get(e.source) ?? 0) + 1);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }

    // God Beans: nodes with >5 outgoing dependencies
    const godBeans = nodes
      .map(n => ({ ...n, dependencyCount: outDegree.get(n.id) ?? 0 }))
      .filter(n => n.dependencyCount > 5)
      .sort((a, b) => b.dependencyCount - a.dependencyCount);

    // Orphan Beans: nodes with 0 incoming and 0 outgoing edges
    const orphanBeans = nodes.filter(n =>
      (outDegree.get(n.id) ?? 0) === 0 && (inDegree.get(n.id) ?? 0) === 0
    );

    // Hub Beans: most depended upon (high in-degree)
    const hubBeans = nodes
      .map(n => ({ ...n, dependentCount: inDegree.get(n.id) ?? 0 }))
      .filter(n => n.dependentCount > 3)
      .sort((a, b) => b.dependentCount - a.dependentCount)
      .slice(0, 10);

    // Circular dependency detection (simplified: check for A->B && B->A)
    const edgeSet = new Set(edges.map(e => `${e.source}->${e.target}`));
    const circularPairs = edges.filter(e => edgeSet.has(`${e.target}->${e.source}`))
      .map(e => [e.source, e.target])
      .filter((pair, i, arr) => arr.findIndex(p =>
        (p[0] === pair[0] && p[1] === pair[1]) || (p[0] === pair[1] && p[1] === pair[0])
      ) === i);

    // Dependency chain depth (BFS from each root)
    const roots = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0);
    let maxChainDepth = 0;
    let deepestChain = [];
    for (const root of roots.slice(0, 50)) {
      const visited = new Set();
      const queue = [{ id: root.id, depth: 0, path: [root.id] }];
      while (queue.length > 0) {
        const { id, depth, path } = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        if (depth > maxChainDepth) {
          maxChainDepth = depth;
          deepestChain = path;
        }
        for (const e of edges) {
          if (e.source === id && !visited.has(e.target)) {
            queue.push({ id: e.target, depth: depth + 1, path: [...path, e.target] });
          }
        }
      }
    }

    // Startup tax — beans with creation time
    const beanCreationEvents = this.startupEvents.filter(e => e.type === "BEAN_CREATION" && e.durationMs);
    const startupTax = beanCreationEvents
      .map(e => ({ bean: e.name, durationMs: Number(e.durationMs ?? 0) }))
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 10);

    // Zombie endpoints: endpoints with 0 calls in recent window
    const zombieEndpoints = analytics.filter(a => {
      const age = Date.now() - a.lastSeen;
      return age > 600_000 && a.total < 3; // older than 10min and <3 calls
    });

    // Dimension scores (0-100)
    const complexity = Math.max(0, 100 - (godBeans.length * 10) - (circularPairs.length * 15) - Math.max(0, (maxChainDepth - 5) * 5));
    const performance = Math.max(0, 100 - (analytics.filter(a => a.p95 > 500).length * 10) - (diag.slowSpans.length > 20 ? 20 : diag.slowSpans.length));
    const reliability = Math.max(0, 100 - (this.errors.length > 50 ? 30 : this.errors.length * 0.6) - (analytics.filter(a => a.errorRate > 5).length * 8));
    const maintainability = Math.max(0, 100 - (orphanBeans.length > 20 ? 15 : 0) - (godBeans.length * 8) - (nodes.length > 200 ? 10 : 0));
    const scalability = Math.max(0, 100 - (analytics.filter(a => a.anomaly).length * 12) - (hubBeans.length > 5 ? 15 : 0));

    const overallScore = Math.round((complexity + performance + reliability + maintainability + scalability) / 5);
    const overallGrade = overallScore >= 95 ? "A+" : overallScore >= 90 ? "A" : overallScore >= 85 ? "A-"
      : overallScore >= 80 ? "B+" : overallScore >= 75 ? "B" : overallScore >= 70 ? "B-"
      : overallScore >= 65 ? "C+" : overallScore >= 60 ? "C" : overallScore >= 55 ? "C-"
      : overallScore >= 50 ? "D" : "F";

    return {
      overallScore,
      overallGrade,
      dimensions: {
        complexity: Math.round(complexity),
        performance: Math.round(performance),
        reliability: Math.round(reliability),
        maintainability: Math.round(maintainability),
        scalability: Math.round(scalability),
      },
      godBeans: godBeans.slice(0, 10),
      orphanBeans: orphanBeans.slice(0, 20),
      hubBeans,
      circularDependencies: circularPairs.slice(0, 10),
      maxChainDepth,
      deepestChain: deepestChain.slice(0, 15),
      startupTax,
      zombieEndpoints: zombieEndpoints.slice(0, 10),
      totalBeans: nodes.length,
      totalEdges: edges.length,
      totalEndpoints: analytics.length,
    };
  }
}
