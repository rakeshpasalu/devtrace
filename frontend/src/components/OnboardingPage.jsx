import { useState } from "react";
import {
  Zap, Terminal, Plug, Send, Check, Copy, ChevronRight, ExternalLink,
  Eye, Activity, GitBranch, Clock, Shield, Search, Layers, Cpu, Database,
  Workflow, Bug, BarChart3, Repeat, Rocket
} from "lucide-react";

/* ═══════════════════════════════════════════════
   Value-first superpowers that a team lead cares about
   ═══════════════════════════════════════════════ */
const SUPERPOWERS = [
  {
    icon: Eye,
    title: "See Every Request End-to-End",
    desc: "Full request flow from controller → service → repository → outbound HTTP → SQL — with exact timing. No more guessing where the 2 seconds went.",
    color: "var(--accent)",
  },
  {
    icon: Bug,
    title: "Find Bugs Without Reproducing",
    desc: "Replay any past request event-by-event. See the exact sequence of calls, thread handoffs, and error points. Share a trace ID with your team instead of a Slack screenshot.",
    color: "var(--red)",
  },
  {
    icon: Clock,
    title: "Spot Slow Methods Instantly",
    desc: "Every span over the threshold is auto-flagged. The diagnostics panel ranks your hottest components so you know exactly where to optimize.",
    color: "var(--amber)",
  },
  {
    icon: GitBranch,
    title: "Understand Bean Dependencies",
    desc: "Interactive graph of every Spring bean and its dependencies. Answer \"what depends on what?\" without reading 40 config files.",
    color: "var(--green)",
  },
  {
    icon: Rocket,
    title: "Watch Your App Boot",
    desc: "See Spring lifecycle events, class loading, auto-configuration decisions, and bean creation as they happen. Debug slow startups in seconds.",
    color: "var(--purple)",
  },
  {
    icon: Database,
    title: "Trace SQL to its Origin",
    desc: "Every Hibernate query is linked back to the request and method that triggered it. See N+1 problems before they hit production.",
    color: "var(--accent)",
  },
];

const USE_CASES = [
  { persona: "New team member", scenario: "\"I just joined — how does order creation work?\"", action: "Open Trace Explorer, hit the order endpoint, see the full call chain in 10 seconds." },
  { persona: "On-call engineer", scenario: "\"Users say checkout is slow but I can't reproduce it.\"", action: "Filter by path, sort by duration, click the slowest trace. The timeline shows a 1.8s outbound call to the payment gateway." },
  { persona: "Architecture review", scenario: "\"Which services depend on the user service?\"", action: "Open Bean Graph. See every dependency. Export the data for your architecture doc." },
  { persona: "Performance sprint", scenario: "\"Where are the top 5 bottlenecks?\"", action: "Open Diagnostics → Hot Components. Ranked by average latency, error count, and invocation frequency." },
  { persona: "Code review", scenario: "\"Does this PR introduce an extra DB call?\"", action: "Run the endpoint before and after. Compare event counts and SQL traces side by side." },
];

const SETUP_STEPS = [
  {
    id: "collector",
    title: "Start the Collector",
    subtitle: "Lightweight Node.js server — just npm start",
    icon: Terminal,
    content: CollectorStep,
  },
  {
    id: "connect",
    title: "Connect Your App",
    subtitle: "Zero-code agent or one-dependency starter",
    icon: Plug,
    content: ConnectStep,
  },
  {
    id: "traffic",
    title: "Send Traffic & Explore",
    subtitle: "Hit an endpoint, traces appear instantly",
    icon: Send,
    content: TrafficStep,
  },
];

