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
  const nodes = beanGraph.nodes ?? [];
  const links = beanGraph.links ?? [];
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("graph"); // graph | affected | deps
  const svgContainerRef = useRef(null);
  const svgRef = useRef(null);

  const blast = useMemo(() => computeBlastRadius(beanGraph, selected), [beanGraph, selected]);

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
  }, [nodes, links]);

  const affectedSet = useMemo(() => new Set(blast.affected.map(a => a.id)), [blast]);

  // Severity label
  const severity = blast.affected.length > 10 ? "CRITICAL" : blast.affected.length > 5 ? "HIGH" : blast.affected.length > 2 ? "MEDIUM" : blast.affected.length > 0 ? "LOW" : null;
  const severityColor = severity === "CRITICAL" ? "var(--red)" : severity === "HIGH" ? "var(--amber)" : severity === "MEDIUM" ? "#facc15" : "var(--green)";

  // D3 Blast radius visualization
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (!selected || nodes.length === 0 || activeTab !== "graph") return;

    const container = svgContainerRef.current;
    if (!container) return;
    const width = container.clientWidth || 700;
    const height = Math.max(400, Math.min(600, container.clientHeight || 500));

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Only show relevant nodes
    const relevantIds = new Set([selected, ...blast.affected.map(a => a.id)]);
    for (const l of links) {
      if (l.source === selected) relevantIds.add(l.target);
    }

    const visNodes = nodes.filter(n => relevantIds.has(n.id)).map(n => ({
      ...n,
      isSelected: n.id === selected,
      isAffected: affectedSet.has(n.id),
      isDep: !affectedSet.has(n.id) && n.id !== selected,
      affectedDepth: blast.affected.find(a => a.id === n.id)?.depth ?? 0,
    }));
    const visLinks = links.filter(l => relevantIds.has(l.source) && relevantIds.has(l.target)).map(l => ({ ...l }));

    if (visNodes.length === 0) return;

    // Defs: arrow markers + glow filter
    const defs = svg.append("defs");
    defs.append("marker")
      .attr("id", "blast-arrow-red").attr("viewBox", "0 -5 10 10")
      .attr("refX", 22).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "rgba(248,113,113,0.6)");
    defs.append("marker")
      .attr("id", "blast-arrow-dim").attr("viewBox", "0 -5 10 10")
      .attr("refX", 22).attr("refY", 0).attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
      .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", "rgba(148,163,184,0.2)");

    // Glow filter
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "coloredBlur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Links
    const link = svg.append("g").selectAll("line").data(visLinks).join("line")
      .attr("stroke", d => {
        const isImpact = affectedSet.has(d.source) || d.target === selected || d.source === selected;
        return isImpact ? "rgba(248,113,113,0.35)" : "rgba(148,163,184,0.08)";
      })
      .attr("stroke-width", d => (affectedSet.has(d.source) || d.target === selected || d.source === selected) ? 1.5 : 0.5)
      .attr("marker-end", d => (affectedSet.has(d.source) || d.target === selected || d.source === selected) ? "url(#blast-arrow-red)" : "url(#blast-arrow-dim)");

    // Node groups
    const nodeGroup = svg.append("g").selectAll("g").data(visNodes).join("g")
      .attr("cursor", "pointer")
      .call(d3.drag()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      )
      .on("click", (ev, d) => setSelected(d.id));

    // Pulse ring for selected
    nodeGroup.filter(d => d.isSelected).append("circle")
      .attr("r", 28).attr("fill", "none").attr("stroke", "#f87171").attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4 3").attr("opacity", 0.5);

    // Node circles
    nodeGroup.append("circle")
      .attr("r", d => d.isSelected ? 18 : d.isAffected ? 12 : 9)
      .attr("fill", d =>
        d.isSelected ? "rgba(248,113,113,0.2)" :
        d.isAffected ? `rgba(251,191,36,${Math.max(0.06, 0.2 - d.affectedDepth * 0.03)})` :
        "rgba(96,165,250,0.08)"
      )
      .attr("stroke", d =>
        d.isSelected ? "#f87171" :
        d.isAffected ? `rgba(251,191,36,${Math.max(0.3, 0.8 - d.affectedDepth * 0.1)})` :
        "rgba(148,163,184,0.2)"
      )
      .attr("stroke-width", d => d.isSelected ? 2.5 : 1.5)
      .attr("filter", d => d.isSelected ? "url(#glow)" : null);

    // Center icon
    nodeGroup.filter(d => d.isSelected).append("text")
      .text("⊗").attr("text-anchor", "middle").attr("dy", 5).attr("font-size", 14).attr("fill", "#f87171");

    nodeGroup.filter(d => d.isAffected && !d.isSelected).append("circle")
      .attr("r", 3).attr("fill", d => d.affectedDepth === 1 ? "#f87171" : "#fbbf24");

    // Labels
    nodeGroup.append("text")
      .text(d => {
        const name = d.id;
        return name.length > 22 ? name.slice(0, 20) + "…" : name;
      })
      .attr("text-anchor", "middle")
      .attr("dy", d => d.isSelected ? 32 : d.isAffected ? 22 : 18)
      .attr("font-size", d => d.isSelected ? 11 : 9)
      .attr("font-weight", d => d.isSelected ? 700 : 500)
      .attr("fill", d => d.isSelected ? "#f87171" : d.isAffected ? "#fbbf24" : "rgba(148,163,184,0.6)")
      .attr("font-family", "var(--font-mono)");

    const sim = d3.forceSimulation(visNodes)
      .force("link", d3.forceLink(visLinks).id(d => d.id).distance(90).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(35))
      .force("x", d3.forceX(width / 2).strength(0.05))
      .force("y", d3.forceY(height / 2).strength(0.05));

    sim.on("tick", () => {
      // Clamp positions
      visNodes.forEach(d => {
        d.x = Math.max(30, Math.min(width - 30, d.x));
        d.y = Math.max(30, Math.min(height - 30, d.y));
      });
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [selected, nodes.length, links.length, blast, activeTab]);

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

