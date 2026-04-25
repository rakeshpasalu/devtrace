import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import {
  Crosshair, Search, AlertTriangle, Zap, Shield, Target, ChevronRight,
  BarChart3, GitBranch, Layers, ArrowRight, Network
} from "lucide-react";
import { formatDuration } from "../utils.js";

/* ─── Compute blast radius from bean graph ─── */
function computeBlastRadius(beanGraph, selectedNode) {
  const nodes = beanGraph?.nodes ?? [];
  const links = beanGraph?.links ?? [];
  if (!selectedNode || nodes.length === 0) return { affected: [], depth: 0, directDeps: 0, directDependencies: [] };

  const dependents = new Map();
  const dependencies = new Map();
  for (const link of links) {
    if (!dependents.has(link.target)) dependents.set(link.target, []);
    dependents.get(link.target).push(link.source);
    if (!dependencies.has(link.source)) dependencies.set(link.source, []);
    dependencies.get(link.source).push(link.target);
  }

  // BFS: find all nodes that depend (transitively) on selectedNode
  const visited = new Set();
  const queue = [{ id: selectedNode, depth: 0 }];
  const affected = [];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (id !== selectedNode) affected.push({ id, depth });
    for (const dep of (dependents.get(id) ?? [])) {
      if (!visited.has(dep)) queue.push({ id: dep, depth: depth + 1 });
    }
  }

  const directDeps = (dependents.get(selectedNode) ?? []).length;
  const directDependencies = dependencies.get(selectedNode) ?? [];
  const maxDepth = affected.length > 0 ? Math.max(...affected.map(a => a.depth)) : 0;

  return { affected, depth: maxDepth, directDeps, directDependencies };
}

