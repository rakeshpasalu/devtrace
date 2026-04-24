import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { Network } from "lucide-react";

export default function ServiceMapPage({ requests, recentEvents }) {
  const svgRef = useRef(null);

  // Build topology from request data: which service calls which
  const { nodes, links } = useMemo(() => {
    const serviceSet = new Map();
    const edgeSet = new Map();

    // Gather services from requests
    for (const r of (requests ?? [])) {
      const svc = r.service ?? "unknown";
      if (!serviceSet.has(svc)) {
        serviceSet.set(svc, { id: svc, requestCount: 0, errorCount: 0, avgDuration: 0, totalDuration: 0 });
      }
      const s = serviceSet.get(svc);
      s.requestCount += 1;
      s.totalDuration += (r.durationMs ?? 0);
      s.avgDuration = s.totalDuration / s.requestCount;
      if (r.status === "ERROR") s.errorCount += 1;
    }

    // Gather outbound calls from events (http-client spans)
    for (const e of (recentEvents ?? [])) {
      if (e.component === "http-client" && e.type === "SPAN_FINISHED") {
        const from = e.service ?? "unknown";
        const to = e.attributes?.targetService ?? e.attributes?.host ?? extractHost(e.attributes?.url ?? e.name);
        if (from && to && from !== to) {
          if (!serviceSet.has(from)) serviceSet.set(from, { id: from, requestCount: 0, errorCount: 0, avgDuration: 0, totalDuration: 0 });
          if (!serviceSet.has(to)) serviceSet.set(to, { id: to, requestCount: 0, errorCount: 0, avgDuration: 0, totalDuration: 0 });
          const key = `${from}→${to}`;
          if (!edgeSet.has(key)) edgeSet.set(key, { source: from, target: to, callCount: 0 });
          edgeSet.get(key).callCount += 1;
        }
      }
    }

    return {
      nodes: [...serviceSet.values()],
      links: [...edgeSet.values()],
    };
  }, [requests, recentEvents]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    if (nodes.length === 0) return;

    const width = 900;
    const height = 500;
    const simNodes = nodes.map(n => ({ ...n }));
    const simLinks = links.map(l => ({ ...l }));

    // Arrows
    svg.append("defs").append("marker")
      .attr("id", "arrowhead").attr("viewBox", "0 -5 10 10")
      .attr("refX", 28).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "rgba(148,163,184,0.4)");

    const link = svg.append("g")
      .selectAll("line").data(simLinks).join("line")
      .attr("stroke", "rgba(148,163,184,0.3)")
      .attr("stroke-width", d => Math.min(4, 1 + d.callCount * 0.5))
      .attr("marker-end", "url(#arrowhead)");

    // Node groups
    const nodeGroup = svg.append("g")
      .selectAll("g").data(simNodes).join("g")
      .attr("cursor", "pointer")
      .call(d3.drag()
        .on("start", (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // Circle
    nodeGroup.append("circle")
      .attr("r", d => Math.max(18, Math.min(36, 14 + d.requestCount * 2)))
      .attr("fill", d => d.errorCount > 0 ? "rgba(248,113,113,0.2)" : "rgba(96,165,250,0.15)")
      .attr("stroke", d => d.errorCount > 0 ? "#f87171" : "#60a5fa")
      .attr("stroke-width", 2);

    // Label
    nodeGroup.append("text")
      .text(d => d.id)
      .attr("text-anchor", "middle").attr("dy", 4)
      .attr("font-size", 11).attr("font-weight", 600)
      .attr("fill", "#e2e8f0").attr("font-family", "var(--font-sans)");

    // Request count below
    nodeGroup.append("text")
      .text(d => `${d.requestCount} req`)
      .attr("text-anchor", "middle").attr("dy", 18)
      .attr("font-size", 9).attr("fill", "#64748b").attr("font-family", "var(--font-mono)");

    const sim = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink(simLinks).id(d => d.id).distance(140))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(50));

    sim.on("tick", () => {
      link
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }, [nodes.length, links.length]);

  return (
    <>
      <div className="page-header">
        <h1>Service Topology</h1>
        <span className="card-badge">{nodes.length} services · {links.length} connections</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {nodes.length === 0 ? (
          <div className="empty-state" style={{ padding: "64px 24px" }}>
            <Network size={40} />
            <p>Service topology will appear once multiple services<br/>send trace data through the collector.</p>
          </div>
        ) : (
          <svg ref={svgRef} viewBox="0 0 900 500" style={{ width: "100%", minHeight: 500, background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-lg)" }} role="img" />
        )}
      </div>
      {nodes.length > 0 && (
        <div className="metrics-row" style={{ marginTop: 20 }}>
          {nodes.map(n => (
            <div key={n.id} className="metric-card">
              <div className="metric-label">{n.id}</div>
              <div className="metric-value">{n.requestCount}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {n.errorCount > 0 && <span style={{ color: "var(--red)" }}>{n.errorCount} errors · </span>}
                avg {Math.round(n.avgDuration)}ms
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url?.split("/")[0] ?? "external";
  }
}
