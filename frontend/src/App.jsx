import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Bell, Bookmark, Box, Clock, Crosshair, Flame, GitBranch, GitCompare, HelpCircle, LayoutDashboard,
  List, Network, Play, Pause, Radio, Search, Server, Settings, Stethoscope, Target, Terminal, TrendingUp, Zap, Rocket,
  Skull, Award
} from "lucide-react";
import LiveTailPage from "./components/LiveTailPage.jsx";
import EndpointAnalyticsPage from "./components/EndpointAnalyticsPage.jsx";
import FaqPage from "./components/FaqPage.jsx";
import NerdConsole from "./components/NerdConsole.jsx";
import OnboardingPage from "./components/OnboardingPage.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import TraceDiffPage from "./components/TraceDiffPage.jsx";
import ServiceAutopsyPage from "./components/ServiceAutopsyPage.jsx";
import ArchitectureScorePage from "./components/ArchitectureScorePage.jsx";
import FlameGraphPage from "./components/FlameGraphPage.jsx";
import SLOTrackerPage from "./components/SLOTrackerPage.jsx";
import AlertRulesPage from "./components/AlertRulesPage.jsx";
import DependencyImpactPage from "./components/DependencyImpactPage.jsx";
import SavedViewsPage from "./components/SavedViewsPage.jsx";
import { ToastProvider, useToast } from "./components/ToastProvider.jsx";
import BeanGraph from "./components/BeanGraph.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import DiagnosticsPanel from "./components/DiagnosticsPanel.jsx";
import ReplayPanel from "./components/ReplayPanel.jsx";
import RequestExplorer from "./components/RequestExplorer.jsx";
import RequestFlow from "./components/RequestFlow.jsx";
import ServiceMapPage from "./components/ServiceMapPage.jsx";
import StartupPanel from "./components/StartupPanel.jsx";
import TimelineView from "./components/TimelineView.jsx";
import {
  apiBase, authFetch, formatDuration, formatTimestamp, healthClassName, websocketUrl
} from "./utils.js";

const PAGES = [
  { id: "onboarding", label: "Get Started",       icon: Zap,             group: "observe" },
  { id: "traces",      label: "Trace Explorer",    icon: Activity,        group: "observe" },
  { id: "dashboard",   label: "Dashboard",         icon: LayoutDashboard, group: "observe" },
  { id: "flame",       label: "Flame Graph",       icon: Flame,           group: "observe" },
  { id: "startup",     label: "Boot Sequence",      icon: Rocket,          group: "observe" },
  { id: "analytics",   label: "Endpoint Analytics", icon: TrendingUp,      group: "observe" },
  { id: "autopsy",     label: "Service Autopsy",    icon: Skull,           group: "observe" },
  { id: "ais",         label: "Architecture Score",  icon: Award,           group: "observe" },
  { id: "topology",    label: "Service Topology",   icon: Network,         group: "observe" },
  { id: "livetail",    label: "Live Tail",          icon: Radio,           group: "observe" },
  { id: "beans",       label: "Bean Graph",         icon: GitBranch,       group: "inspect" },
  { id: "impact",      label: "Blast Radius",       icon: Crosshair,       group: "inspect" },
  { id: "diff",        label: "Trace Diff",         icon: GitCompare,      group: "inspect" },
  { id: "diagnostics", label: "Diagnostics",        icon: Stethoscope,     group: "inspect" },
  { id: "replay",      label: "Request Replay",     icon: Play,            group: "inspect" },
  { id: "nerd",        label: "Nerd Console",       icon: Terminal,        group: "inspect" },
  { id: "slo",         label: "SLO Tracker",        icon: Target,          group: "govern" },
  { id: "alerts",      label: "Alert Rules",        icon: Bell,            group: "govern" },
  { id: "saved",       label: "Saved Views",        icon: Bookmark,        group: "govern" },
  { id: "settings",    label: "Settings",           icon: Settings,        group: "support" },
  { id: "faq",         label: "FAQ",                icon: HelpCircle,      group: "support" },
];