/* ─── Main Component ─── */
export default function DependencyImpactPage({ snapshot }) {
  const beanGraph = snapshot?.beanGraph ?? { nodes: [], links: [] };
  const rawNodes = beanGraph.nodes ?? [];
  const rawLinks = beanGraph.links ?? [];
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("graph"); // graph | affected | deps
  const svgContainerRef = useRef(null);
  const svgRef = useRef(null);

  // ── Stable fingerprints so memos/effects only recompute when data actually changes ──
  const nodeFingerprint = useMemo(() => rawNodes.map(n => n.id).sort().join("|"), [rawNodes]);
  const linkFingerprint = useMemo(() => rawLinks.map(l => `${l.source}->${l.target}`).sort().join("|"), [rawLinks]);

  // Stable node/link arrays that only change when structure changes
  const nodes = useMemo(() => rawNodes, [nodeFingerprint]);
  const links = useMemo(() => rawLinks, [linkFingerprint]);

  const blast = useMemo(() => computeBlastRadius({ nodes, links }, selected), [nodeFingerprint, linkFingerprint, selected]);

  // Stable key for the blast result (so D3 effect doesn't re-trigger on identical data)
  const blastKey = useMemo(() => {
    return `${selected}::${blast.affected.map(a => `${a.id}@${a.depth}`).join(",")}::${blast.directDependencies.join(",")}`;
  }, [blast, selected]);

  const filteredNodes = useMemo(() => {
    if (!search) return nodes;
    const q = search.toLowerCase();
    return nodes.filter(n =>
      n.id.toLowerCase().includes(q) ||
      (n.className ?? "").toLowerCase().includes(q) ||
      (n.role ?? "").toLowerCase().includes(q)
    );
  }, [nodes, search]);

  // Pre-compute impact for ranking — but cache it
  const impactRanking = useMemo(() => {
    if (nodes.length === 0) return [];

    // Build adjacency once
    const dependents = new Map();
    for (const link of links) {
      if (!dependents.has(link.target)) dependents.set(link.target, []);
      dependents.get(link.target).push(link.source);
    }

    // Quick BFS count for each node
    return nodes.map(n => {
      const visited = new Set();
      const queue = [n.id];
      let count = 0;
      let directCount = (dependents.get(n.id) ?? []).length;
      while (queue.length > 0) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        if (id !== n.id) count++;
        for (const dep of (dependents.get(id) ?? [])) {
          if (!visited.has(dep)) queue.push(dep);
        }
      }
      return { ...n, affectedCount: count, directDeps: directCount };
    })
    .filter(n => n.affectedCount > 0 || n.directDeps > 0)
    .sort((a, b) => b.affectedCount - a.affectedCount)
    .slice(0, 20);
  }, [nodeFingerprint, linkFingerprint]);

  const affectedSet = useMemo(() => new Set(blast.affected.map(a => a.id)), [blastKey]);

  // Severity label
  const severity = blast.affected.length > 10 ? "CRITICAL" : blast.affected.length > 5 ? "HIGH" : blast.affected.length > 2 ? "MEDIUM" : blast.affected.length > 0 ? "LOW" : null;
  const severityColor = severity === "CRITICAL" ? "var(--red)" : severity === "HIGH" ? "var(--amber)" : severity === "MEDIUM" ? "#facc15" : "var(--green)";

  // How many depth levels to show in graph
  const [maxVisibleDepth, setMaxVisibleDepth] = useState(3);

  // Reset visible depth when selecting a different node
  useEffect(() => { setMaxVisibleDepth(3); }, [selected]);

  // D3 Blast radius visualization — scalable radial layout
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    if (!selected || nodes.length === 0 || activeTab !== "graph") return;

    const container = svgContainerRef.current;
    if (!container) return;
    const width = container.clientWidth || 700;
    const height = Math.max(450, Math.min(650, container.clientHeight || 550));
    const cx = width / 2;
    const cy = height / 2;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // ── Build pruned node set (cap per ring, collapse deep levels) ──
    const MAX_PER_RING = 14;
    const depthGroups = new Map();
    for (const a of blast.affected) {
      if (!depthGroups.has(a.depth)) depthGroups.set(a.depth, []);
      depthGroups.get(a.depth).push(a);
    }

    const visNodes = [];
    const summaryNodes = [];
    const visibleIds = new Set([selected]);

    // Selected node at center
    visNodes.push({
      id: selected, isSelected: true, isAffected: false,
      isSummary: false, isDep: false, affectedDepth: 0,
    });

    // Affected — pruned per ring, limited by maxVisibleDepth
    const sortedDepths = [...depthGroups.keys()].sort((a, b) => a - b);
    for (const depth of sortedDepths) {
      if (depth > maxVisibleDepth) {
        const totalRemaining = sortedDepths
          .filter(d => d > maxVisibleDepth)
          .reduce((sum, d) => sum + depthGroups.get(d).length, 0);
        if (totalRemaining > 0) {
          summaryNodes.push({
            id: "__summary_deep__", isSummary: true, isSelected: false,
            isAffected: false, isDep: false, affectedDepth: maxVisibleDepth + 1,
            label: `+${totalRemaining} more`,
            sublabel: `depth ${maxVisibleDepth + 1}–${sortedDepths[sortedDepths.length - 1]}`,
          });
        }
        break;
      }
      const group = depthGroups.get(depth);
      const shown = group.slice(0, MAX_PER_RING);
      const hidden = group.length - shown.length;
      for (const a of shown) {
        visibleIds.add(a.id);
        const nd = nodes.find(n => n.id === a.id);
        visNodes.push({
          ...(nd || {}), id: a.id, isSelected: false, isAffected: true,
          isSummary: false, isDep: false, affectedDepth: a.depth,
        });
      }
      if (hidden > 0) {
        summaryNodes.push({
          id: `__summary_d${depth}__`, isSummary: true, isSelected: false,
          isAffected: true, isDep: false, affectedDepth: depth,
          label: `+${hidden} more`, sublabel: `at depth ${depth}`,
        });
      }
    }

    // Dependencies of selected
    const depNodes = [];
    for (const l of links) {
      if (l.source === selected && !visibleIds.has(l.target)) {
        const nd = nodes.find(n => n.id === l.target);
        if (nd) {
          depNodes.push({
            ...nd, id: l.target, isSelected: false, isAffected: false,
            isSummary: false, isDep: true, affectedDepth: 0,
          });
          visibleIds.add(l.target);
        }
      }
    }
    const shownDeps = depNodes.slice(0, 8);
    if (depNodes.length > 8) {
      summaryNodes.push({
        id: "__summary_deps__", isSummary: true, isSelected: false,
        isAffected: false, isDep: true, affectedDepth: 0,
        label: `+${depNodes.length - 8} deps`, sublabel: "dependencies",
      });
    }

    const allNodes = [...visNodes, ...shownDeps, ...summaryNodes];
    const visLinks = links.filter(l =>
      visibleIds.has(l.source) && visibleIds.has(l.target)
    ).map(l => ({ source: l.source, target: l.target }));

    if (allNodes.length === 0) return;

    // ── Deterministic radial positions ──
    const activeDepths = [...new Set(
      allNodes.filter(n => !n.isSelected && !n.isDep).map(n => n.affectedDepth)
    )].sort((a, b) => a - b);
    const numRings = Math.max(1, activeDepths.length);
    const minRing = Math.min(width, height) * 0.15;
    const maxRing = Math.min(width, height) * 0.43;
    const ringGap = numRings > 1 ? (maxRing - minRing) / (numRings - 1) : 0;

    const depthToRadius = (d) => {
      const idx = activeDepths.indexOf(d);
      return idx >= 0 ? minRing + idx * ringGap : minRing + numRings * ringGap;
    };

    // Bucket by depth
    const ringBuckets = new Map();
    for (const n of allNodes) {
      if (n.isSelected || n.isDep) continue;
      const d = n.affectedDepth;
      if (!ringBuckets.has(d)) ringBuckets.set(d, []);
      ringBuckets.get(d).push(n);
    }

    for (const n of allNodes) {
      if (n.isSelected) { n.x = cx; n.y = cy; continue; }
      if (n.isDep) {
        const list = [...shownDeps, ...summaryNodes.filter(s => s.isDep)];
        const idx = list.indexOf(n);
        const count = list.length;
        const r = minRing * 0.75;
        const spread = Math.min(Math.PI * 0.7, count * 0.3);
        const start = Math.PI / 2 - spread / 2;
        const step = count > 1 ? spread / (count - 1) : 0;
        n.x = cx + r * Math.cos(start + idx * step);
        n.y = cy + r * Math.sin(start + idx * step);
        continue;
      }
      const d = n.affectedDepth;
      const bucket = ringBuckets.get(d) ?? [];
      const idx = bucket.indexOf(n);
      const count = bucket.length;
      const r = depthToRadius(d);
      const angleStep = (2 * Math.PI) / Math.max(1, count);
      const offset = (d % 2) * (angleStep / 2);
      const angle = offset + idx * angleStep - Math.PI / 2;
      n.x = cx + r * Math.cos(angle);
      n.y = cy + r * Math.sin(angle);
    }

    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    // ── SVG Defs ──
    const defs = svg.append("defs");
    defs.append("marker").attr("id", "ar")
      .attr("viewBox", "0 -5 10 10").attr("refX", 18).attr("refY", 0)
      .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "rgba(248,113,113,0.5)");
    defs.append("marker").attr("id", "ad")
      .attr("viewBox", "0 -5 10 10").attr("refX", 18).attr("refY", 0)
      .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "rgba(148,163,184,0.2)");
    const glF = defs.append("filter").attr("id", "gl")
      .attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glF.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "b");
    const gm = glF.append("feMerge");
    gm.append("feMergeNode").attr("in", "b");
    gm.append("feMergeNode").attr("in", "SourceGraphic");

    // ── Root with zoom/pan ──
    const rootG = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", ev => rootG.attr("transform", ev.transform)));

    // Ring guides
    for (const depth of activeDepths) {
      if (depth <= 0) continue;
      const r = depthToRadius(depth);
      rootG.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r)
        .attr("fill", "none")
        .attr("stroke", depth === 1 ? "rgba(248,113,113,0.06)" : "rgba(148,163,184,0.03)")
        .attr("stroke-dasharray", "3 5");
    }

    // ── Links ──
    const curvePath = (l) => {
      const s = nodeMap.get(l.source), t = nodeMap.get(l.target);
      if (!s || !t) return "";
      const dx = t.x - s.x, dy = t.y - s.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 0.55;
      return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
    };
    const isImpactLink = (l) => affectedSet.has(l.source) || l.target === selected || l.source === selected;

    const linkG = rootG.append("g");
    const linkSel = linkG.selectAll("path").data(visLinks).join("path")
      .attr("d", curvePath).attr("fill", "none")
      .attr("stroke", l => isImpactLink(l) ? "rgba(248,113,113,0.22)" : "rgba(148,163,184,0.05)")
      .attr("stroke-width", l => isImpactLink(l) ? 1.2 : 0.4)
      .attr("marker-end", l => isImpactLink(l) ? "url(#ar)" : "url(#ad)")
      .attr("opacity", 0);
    linkSel.transition().duration(500).delay((_, i) => 200 + i * 8).attr("opacity", 1);

    // ── Nodes ──
    const isLargeGraph = allNodes.length > 30;
    const nR = (d) => {
      if (d.isSelected) return 16;
      if (d.isSummary) return 14;
      if (isLargeGraph) return d.affectedDepth === 1 ? 8 : 6;
      return d.isAffected ? 11 : 8;
    };

    const nodeG = rootG.append("g");
    const nodeSel = nodeG.selectAll("g").data(allNodes, d => d.id).join("g")
      .attr("transform", `translate(${cx},${cy})`)
      .attr("cursor", "pointer")
      .on("click", (_, d) => {
        if (d.isSummary) {
          if (d.id === "__summary_deep__") setMaxVisibleDepth(p => p + 2);
          return;
        }
        if (d.id !== selected) setSelected(d.id);
      });

    nodeSel.transition().duration(550)
      .delay(d => d.isSelected ? 0 : 60 + (d.affectedDepth || 0) * 70)
      .ease(d3.easeCubicOut)
      .attr("transform", d => `translate(${d.x},${d.y})`);

    // Drag
    nodeSel.call(d3.drag()
      .on("start", function () { d3.select(this).raise(); })
      .on("drag", function (ev, d) {
        d.x = ev.x; d.y = ev.y;
        d3.select(this).attr("transform", `translate(${d.x},${d.y})`);
        linkSel.attr("d", curvePath);
      })
    );

    // Pulse on selected
    nodeSel.filter(d => d.isSelected).each(function () {
      const g = d3.select(this);
      const p = g.append("circle").attr("r", 18).attr("fill", "none")
        .attr("stroke", "#f87171").attr("stroke-width", 2).attr("opacity", 0.5);
      (function tick() {
        p.attr("r", 18).attr("opacity", 0.5).attr("stroke-width", 2)
          .transition().duration(1400).ease(d3.easeCubicOut)
          .attr("r", 32).attr("opacity", 0).attr("stroke-width", 0.5)
          .on("end", tick);
      })();
      g.append("circle").attr("r", 22).attr("fill", "none")
        .attr("stroke", "#f87171").attr("stroke-width", 1)
        .attr("stroke-dasharray", "3 3").attr("opacity", 0.2);
    });

    // Node circles
    nodeSel.append("circle").attr("r", 0)
      .attr("fill", d => {
        if (d.isSelected) return "rgba(248,113,113,0.15)";
        if (d.isSummary) return "rgba(148,163,184,0.08)";
        if (d.isAffected) return `rgba(251,191,36,${Math.max(0.04, 0.15 - d.affectedDepth * 0.02)})`;
        return "rgba(96,165,250,0.08)";
      })
      .attr("stroke", d => {
        if (d.isSelected) return "#f87171";
        if (d.isSummary) return "rgba(148,163,184,0.4)";
        if (d.isAffected) return `rgba(251,191,36,${Math.max(0.3, 0.8 - d.affectedDepth * 0.08)})`;
        return "rgba(96,165,250,0.3)";
      })
      .attr("stroke-width", d => d.isSelected ? 2.5 : d.isSummary ? 1.5 : 1.2)
      .attr("stroke-dasharray", d => d.isSummary ? "3 2" : null)
      .attr("filter", d => d.isSelected ? "url(#gl)" : null)
      .transition().duration(400)
      .delay(d => d.isSelected ? 0 : 80 + (d.affectedDepth || 0) * 50)
      .ease(d3.easeBackOut.overshoot(1))
      .attr("r", nR);

    // Center icon
    nodeSel.filter(d => d.isSelected).append("text")
      .text("⊗").attr("text-anchor", "middle").attr("dy", 5)
      .attr("font-size", 14).attr("fill", "#f87171");

    // Inner dot on depth-1/2
    nodeSel.filter(d => d.isAffected && !d.isSelected && !d.isSummary && d.affectedDepth <= 2)
      .append("circle").attr("r", 2.5)
      .attr("fill", d => d.affectedDepth === 1 ? "#f87171" : "#fbbf24");

    // Summary labels (always visible)
    nodeSel.filter(d => d.isSummary).each(function (d) {
      const g = d3.select(this);
      g.append("text").text(d.label)
        .attr("text-anchor", "middle").attr("dy", 1)
        .attr("font-size", 9).attr("font-weight", 700)
        .attr("fill", "rgba(148,163,184,0.7)").attr("font-family", "var(--font-mono)");
      g.append("text").text(d.sublabel)
        .attr("text-anchor", "middle").attr("dy", 12)
        .attr("font-size", 7).attr("fill", "rgba(148,163,184,0.4)")
        .attr("font-family", "var(--font-mono)");
    });

    // Node labels (hidden in large graphs, shown on hover)
    nodeSel.filter(d => !d.isSummary).append("text")
      .text(d => d.id.length > 26 ? d.id.slice(0, 24) + "…" : d.id)
      .attr("text-anchor", "middle")
      .attr("dy", d => nR(d) + 11)
      .attr("font-size", d => d.isSelected ? 10 : 8)
      .attr("font-weight", d => d.isSelected ? 700 : 400)
      .attr("fill", d => d.isSelected ? "#f87171" : d.isAffected ? "rgba(251,191,36,0.7)" : "rgba(96,165,250,0.6)")
      .attr("font-family", "var(--font-mono)")
      .attr("class", "node-label")
      .attr("opacity", d => {
        if (d.isSelected) return 1;
        if (!isLargeGraph && d.affectedDepth === 1) return 1;
        if (isLargeGraph) return 0;
        return 0.8;
      });

    // Hover: enlarge + show label + highlight connected links
    nodeSel.filter(d => !d.isSelected && !d.isSummary)
      .on("mouseenter", function (_, d) {
        const el = d3.select(this);
        el.raise();
        el.select("circle").transition().duration(120)
          .attr("stroke-width", 2.5).attr("r", nR(d) + 4);
        el.select(".node-label").transition().duration(120)
          .attr("opacity", 1).attr("font-size", 10);
        linkSel.transition().duration(120)
          .attr("opacity", l => (l.source === d.id || l.target === d.id) ? 1 : 0.12)
          .attr("stroke-width", l => (l.source === d.id || l.target === d.id) ? 2 : 0.3);
      })
      .on("mouseleave", function (_, d) {
        const el = d3.select(this);
        el.select("circle").transition().duration(150)
          .attr("stroke-width", 1.2).attr("r", nR(d));
        el.select(".node-label").transition().duration(150)
          .attr("opacity", (!isLargeGraph && d.affectedDepth === 1) ? 1 : isLargeGraph ? 0 : 0.8)
          .attr("font-size", 8);
        linkSel.transition().duration(200)
          .attr("opacity", 1)
          .attr("stroke-width", l => isImpactLink(l) ? 1.2 : 0.4);
      });

  }, [selected, blastKey, activeTab, maxVisibleDepth]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Crosshair size={22} /> Blast Radius
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="blast-search-wrap">
            <Search size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search beans…" className="blast-search-input" />
          </div>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Crosshair size={40} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Dependency Impact Analysis</h3>
          <p style={{ color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
            Select any bean to see its <strong>blast radius</strong> — what breaks if it goes down.
            Visualize transitive dependency impact across your Spring context.<br /><br />
            Waiting for bean graph data…
          </p>
        </div>
      ) : (
        <div className="blast-layout">
          {/* Bean selector */}
          <div className="blast-sidebar">
            <div className="blast-sidebar-header">
              {search ? `${filteredNodes.length} matching` : `${nodes.length} Beans`}
            </div>

            {/* Impact ranking */}
            {!search && impactRanking.length > 0 && (
              <div className="blast-ranking-section">
                <div className="blast-ranking-label">
                  <Target size={10} /> Highest Impact
                </div>
                {impactRanking.slice(0, 8).map(n => (
                  <button key={`rank-${n.id}`}
                    className={`blast-bean-item ${selected === n.id ? "active" : ""}`}
                    onClick={() => setSelected(n.id)}>
                    <div className="blast-bean-name">{n.id}</div>
                    <div className="blast-bean-meta">
                      <span style={{ color: n.affectedCount > 5 ? "var(--red)" : "var(--amber)" }}>
                        {n.affectedCount} affected
                      </span>
                      <span>{n.directDeps} direct</span>
                    </div>
                  </button>
                ))}
                <div className="blast-ranking-divider" />
              </div>
            )}

            <div className="blast-bean-list">
              {(search ? filteredNodes : nodes).slice(0, 80).map(n => (
                <button key={n.id}
                  className={`blast-bean-item ${selected === n.id ? "active" : ""} ${affectedSet.has(n.id) ? "is-affected" : ""}`}
                  onClick={() => setSelected(n.id)}>
                  <div className="blast-bean-name">{n.id}</div>
                  <div className="blast-bean-meta">
                    {n.role && <span>{n.role}</span>}
                    {n.scope && n.scope !== "singleton" && <span>{n.scope}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="blast-main">
            {/* Summary bar */}
            {selected && (
              <div className="blast-summary">
                <div className="blast-summary-item">
                  <Crosshair size={14} style={{ color: "var(--red)" }} />
                  <span>Target: <strong style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{selected}</strong></span>
                </div>
                <div className="blast-summary-item">
                  <AlertTriangle size={14} style={{ color: "var(--amber)" }} />
                  <span><strong>{blast.affected.length}</strong> affected</span>
                </div>
                <div className="blast-summary-item">
                  <Zap size={14} style={{ color: "var(--accent)" }} />
                  <span><strong>{blast.directDeps}</strong> dependents</span>
                </div>
                <div className="blast-summary-item">
                  <Layers size={14} style={{ color: "var(--purple)" }} />
                  <span>Depth: <strong>{blast.depth}</strong></span>
                </div>
                {severity && (
                  <div className="blast-severity" style={{ color: severityColor }}>
                    <Shield size={14} />
                    {severity}
                  </div>
                )}
              </div>
            )}

            {/* Tab bar */}
            {selected && (
              <div className="blast-tab-bar">
                <button className={`blast-tab ${activeTab === "graph" ? "active" : ""}`}
                  onClick={() => setActiveTab("graph")}>
                  <Network size={13} /> Graph
                </button>
                <button className={`blast-tab ${activeTab === "affected" ? "active" : ""}`}
                  onClick={() => setActiveTab("affected")}>
                  <AlertTriangle size={13} /> Affected <span className="blast-tab-count">{blast.affected.length}</span>
                </button>
                <button className={`blast-tab ${activeTab === "deps" ? "active" : ""}`}
                  onClick={() => setActiveTab("deps")}>
                  <GitBranch size={13} /> Dependencies <span className="blast-tab-count">{blast.directDependencies.length}</span>
                </button>
              </div>
            )}

            {/* Graph view */}
            {activeTab === "graph" && (
              <div className="blast-graph-card" ref={svgContainerRef}>
                {!selected ? (
                  <div className="blast-graph-empty">
                    <Crosshair size={36} />
                    <p>Select a bean from the left panel to visualize its blast radius.</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Red = target · Yellow = affected · Blue = dependency
                    </p>
                  </div>
                ) : (
                  <svg ref={svgRef} style={{ width: "100%", height: "100%", minHeight: 400 }} />
                )}
              </div>
            )}

            {/* Affected list */}
            {activeTab === "affected" && selected && (
              <div className="blast-list-card">
                {blast.affected.length === 0 ? (
                  <div className="blast-graph-empty">
                    <Shield size={32} style={{ color: "var(--green)" }} />
                    <p>No beans are affected if <strong>{selected}</strong> goes down.</p>
                  </div>
                ) : (
                  <div className="blast-affected-list">
                    {blast.affected.map((a, i) => (
                      <button key={i} className="blast-affected-row" onClick={() => setSelected(a.id)}>
                        <div className="blast-affected-depth" style={{
                          background: a.depth === 1 ? "var(--red-glow)" : a.depth === 2 ? "rgba(251,191,36,0.12)" : "var(--accent-glow)",
                          color: a.depth === 1 ? "var(--red)" : a.depth === 2 ? "var(--amber)" : "var(--accent)",
                        }}>
                          {a.depth === 1 ? "1st" : a.depth === 2 ? "2nd" : `${a.depth}th`}
                        </div>
                        <div className="blast-affected-info">
                          <div className="blast-affected-name">{a.id}</div>
                          <div className="blast-affected-meta">
                            {a.depth} hop{a.depth !== 1 ? "s" : ""} from source
                          </div>
                        </div>
                        <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Dependencies list */}
            {activeTab === "deps" && selected && (
              <div className="blast-list-card">
                {blast.directDependencies.length === 0 ? (
                  <div className="blast-graph-empty">
                    <GitBranch size={32} style={{ color: "var(--text-muted)" }} />
                    <p><strong>{selected}</strong> has no outgoing dependencies.</p>
                  </div>
                ) : (
                  <div className="blast-affected-list">
                    {blast.directDependencies.map((depId, i) => (
                      <button key={i} className="blast-affected-row" onClick={() => setSelected(depId)}>
                        <div className="blast-affected-depth" style={{ background: "rgba(96,165,250,0.1)", color: "var(--accent)" }}>
                          <ArrowRight size={12} />
                        </div>
                        <div className="blast-affected-info">
                          <div className="blast-affected-name">{depId}</div>
                          <div className="blast-affected-meta">direct dependency</div>
                        </div>
                        <ChevronRight size={14} style={{ color: "var(--text-muted)" }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