export default function OnboardingPage({ connectionState, stats, onNavigate }) {
  const [tab, setTab] = useState("superpowers"); // superpowers | usecases | setup
  const [activeStep, setActiveStep] = useState(0);
  const isConnected = connectionState === "live";
  const hasData = (stats?.retainedEvents ?? 0) > 0;

  return (
    <>
      <div className="page-header">
        <h1>DevTrace Studio</h1>
        {isConnected && hasData && (
          <button className="btn btn-primary" onClick={() => onNavigate("traces")}>
            <ChevronRight size={16} /> Open Trace Explorer
          </button>
        )}
      </div>

      {/* Hero */}
      <div className="onboarding-hero">
        <Zap size={28} className="onboarding-hero-icon" />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>
            {isConnected && hasData
              ? `Live — ${stats?.retainedRequests ?? 0} requests captured across ${stats?.services ?? 0} service(s)`
              : "Runtime observability for Spring Boot — zero code changes"}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            {isConnected && hasData
              ? "Your app is connected. Explore traces, debug requests, understand your architecture."
              : "Attach to any Spring Boot app. See every request, every bean, every SQL query — with exact timing."}
          </p>
        </div>
        {isConnected && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 8px var(--green)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)" }}>Connected</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mode-tabs" style={{ marginBottom: 20 }}>
        <button className={`mode-tab ${tab === "superpowers" ? "active" : ""}`} onClick={() => setTab("superpowers")}>
          <Zap size={14} /> What You Get
        </button>
        <button className={`mode-tab ${tab === "usecases" ? "active" : ""}`} onClick={() => setTab("usecases")}>
          <Layers size={14} /> Real Use Cases
        </button>
        <button className={`mode-tab ${tab === "setup" ? "active" : ""}`} onClick={() => setTab("setup")}>
          <Terminal size={14} /> Quick Setup
        </button>
      </div>

      {/* ─── Superpowers tab ─── */}
      {tab === "superpowers" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {SUPERPOWERS.map((sp, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                background: `${sp.color}15`, color: sp.color, flexShrink: 0
              }}>
                <sp.icon size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{sp.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{sp.desc}</div>
              </div>
            </div>
          ))}

          {/* Quick navigation */}
          {isConnected && hasData && (
            <div className="card" style={{ gridColumn: "1 / -1", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", padding: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", marginRight: 8, alignSelf: "center" }}>Jump to:</span>
              {[
                { id: "traces", label: "Trace Explorer", icon: Activity },
                { id: "dashboard", label: "Dashboard", icon: BarChart3 },
                { id: "startup", label: "Boot Sequence", icon: Rocket },
                { id: "beans", label: "Bean Graph", icon: GitBranch },
                { id: "diagnostics", label: "Diagnostics", icon: Bug },
                { id: "nerd", label: "Nerd Console", icon: Terminal },
              ].map(nav => (
                <button key={nav.id} className="btn btn-ghost" onClick={() => onNavigate(nav.id)} style={{ fontSize: 12 }}>
                  <nav.icon size={14} /> {nav.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Use cases tab ─── */}
      {tab === "usecases" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {USE_CASES.map((uc, i) => (
            <div key={i} className="card" style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 16, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent)", marginBottom: 4 }}>{uc.persona}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, fontStyle: "italic", color: "var(--text-primary)" }}>{uc.scenario}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>→ {uc.action}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Setup tab ─── */}
      {tab === "setup" && (
        <div className="onboarding-layout">
          <div className="onboarding-steps">
            {SETUP_STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = (isConnected && i === 0) || (hasData && i <= 2);
              return (
                <button key={step.id}
                  className={`onboarding-step-btn ${activeStep === i ? "active" : ""} ${done ? "done" : ""}`}
                  onClick={() => setActiveStep(i)}>
                  <div className="onboarding-step-num">
                    {done ? <Check size={14} /> : i + 1}
                  </div>
                  <div>
                    <div className="onboarding-step-title">{step.title}</div>
                    <div className="onboarding-step-sub">{step.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="onboarding-content card">
            {(() => { const StepContent = SETUP_STEPS[activeStep].content; return <StepContent connectionState={connectionState} />; })()}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Shared components ─── */
function CopyBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="copy-block">
      {label && <div className="copy-block-label">{label}</div>}
      <div className="copy-block-body">
        <pre>{code}</pre>
        <button className="copy-block-btn" onClick={handleCopy} title="Copy to clipboard">
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

/* ─── Setup steps ─── */
function CollectorStep({ connectionState }) {
  const isConnected = connectionState === "live";
  return (
    <div className="step-content">
      <h3>Start the collector backend</h3>
      <p>The collector is a lightweight Node.js server that receives, indexes, and streams trace data to this dashboard.</p>
      <CopyBlock label="Terminal" code={`cd backend\nnpm install\nnpm start`} />
      <div className={`step-status ${isConnected ? "ok" : "waiting"}`}>
        <span className="step-status-dot" />
        {isConnected ? "Collector connected — you're good" : "Waiting for collector on port 9000..."}
      </div>
    </div>
  );
}

function ConnectStep() {
  const [mode, setMode] = useState("agent");
  return (
    <div className="step-content">
      <h3>Connect your Spring Boot app</h3>
      <div className="mode-tabs">
        <button className={`mode-tab ${mode === "agent" ? "active" : ""}`} onClick={() => setMode("agent")}>
          <Terminal size={14} /> Java Agent (zero-code)
        </button>
        <button className={`mode-tab ${mode === "starter" ? "active" : ""}`} onClick={() => setMode("starter")}>
          <Plug size={14} /> Spring Starter (deeper insight)
        </button>
      </div>
      {mode === "agent" ? (
        <>
          <p>Attach to any existing Spring Boot jar — <strong>no code changes, no rebuild</strong>:</p>
          <CopyBlock label="Terminal" code={`./scripts/run-boot-app-with-agent.sh \\\n  /path/to/your-app.jar \\\n  --service-name my-service \\\n  --app-packages com.mycompany`} />
          <div className="step-capabilities">
            <h4>What your team gets immediately</h4>
            <ul>
              <li>JVM start & class-loading visibility</li>
              <li>Spring lifecycle events & bean creation</li>
              <li>Full HTTP request → controller → service flow</li>
              <li>Outbound RestTemplate tracing</li>
              <li>Automatic slow-method detection</li>
            </ul>
          </div>
        </>
      ) : (
        <>
          <p>Add one dependency for <strong>deep Spring-aware instrumentation</strong>:</p>
          <CopyBlock label="Maven (pom.xml)" code={`<dependency>\n  <groupId>com.devtrace.studio</groupId>\n  <artifactId>spring-boot-starter-devtrace</artifactId>\n  <version>1.0.0-SNAPSHOT</version>\n</dependency>`} />
          <CopyBlock label="application.yml" code={`devtrace:\n  backend-url: http://127.0.0.1:9000\n  service-name: my-service`} />
          <div className="step-capabilities">
            <h4>Everything from the agent plus</h4>
            <ul>
              <li>Hibernate SQL tracing (with N+1 detection)</li>
              <li>WebClient & async executor propagation</li>
              <li>Bean dependency graph</li>
              <li>Auto-configuration decision reports</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function TrafficStep() {
  return (
    <div className="step-content">
      <h3>Hit an endpoint — traces appear instantly</h3>
      <p>Send any request to your app. If using the sample app:</p>
      <CopyBlock label="Terminal" code={`curl http://127.0.0.1:8080/api/orders/1`} />
      <p style={{ marginTop: 16 }}>Then open <strong>Trace Explorer</strong> — you'll see the full call chain, timing, and any errors within seconds.</p>
      <div className="step-checklist">
        <h4>Quick health check</h4>
        <label className="checklist-item"><input type="checkbox" /> Collector running (green dot in sidebar)</label>
        <label className="checklist-item"><input type="checkbox" /> App launched with agent or starter</label>
        <label className="checklist-item"><input type="checkbox" /> Sent traffic to your app</label>
        <label className="checklist-item"><input type="checkbox" /> Traces visible in Trace Explorer</label>
      </div>
    </div>
  );
}