const EMPTY_SNAPSHOT = {
  stats: {},
  recentEvents: [],
  requests: [],
  beanGraph: { nodes: [], links: [] },
  startup: { lifecycle: [], recentEvents: [], autoConfiguration: {} },
  diagnostics: { errors: [], slowSpans: [], hottestComponents: [], services: [] },
  endpointAnalytics: []
};

/* Time range options */
const TIME_RANGES = [
  { label: "Last 1 min", ms: 60_000 },
  { label: "Last 5 min", ms: 300_000 },
  { label: "Last 15 min", ms: 900_000 },
  { label: "Last 1 hr", ms: 3_600_000 },
  { label: "All time", ms: 0 },
];

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  // ─── URL deep linking ───
  const parseHash = () => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const [page, ...rest] = hash.split("/");
    const traceId = rest.join("/") || "";
    return { page: page || "onboarding", traceId };
  };

  const initial = parseHash();
  const [activePage, setActivePage] = useState(initial.page);
  const addToast = useToast();
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [selectedTraceId, setSelectedTraceId] = useState(initial.traceId);
  const [selectedTrace, setSelectedTrace] = useState(null);
  const [replayEvents, setReplayEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [timeRange, setTimeRange] = useState(0);
  const [connectionState, setConnectionState] = useState("connecting");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);

  // Sync state → URL hash
  useEffect(() => {
    const hash = selectedTraceId
      ? `#${activePage}/${selectedTraceId}`
      : `#${activePage}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [activePage, selectedTraceId]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const { page, traceId } = parseHash();
      setActivePage(page);
      if (traceId) setSelectedTraceId(traceId);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ─── Command palette handler ───
  const handleCmdClose = useCallback((action) => {
    if (action === "toggle") setCmdOpen(o => !o);
    else setCmdOpen(false);
  }, []);

  const handleCmdNavigate = useCallback((pageId, traceId) => {
    setActivePage(pageId);
    if (traceId) setSelectedTraceId(traceId);
  }, []);

  // ─── Data fetching ───
  useEffect(() => {
    let cancelled = false;
    async function fetchSnapshot() {
      try {
        const r = await authFetch(`${apiBase()}/api/snapshot`);
        if (!r.ok) throw new Error();
        const p = await r.json();
        if (!cancelled) startTransition(() => { setSnapshot(p); setLastUpdated(Date.now()); });
      } catch { if (!cancelled) setConnectionState("api-offline"); }
    }
    fetchSnapshot();
    const iv = setInterval(fetchSnapshot, 3000);
    const ws = new WebSocket(websocketUrl());
    ws.addEventListener("open", () => setConnectionState("live"));
    ws.addEventListener("close", () => setConnectionState("offline"));
    ws.addEventListener("error", () => setConnectionState("offline"));
    ws.addEventListener("message", (m) => {
      const d = JSON.parse(m.data);
      if (d.type === "snapshot") startTransition(() => { setSnapshot(d.payload); setLastUpdated(Date.now()); });
      if (d.type === "events") startTransition(() => {
        setSnapshot(c => ({ ...c, recentEvents: [...(c.recentEvents ?? []), ...d.payload].slice(-1000) }));
      });
    });
    return () => { cancelled = true; clearInterval(iv); ws.close(); };
  }, []);

  const filteredRequests = useMemo(() => {
    const now = Date.now();
    return (snapshot.requests ?? []).filter(r => {
      const ms = statusFilter === "ALL" || r.status === statusFilter;
      const n = deferredQuery.trim().toLowerCase();
      const mq = !n || [r.traceId, r.requestId, r.method, r.path, r.service].filter(Boolean).some(v => String(v).toLowerCase().includes(n));
      // Normalize lastSeen: if it looks like seconds (< 1e12), convert to ms
      const ls = r.lastSeen > 0 && r.lastSeen < 1e12 ? r.lastSeen * 1000 : r.lastSeen;
      const inTimeRange = timeRange === 0 || (now - ls) <= timeRange;
      return ms && mq && inTimeRange;
    });
  }, [deferredQuery, snapshot.requests, statusFilter, timeRange]);

  // Time-filtered recent events (for pages that show event feeds)
  const filteredEvents = useMemo(() => {
    if (timeRange === 0) return snapshot.recentEvents ?? [];
    const now = Date.now();
    return (snapshot.recentEvents ?? []).filter(e => {
      const ts = e.timestamp > 0 && e.timestamp < 1e12 ? e.timestamp * 1000 : e.timestamp;
      return (now - ts) <= timeRange;
    });
  }, [snapshot.recentEvents, timeRange]);

  // Time-filtered diagnostics
  const filteredDiagnostics = useMemo(() => {
    if (timeRange === 0) return snapshot.diagnostics ?? {};
    const now = Date.now();
    const inRange = (e) => {
      const ts = e.timestamp > 0 && e.timestamp < 1e12 ? e.timestamp * 1000 : e.timestamp;
      return (now - ts) <= timeRange;
    };
    const diag = snapshot.diagnostics ?? {};
    return {
      ...diag,
      errors: (diag.errors ?? []).filter(inRange),
      slowSpans: (diag.slowSpans ?? []).filter(inRange),
    };
  }, [snapshot.diagnostics, timeRange]);

  // Time-filtered snapshot for pages that take the full snapshot
  const filteredSnapshot = useMemo(() => {
    if (timeRange === 0) return snapshot;
    return {
      ...snapshot,
      requests: filteredRequests,
      recentEvents: filteredEvents,
      diagnostics: filteredDiagnostics,
    };
  }, [snapshot, timeRange, filteredRequests, filteredEvents, filteredDiagnostics]);

  useEffect(() => {
    if (!selectedTraceId && filteredRequests[0]?.traceId) setSelectedTraceId(filteredRequests[0].traceId);
    if (selectedTraceId && !filteredRequests.some(r => r.traceId === selectedTraceId) && filteredRequests[0]?.traceId)
      setSelectedTraceId(filteredRequests[0].traceId);
  }, [filteredRequests, selectedTraceId]);

  useEffect(() => {
    if (!selectedTraceId) { setSelectedTrace(null); return; }
    let c = false;
    authFetch(`${apiBase()}/api/requests/${selectedTraceId}`)
      .then(r => r.ok ? r.json() : null).then(p => { if (!c) setSelectedTrace(p); })
      .catch(() => { if (!c) setSelectedTrace(null); });
    return () => { c = true; };
  }, [selectedTraceId]);

  const selectedSummary = selectedTrace?.summary ?? filteredRequests.find(r => r.traceId === selectedTraceId) ?? null;

  async function loadReplay(traceId) {
    if (!traceId) return;
    const r = await authFetch(`${apiBase()}/api/requests/${traceId}/replay`);
    if (r.ok) { const p = await r.json(); setReplayEvents(p.events ?? []); setActivePage("replay"); }
  }

  // ─── Render ───
  return (
    <div className="app-layout">
      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={handleCmdClose}
        onNavigate={handleCmdNavigate} requests={filteredRequests} />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Zap size={20} />
          DevTrace Studio
        </div>
        <div className="sidebar-section-label">Observe</div>
        <nav className="sidebar-nav">
          {PAGES.filter(p => p.group === "observe").map(p => (
            <button key={p.id} className={`sidebar-link ${activePage === p.id ? "active" : ""}`}
              onClick={() => setActivePage(p.id)}>
              <p.icon size={18} /> {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label">Inspect</div>
        <nav className="sidebar-nav">
          {PAGES.filter(p => p.group === "inspect").map(p => (
            <button key={p.id} className={`sidebar-link ${activePage === p.id ? "active" : ""}`}
              onClick={() => setActivePage(p.id)}>
              <p.icon size={18} /> {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label">Govern</div>
        <nav className="sidebar-nav">
          {PAGES.filter(p => p.group === "govern").map(p => (
            <button key={p.id} className={`sidebar-link ${activePage === p.id ? "active" : ""}`}
              onClick={() => setActivePage(p.id)}>
              <p.icon size={18} /> {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-label">Support</div>
        <nav className="sidebar-nav">
          {PAGES.filter(p => p.group === "support").map(p => (
            <button key={p.id} className={`sidebar-link ${activePage === p.id ? "active" : ""}`}
              onClick={() => setActivePage(p.id)}>
              <p.icon size={18} /> {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`connection-badge ${connectionState}`}>
            <span className="connection-dot" />
            {connectionState === "live" ? "Connected" : connectionState === "offline" ? "Disconnected" : connectionState === "api-offline" ? "API Offline" : "Connecting…"}
          </div>
        </div>
      </aside>

      {/* Header */}
      <header className="app-header">
        <div className="header-search" onClick={() => setCmdOpen(true)} style={{ cursor: "pointer" }}>
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search traces… or ⌘K for commands" />
          <kbd style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--bg-card)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>⌘K</kbd>
        </div>
        <div className="header-right">
          <select className="trace-filter-select" value={timeRange} onChange={e => setTimeRange(Number(e.target.value))}>
            {TIME_RANGES.map(t => <option key={t.ms} value={t.ms}>{t.label}</option>)}
          </select>
          {timeRange > 0 && (
            <div className="header-stat" style={{ color: "var(--accent)", borderColor: "rgba(96,165,250,0.3)" }}>
              <Activity size={14}/> <strong>{filteredRequests.length}</strong>/{snapshot.requests?.length ?? 0} traces
            </div>
          )}
          <div className="header-stat"><Activity size={14}/> <strong>{snapshot.stats?.retainedEvents ?? 0}</strong> events</div>
          <div className="header-stat"><Server size={14}/> <strong>{snapshot.stats?.services ?? 0}</strong> services</div>
          <div className="header-stat"><Clock size={14}/> {formatTimestamp(lastUpdated)}</div>
        </div>
      </header>

      {/* Content */}
      <main className="app-content">
        {activePage === "onboarding" && (
          <OnboardingPage connectionState={connectionState} stats={snapshot.stats}
            onNavigate={setActivePage} />
        )}
        {activePage === "traces" && (
          <TracesPage
            requests={filteredRequests} selectedTraceId={selectedTraceId}
            selectedTrace={selectedTrace} selectedSummary={selectedSummary}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            onSelectTrace={id => { setSelectedTraceId(id); setReplayEvents([]); }}
            onReplay={loadReplay}
          />
        )}
        {activePage === "dashboard" && (
          <DashboardPage snapshot={filteredSnapshot} />
        )}
        {activePage === "startup" && (
          <div className="trace-detail">
            <div className="page-header"><h1>Boot Sequence</h1></div>
            <StartupPanel startup={snapshot.startup} stats={snapshot.stats} />
          </div>
        )}
        {activePage === "beans" && (
          <BeanGraph graph={snapshot.beanGraph} />
        )}
        {activePage === "analytics" && (
          <EndpointAnalyticsPage analytics={snapshot.endpointAnalytics}
            requests={filteredRequests} recentEvents={filteredEvents}
            diagnostics={filteredDiagnostics}
            onSelectTrace={(id) => { setSelectedTraceId(id); setActivePage("traces"); }} />
        )}
        {activePage === "autopsy" && (
          <ServiceAutopsyPage snapshot={filteredSnapshot} />
        )}
        {activePage === "ais" && (
          <ArchitectureScorePage snapshot={filteredSnapshot} />
        )}
        {activePage === "diff" && (
          <TraceDiffPage requests={filteredRequests} />
        )}
        {activePage === "diagnostics" && (
          <div className="trace-detail">
            <div className="page-header"><h1>Diagnostics</h1></div>
            <DiagnosticsPanel diagnostics={filteredDiagnostics}
              selectedTrace={selectedSummary} recentEvents={filteredEvents} />
          </div>
        )}
        {activePage === "replay" && (
          <div className="trace-detail">
            <div className="page-header">
              <h1>Request Replay</h1>
              {selectedTraceId && <button className="btn btn-primary" onClick={() => loadReplay(selectedTraceId)}>
                <Play size={14}/> Load Selected Trace
              </button>}
            </div>
            <ReplayPanel events={replayEvents} />
          </div>
        )}
        {activePage === "nerd" && (
          <NerdConsole recentEvents={filteredEvents} snapshot={filteredSnapshot} />
        )}
        {activePage === "settings" && (
          <SettingsPage />
        )}
        {activePage === "faq" && (
          <FaqPage />
        )}
        {activePage === "topology" && (
          <ServiceMapPage requests={filteredRequests} recentEvents={filteredEvents} />
        )}
        {activePage === "flame" && (
          <FlameGraphPage requests={filteredRequests} />
        )}
        {activePage === "slo" && (
          <SLOTrackerPage analytics={snapshot.endpointAnalytics} />
        )}
        {activePage === "alerts" && (
          <AlertRulesPage analytics={snapshot.endpointAnalytics} diagnostics={filteredDiagnostics} />
        )}
        {activePage === "impact" && (
          <DependencyImpactPage snapshot={filteredSnapshot} />
        )}
        {activePage === "saved" && (
          <SavedViewsPage requests={filteredRequests}
            onSelectTrace={(id) => { setSelectedTraceId(id); }}
            onNavigate={setActivePage} />
        )}
        {activePage === "livetail" && (
          <LiveTailPage recentEvents={filteredEvents} snapshot={filteredSnapshot} />
        )}
      </main>
    </div>
  );
}

/* ─── Traces Page (split view) ─── */
function TracesPage({ requests, selectedTraceId, selectedTrace, selectedSummary, statusFilter, setStatusFilter, onSelectTrace, onReplay }) {
  return (
    <>
      <div className="page-header">
        <h1>Trace Explorer</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="trace-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="200">200 OK</option>
            <option value="201">201 Created</option>
            <option value="404">404 Not Found</option>
            <option value="500">500 Server Error</option>
            <option value="ERROR">All Errors</option>
          </select>
          <button className="btn btn-primary" disabled={!selectedTraceId} onClick={() => onReplay(selectedTraceId)}>
            <Play size={14}/> Replay
          </button>
        </div>
      </div>
      <div className="trace-split">
        <div className="trace-split-list">
          <RequestExplorer requests={requests} selectedTraceId={selectedTraceId} onSelectTrace={onSelectTrace} />
        </div>
        <div className="trace-split-detail">
          {selectedSummary ? (
            <div className="trace-detail">
              <RequestIntelligence summary={selectedSummary} events={selectedTrace?.events ?? []} />

              <div className="card trace-summary-card">
                <div className="trace-summary-header">
                  <div className="trace-summary-route">
                    <span className="trace-summary-method">{selectedSummary.method}</span>
                    <span className="trace-summary-path" title={selectedSummary.path}>{selectedSummary.path}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <StatusBadge status={selectedSummary.status} />
                    <CopyButton text={selectedTraceId} label="Trace ID" />
                    <CopyButton text={JSON.stringify(selectedSummary, null, 2)} label="JSON" />
                  </div>
                </div>
                <div className="trace-meta">
                  <TraceDatum label="Service" value={selectedSummary.service ?? "unknown"} />
                  <TraceDatum label="Total Duration" value={formatDuration(selectedSummary.durationMs)} />
                  <TraceDatum label="Events" value={selectedSummary.eventCount} />
                  <TraceDatum label="Slow spans" value={selectedSummary.slowSpanCount} />
                  <TraceDatum label="Request ID" value={selectedSummary.requestId ?? "n/a"} />
                  <TraceDatum label="Status" value={selectedSummary.status}
                    className={selectedSummary.status === "ERROR" ? "error" : "ok"} />
                </div>
              </div>
              <TimelineView events={selectedTrace?.events ?? []} />
              <RequestFlow events={selectedTrace?.events ?? []} />
            </div>
          ) : (
            <div className="empty-state" style={{ minHeight: 400 }}>
              <Activity size={40} />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Select a trace</h3>
              <p>Choose a request from the list to see its full execution detail.<br/>
              <small style={{ color: "var(--text-muted)" }}>Send traffic to your instrumented Spring Boot app and traces appear automatically.</small></p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Request Intelligence Summary ─── */
function RequestIntelligence({ summary, events }) {
  const spans = (events ?? []).filter(e => e.type === "SPAN_FINISHED");
  const layers = new Set(spans.map(s => s.component).filter(Boolean));
  const sqlEvents = events.filter(e => e.type === "SQL_STATEMENT" || e.component === "database");
  const outbound = spans.filter(s => s.component === "http-client");
  const errors = events.filter(e => e.type === "ERROR" || e.status === "ERROR");
  const controllerSpans = spans.filter(s => s.component === "controller");
  const serviceSpans = spans.filter(s => s.component === "service");
  const repoSpans = spans.filter(s => s.component === "repository");
  const asyncSpans = spans.filter(s => s.component === "async");

  // Build human sentence
  const parts = [];
  if (controllerSpans.length) parts.push(`${controllerSpans.length} controller method${controllerSpans.length > 1 ? "s" : ""}`);
  if (serviceSpans.length) parts.push(`${serviceSpans.length} service call${serviceSpans.length > 1 ? "s" : ""}`);
  if (repoSpans.length) parts.push(`${repoSpans.length} repository quer${repoSpans.length > 1 ? "ies" : "y"}`);
  if (sqlEvents.length) parts.push(`${sqlEvents.length} SQL statement${sqlEvents.length > 1 ? "s" : ""}`);
  if (outbound.length) parts.push(`${outbound.length} outbound HTTP call${outbound.length > 1 ? "s" : ""}`);
  if (asyncSpans.length) parts.push(`${asyncSpans.length} async handoff${asyncSpans.length > 1 ? "s" : ""}`);

  const sentence = parts.length > 0
    ? `This request touched ${parts.join(", ")}.`
    : spans.length > 0
      ? `This request completed with ${spans.length} span${spans.length > 1 ? "s" : ""}.`
      : "Waiting for span data…";

  return (
    <div className="card" style={{ background: errors.length > 0 ? "var(--red-glow)" : "var(--accent-glow)", borderColor: errors.length > 0 ? "rgba(248,113,113,0.2)" : "rgba(96,165,250,0.2)" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        {errors.length > 0 ? "Request Analysis" : "Request Analysis"}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
        {sentence}
        {summary.durationMs > 0 && <> Total duration: <strong>{formatDuration(summary.durationMs)}</strong>.</>}
        {errors.length > 0 && <span style={{ color: "var(--red)" }}> {errors.length} error{errors.length > 1 ? "s" : ""} detected.</span>}
      </div>
      {/* Layer chips */}
      {layers.size > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {[...layers].map(l => (
            <span key={l} className="chip" style={{
              background: l === "http-server" ? "var(--green-glow)" : l === "database" || l === "repository" ? "rgba(167,139,250,0.12)" : l === "http-client" ? "rgba(56,189,248,0.12)" : l === "controller" ? "rgba(251,113,133,0.12)" : "var(--accent-glow)",
              color: l === "http-server" ? "var(--green)" : l === "database" || l === "repository" ? "var(--purple)" : l === "http-client" ? "#38bdf8" : l === "controller" ? "#fb7185" : "var(--accent)"
            }}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Dashboard Page ─── */
function DashboardPage({ snapshot }) {
  const { stats = {}, diagnostics = {}, recentEvents = [], requests = [], endpointAnalytics = [] } = snapshot;

  // Compute throughput sparkline (events per second, last 60 buckets of 1s)
  const sparkline = useMemo(() => {
    const now = Date.now();
    const buckets = new Array(60).fill(0);
    (recentEvents ?? []).forEach(e => {
      const ts = e.timestamp > 0 && e.timestamp < 1e12 ? e.timestamp * 1000 : e.timestamp;
      const age = Math.floor((now - ts) / 1000);
      if (age >= 0 && age < 60) buckets[59 - age] += 1;
    });
    return buckets;
  }, [recentEvents]);

  // Error rate (last 60s)
  const errorStats = useMemo(() => {
    const now = Date.now();
    let total = 0, errors = 0;
    (requests ?? []).forEach(r => {
      const ls = r.lastSeen > 0 && r.lastSeen < 1e12 ? r.lastSeen * 1000 : r.lastSeen;
      if ((now - ls) <= 60000) {
        total += 1;
        if (r.status === "ERROR" || String(r.status).startsWith("5")) errors += 1;
      }
    });
    return { total, errors, rate: total > 0 ? ((errors / total) * 100).toFixed(1) : "0.0" };
  }, [requests]);

  // Latest requests (last 8)
  const latestRequests = useMemo(() => {
    return [...(requests ?? [])].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 8);
  }, [requests]);

  // Top slow endpoints
  const topSlow = useMemo(() => {
    return [...(endpointAnalytics ?? [])].sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0)).slice(0, 5);
  }, [endpointAnalytics]);

  const peakThroughput = Math.max(1, ...sparkline);

  return (
    <>
      <div className="page-header"><h1>Dashboard</h1></div>

      {/* Metrics row */}
      <div className="metrics-row">
        <MetricCard icon={<Activity size={16}/>} label="Throughput (60s)" value={sparkline.reduce((a, b) => a + b, 0)} />
        <MetricCard icon={<List size={16}/>} label="Events Retained" value={stats.retainedEvents ?? 0} />
        <MetricCard icon={<Box size={16}/>} label="Beans Mapped" value={stats.beanNodes ?? 0} />
        <MetricCard icon={<Server size={16}/>} label="Services" value={stats.services ?? 0} />
      </div>

      <div className="dashboard-grid">
        {/* Throughput Sparkline */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Request Throughput</span>
            <span className="card-badge">{sparkline[sparkline.length - 1]} evt/s</span>
          </div>
          <div className="dash-sparkline">
            {sparkline.map((v, i) => (
              <div key={i} className="dash-spark-bar" style={{
                height: `${Math.max(2, (v / peakThroughput) * 100)}%`,
                background: v > peakThroughput * 0.8 ? "var(--amber)" : "var(--accent)",
                opacity: 0.4 + (i / sparkline.length) * 0.6,
              }} />
            ))}
          </div>
          <div className="dash-spark-labels">
            <span>60s ago</span><span>now</span>
          </div>
        </div>

        {/* Error Rate Gauge */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Error Rate (60s)</span>
            <span className="card-badge">{errorStats.errors}/{errorStats.total} reqs</span>
          </div>
          <div className="dash-gauge-wrap">
            <div className="dash-gauge-ring">
              <svg viewBox="0 0 120 120" width="100" height="100">
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke={Number(errorStats.rate) > 10 ? "var(--red)" : Number(errorStats.rate) > 0 ? "var(--amber)" : "var(--green)"}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - Math.min(1, Number(errorStats.rate) / 100))}`}
                  transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
              </svg>
              <div className="dash-gauge-value" style={{
                color: Number(errorStats.rate) > 10 ? "var(--red)" : Number(errorStats.rate) > 0 ? "var(--amber)" : "var(--green)"
              }}>
                {errorStats.rate}%
              </div>
            </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Live Activity</span>
            <span className="card-badge">{latestRequests.length} recent</span>
          </div>
          <div className="dash-activity-list">
            {latestRequests.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Waiting for requests…</p>
            ) : latestRequests.map(r => (
              <div key={r.traceId} className="dash-activity-row">
                <span className="dash-activity-method" style={{
                  color: r.method === "GET" ? "var(--green)" : r.method === "POST" ? "var(--accent)" :
                    r.method === "DELETE" ? "var(--red)" : "var(--amber)"
                }}>{r.method}</span>
                <span className="dash-activity-path" title={r.path}>{r.path}</span>
                <span className={`dash-activity-status ${r.status === "ERROR" || String(r.status).startsWith("5") ? "is-err" : ""}`}>
                  {r.status === "IN_PROGRESS" ? "…" : r.status}
                </span>
                <span className="dash-activity-dur">{formatDuration(r.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Slow Endpoints */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Slowest Endpoints</span>
            <span className="card-badge">by p95</span>
          </div>
          <div className="dash-slow-list">
            {topSlow.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No endpoint data yet</p>
            ) : topSlow.map(ep => (
              <div key={ep.endpoint} className="dash-slow-row">
                <span className="dash-slow-method" style={{
                  color: ep.method === "GET" ? "var(--green)" : ep.method === "POST" ? "var(--accent)" :
                    ep.method === "DELETE" ? "var(--red)" : "var(--amber)"
                }}>{ep.method}</span>
                <span className="dash-slow-path" title={ep.path}>{ep.path}</span>
                <div className="dash-slow-bar-wrap">
                  <div className="dash-slow-bar" style={{
                    width: `${Math.min(100, (ep.p95 / Math.max(1, topSlow[0].p95)) * 100)}%`,
                    background: ep.p95 > 500 ? "var(--red)" : ep.p95 > 200 ? "var(--amber)" : "var(--green)",
                  }} />
                </div>
                <span className="dash-slow-val" style={{
                  color: ep.p95 > 500 ? "var(--red)" : ep.p95 > 200 ? "var(--amber)" : "var(--text-secondary)"
                }}>{formatDuration(ep.p95)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hot Components */}
        <div className="card">
          <div className="card-header"><span className="card-title">Hot Components</span>
            <span className="card-badge">{(diagnostics.hottestComponents ?? []).length}</span></div>
          <div className="signal-list">
            {(diagnostics.hottestComponents ?? []).length === 0
              ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No data yet</p>
              : (diagnostics.hottestComponents ?? []).slice(0, 6).map(c => (
                <div key={c.component} className="signal-row">
                  <div><strong>{c.component}</strong><br/><small>{c.eventCount} events · {c.slowSpanCount} slow</small></div>
                  <span className="chip">{formatDuration(c.averageDurationMs)}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Services */}
        <div className="card">
          <div className="card-header"><span className="card-title">Services</span>
            <span className="card-badge">{(diagnostics.services ?? []).length}</span></div>
          <div className="signal-list">
            {(diagnostics.services ?? []).length === 0
              ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No services detected</p>
              : (diagnostics.services ?? []).map(s => (
                <div key={s.service} className="signal-row">
                  <div><strong>{s.service}</strong><br/><small>{s.requestCount} reqs · {s.errorCount} errors</small></div>
                  <span className="chip">{s.eventCount} events</span>
                </div>
              ))}
          </div>
        </div>

        {/* Recent Errors */}
        <div className="card full-width">
          <div className="card-header"><span className="card-title">Recent Errors</span>
            <span className="card-badge">{(diagnostics.errors ?? []).length}</span></div>
          <div className="signal-list">
            {(diagnostics.errors ?? []).length === 0
              ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No runtime errors ✓</p>
              : (diagnostics.errors ?? []).slice(-8).reverse().map((e, i) => (
                <div key={e.eventId ?? i} className="signal-row is-error">
                  <div><strong>{e.name}</strong><br/><small>{e.attributes?.exceptionType ?? e.component ?? "runtime"} · {formatTimestamp(e.timestamp)}</small></div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Shared components ─── */
function MetricCard({ icon, label, value }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{icon} {label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function TraceDatum({ label, value, className = "" }) {
  return (
    <div className="trace-datum">
      <div className="trace-datum-label">{label}</div>
      <div className={`trace-datum-value ${className}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const s = String(status).toUpperCase();
  const cls = s === "ERROR" ? "error" : s === "IN_PROGRESS" ? "pending" : "ok";
  return <span className={`status-badge ${cls}`}>{status}</span>;
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="copy-btn" title={`Copy ${label}`} onClick={(e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }}>
      {copied ? "✓" : "⎘"} {label}
    </button>
  );
}

