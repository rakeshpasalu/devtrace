import { useEffect, useMemo, useRef } from "react";
import {
  AlertOctagon, AlertTriangle, Award, Box, CheckCircle, ChevronRight,
  CircleDot, GitBranch, GitMerge, Loader2, Network, Skull, Target,
  TrendingUp, Zap
} from "lucide-react";

/* ─── Compute AIS from snapshot data (client-side) ─── */
function computeAIS(snapshot) {
  const nodes = snapshot.beanGraph?.nodes ?? [];
  const edges = snapshot.beanGraph?.links ?? [];
  const analytics = snapshot.endpointAnalytics ?? [];
  const diag = snapshot.diagnostics ?? {};
  const errors = diag.errors ?? [];
  const slowSpans = diag.slowSpans ?? [];
  const startupEvts = snapshot.startup?.recentEvents ?? [];

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

  // Orphan Beans
  const orphanBeans = nodes.filter(n =>
    (outDegree.get(n.id) ?? 0) === 0 && (inDegree.get(n.id) ?? 0) === 0
  );

  // Hub Beans
  const hubBeans = nodes
    .map(n => ({ ...n, dependentCount: inDegree.get(n.id) ?? 0 }))
    .filter(n => n.dependentCount > 3)
    .sort((a, b) => b.dependentCount - a.dependentCount)
    .slice(0, 10);

  // Circular dependency detection
  const edgeSet = new Set(edges.map(e => `${e.source}->${e.target}`));
  const seen = new Set();
  const circularPairs = [];
  for (const e of edges) {
    const rev = `${e.target}->${e.source}`;
    const key = [e.source, e.target].sort().join("|");
    if (edgeSet.has(rev) && !seen.has(key)) {
      seen.add(key);
      circularPairs.push([e.source, e.target]);
    }
  }

  // Dependency chain depth
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
      if (depth > maxChainDepth) { maxChainDepth = depth; deepestChain = path; }
      for (const e of edges) {
        if (e.source === id && !visited.has(e.target)) {
          queue.push({ id: e.target, depth: depth + 1, path: [...path, e.target] });
        }
      }
    }
  }

  // Startup tax
  const startupTax = startupEvts
    .filter(e => e.type === "BEAN_CREATION" && e.durationMs)
    .map(e => ({ bean: e.name, durationMs: Number(e.durationMs ?? 0) }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  // Zombie endpoints
  const zombieEndpoints = analytics.filter(a => {
    const age = Date.now() - (a.lastSeen ?? 0);
    return age > 600_000 && a.total < 3;
  });

  // Dimension scores
  const complexity = Math.max(0, 100 - (godBeans.length * 10) - (circularPairs.length * 15) - Math.max(0, (maxChainDepth - 5) * 5));
  const performance = Math.max(0, 100 - (analytics.filter(a => a.p95 > 500).length * 10) - (slowSpans.length > 20 ? 20 : slowSpans.length));
  const reliability = Math.max(0, 100 - (errors.length > 50 ? 30 : errors.length * 0.6) - (analytics.filter(a => a.errorRate > 5).length * 8));
  const maintainability = Math.max(0, 100 - (orphanBeans.length > 20 ? 15 : 0) - (godBeans.length * 8) - (nodes.length > 200 ? 10 : 0));
  const scalability = Math.max(0, 100 - (analytics.filter(a => a.anomaly).length * 12) - (hubBeans.length > 5 ? 15 : 0));

  const overallScore = Math.round((complexity + performance + reliability + maintainability + scalability) / 5);
  const overallGrade = overallScore >= 95 ? "A+" : overallScore >= 90 ? "A" : overallScore >= 85 ? "A-"
    : overallScore >= 80 ? "B+" : overallScore >= 75 ? "B" : overallScore >= 70 ? "B-"
    : overallScore >= 65 ? "C+" : overallScore >= 60 ? "C" : overallScore >= 55 ? "C-"
    : overallScore >= 50 ? "D" : "F";

  return {
    overallScore, overallGrade,
    dimensions: {
      complexity: Math.round(complexity), performance: Math.round(performance),
      reliability: Math.round(reliability), maintainability: Math.round(maintainability),
      scalability: Math.round(scalability),
    },
    godBeans: godBeans.slice(0, 10), orphanBeans: orphanBeans.slice(0, 20), hubBeans,
    circularDependencies: circularPairs.slice(0, 10),
    maxChainDepth, deepestChain: deepestChain.slice(0, 15),
    startupTax, zombieEndpoints: zombieEndpoints.slice(0, 10),
    totalBeans: nodes.length, totalEdges: edges.length, totalEndpoints: analytics.length,
  };
}

/* ─── Radar Chart (pure Canvas, no deps) ─── */
function RadarChart({ dimensions, size = 280 }) {
  const canvasRef = useRef(null);
  const labels = Object.keys(dimensions);
  const values = Object.values(dimensions);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 40;
    const n = labels.length;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    function getPoint(i, val) {
      const angle = startAngle + i * angleStep;
      const r = (val / 100) * radius;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    }

    ctx.clearRect(0, 0, size, size);

    // Background rings
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach(frac => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const p = getPoint(i, frac * 100);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Axis lines
    for (let i = 0; i < n; i++) {
      const p = getPoint(i, 100);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Data polygon (gradient fill)
    ctx.beginPath();
    values.forEach((v, i) => {
      const p = getPoint(i, v);
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, "rgba(96,165,250,0.3)");
    grad.addColorStop(1, "rgba(167,139,250,0.15)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke
    ctx.strokeStyle = "rgba(96,165,250,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points with glow
    values.forEach((v, i) => {
      const p = getPoint(i, v);
      // Glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(96,165,250,0.3)";
      ctx.fill();
      // Dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = v >= 80 ? "#34d399" : v >= 60 ? "#fbbf24" : "#f87171";
      ctx.fill();
    });

    // Labels
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    labels.forEach((label, i) => {
      const p = getPoint(i, 118);
      const color = values[i] >= 80 ? "#34d399" : values[i] >= 60 ? "#fbbf24" : "#f87171";
      ctx.fillStyle = "rgba(226,232,240,0.9)";
      ctx.fillText(label.charAt(0).toUpperCase() + label.slice(1), p.x, p.y - 6);
      ctx.font = "700 12px 'JetBrains Mono', monospace";
      ctx.fillStyle = color;
      ctx.fillText(`${values[i]}`, p.x, p.y + 8);
      ctx.font = "600 11px Inter, system-ui, sans-serif";
    });

  }, [dimensions, size, labels, values]);

  return <canvas ref={canvasRef} style={{ display: "block", margin: "0 auto" }} />;
}

/* ─── Score Ring ─── */
function ScoreRing({ score, grade, size = 140 }) {
  const color = score >= 80 ? "var(--green)" : score >= 60 ? "var(--amber)" : "var(--red)";
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="ais-score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size}>
        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
        <circle cx="60" cy="60" r="54" fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 1s ease" }} />
      </svg>
      <div className="ais-score-ring-inner">
        <span className="ais-grade" style={{ color }}>{grade}</span>
        <span className="ais-score-num" style={{ color }}>{score}/100</span>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
export default function ArchitectureScorePage({ snapshot }) {
  const ais = useMemo(() => computeAIS(snapshot ?? {}), [snapshot]);
  const dims = ais.dimensions ?? {};

  return (
    <div className="ais-page">
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Award size={24} /> Architecture Intelligence Score
        </h1>
        <div className="ais-header-badges">
          <span className="chip">{ais.totalBeans} beans</span>
          <span className="chip">{ais.totalEdges} edges</span>
          <span className="chip">{ais.totalEndpoints} endpoints</span>
        </div>
      </div>

      {/* Hero: Score + Radar */}
      <div className="ais-hero">
        <div className="ais-hero-left">
          <ScoreRing score={ais.overallScore} grade={ais.overallGrade} size={180} />
          <div className="ais-hero-subtitle">Overall Architecture Score</div>
          <div className="ais-hero-desc">
            {ais.overallScore >= 90 ? "Exceptional architecture — production ready." :
              ais.overallScore >= 75 ? "Good architecture with minor improvements possible." :
                ais.overallScore >= 60 ? "Fair architecture — several areas need attention." :
                  "Architecture needs significant refactoring."}
          </div>
        </div>
        <div className="ais-hero-right">
          <RadarChart dimensions={dims} size={320} />
        </div>
      </div>

      {/* Dimension Breakdown */}
      <div className="ais-section-title">Dimension Breakdown</div>
      <div className="ais-dimension-grid">
        {Object.entries(dims).map(([key, value]) => {
          const color = value >= 80 ? "var(--green)" : value >= 60 ? "var(--amber)" : "var(--red)";
          const bg = value >= 80 ? "var(--green-glow)" : value >= 60 ? "rgba(251,191,36,0.12)" : "var(--red-glow)";
          const icons = { complexity: <Network size={18} />, performance: <Zap size={18} />, reliability: <Target size={18} />, maintainability: <GitBranch size={18} />, scalability: <TrendingUp size={18} /> };
          const descriptions = { complexity: "Dependency depth, circular deps, God Beans", performance: "Endpoint latencies, slow span count", reliability: "Error rates, exception frequency", maintainability: "Orphan beans, code coupling", scalability: "Anomaly patterns, hub concentration" };
          return (
            <div key={key} className="ais-dimension-card" style={{ borderColor: color }}>
              <div className="ais-dim-header">
                <span className="ais-dim-icon" style={{ color, background: bg }}>{icons[key]}</span>
                <span className="ais-dim-name">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                <span className="ais-dim-score" style={{ color }}>{value}/100</span>
              </div>
              <div className="ais-dim-bar-track">
                <div className="ais-dim-bar-fill" style={{ width: `${value}%`, background: color }} />
              </div>
              <div className="ais-dim-desc">{descriptions[key]}</div>
            </div>
          );
        })}
      </div>

      {/* God Beans */}
      {ais.godBeans?.length > 0 && (
        <>
          <div className="ais-section-title"><Skull size={16} /> God Beans <span className="card-badge">{ais.godBeans.length}</span></div>
          <div className="ais-issue-desc">Beans with too many outgoing dependencies (&gt;5). These create tight coupling and make refactoring difficult.</div>
          <div className="signal-list">
            {ais.godBeans.map((b, i) => (
              <div key={i} className="signal-row is-error">
                <div><strong>{b.id}</strong><br /><small>{b.className ?? "—"}</small></div>
                <span className="chip" style={{ background: "var(--red-glow)", color: "var(--red)" }}>{b.dependencyCount} deps</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Hub Beans */}
      {ais.hubBeans?.length > 0 && (
        <>
          <div className="ais-section-title"><CircleDot size={16} /> Hub Beans <span className="card-badge">{ais.hubBeans.length}</span></div>
          <div className="ais-issue-desc">Most depended-upon beans. If these break, many others fail.</div>
          <div className="signal-list">
            {ais.hubBeans.map((b, i) => (
              <div key={i} className="signal-row">
                <div><strong>{b.id}</strong><br /><small>Role: {b.role ?? "—"} · Scope: {b.scope ?? "singleton"}</small></div>
                <span className="chip">{b.dependentCount} dependents</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Circular Dependencies */}
      {ais.circularDependencies?.length > 0 && (
        <>
          <div className="ais-section-title"><AlertOctagon size={16} style={{ color: "var(--red)" }} /> Circular Dependencies <span className="card-badge" style={{ background: "var(--red-glow)", color: "var(--red)" }}>{ais.circularDependencies.length}</span></div>
          <div className="ais-issue-desc">Bidirectional bean dependencies detected. These can cause initialization deadlocks and make testing harder.</div>
          <div className="signal-list">
            {ais.circularDependencies.map((pair, i) => (
              <div key={i} className="signal-row is-error">
                <div><strong>{pair[0]}</strong><span style={{ margin: "0 8px", color: "var(--red)" }}>⇄</span><strong>{pair[1]}</strong></div>
                <AlertTriangle size={16} style={{ color: "var(--red)" }} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Orphan Beans */}
      {ais.orphanBeans?.length > 0 && (
        <>
          <div className="ais-section-title"><Box size={16} /> Orphan Beans <span className="card-badge">{ais.orphanBeans.length}</span></div>
          <div className="ais-issue-desc">Beans with no incoming or outgoing dependency edges. May be unused or improperly wired.</div>
          <div className="ais-orphan-grid">
            {ais.orphanBeans.slice(0, 20).map((b, i) => (<div key={i} className="ais-orphan-chip">{b.id}</div>))}
          </div>
        </>
      )}

      {/* Dependency Chain */}
      {ais.deepestChain?.length > 1 && (
        <>
          <div className="ais-section-title"><GitMerge size={16} /> Deepest Dependency Chain <span className="card-badge">depth: {ais.maxChainDepth}</span></div>
          <div className="ais-issue-desc">The longest transitive dependency path in your bean graph.</div>
          <div className="ais-chain">
            {ais.deepestChain.map((node, i) => (
              <span key={i} className="ais-chain-node">{node}{i < ais.deepestChain.length - 1 && <ChevronRight size={14} className="ais-chain-arrow" />}</span>
            ))}
          </div>
        </>
      )}

      {/* Startup Tax */}
      {ais.startupTax?.length > 0 && (
        <>
          <div className="ais-section-title"><Zap size={16} /> Startup Tax</div>
          <div className="ais-issue-desc">Beans that took the longest to initialize during application startup.</div>
          <div className="signal-list">
            {ais.startupTax.map((b, i) => (
              <div key={i} className="signal-row">
                <div><strong>{b.bean}</strong></div>
                <span className="chip" style={{
                  background: b.durationMs > 200 ? "var(--red-glow)" : b.durationMs > 50 ? "rgba(251,191,36,0.12)" : "var(--green-glow)",
                  color: b.durationMs > 200 ? "var(--red)" : b.durationMs > 50 ? "var(--amber)" : "var(--green)",
                }}>{b.durationMs}ms</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Zombie Endpoints */}
      {ais.zombieEndpoints?.length > 0 && (
        <>
          <div className="ais-section-title"><AlertTriangle size={16} /> Zombie Endpoints <span className="card-badge">{ais.zombieEndpoints.length}</span></div>
          <div className="ais-issue-desc">Endpoints with minimal traffic. Consider deprecating or removing unused API routes.</div>
          <div className="signal-list">
            {ais.zombieEndpoints.map((e, i) => (
              <div key={i} className="signal-row">
                <div><strong>{e.endpoint}</strong><br /><small>{e.total} call{e.total !== 1 ? "s" : ""} total</small></div>
                <span className="chip" style={{ background: "rgba(251,191,36,0.12)", color: "var(--amber)" }}>zombie</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* No issues found */}
      {ais.godBeans?.length === 0 && ais.circularDependencies?.length === 0 && ais.orphanBeans?.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: 32, marginTop: 16 }}>
          <CheckCircle size={32} style={{ color: "var(--green)", marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>Clean Architecture!</div>
          <div style={{ color: "var(--text-muted)", marginTop: 4 }}>No major architectural anti-patterns detected.</div>
        </div>
      )}
    </div>
  );
}

