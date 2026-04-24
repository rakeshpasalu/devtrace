import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import ForceGraph2D from "react-force-graph-2d";
import * as THREE from "three";
import {
  GitBranch, Maximize, Minimize, Search, X, Box, RotateCcw,
  Eye, EyeOff, Sparkles, ZoomIn, ZoomOut
} from "lucide-react";

/* ─── Color palette (neon cyberpunk) ─── */
const PALETTE = {
  app:       { main: "#34d399", glow: "rgba(52,211,153,0.35)", dark: "#064e3b" },
  framework: { main: "#60a5fa", glow: "rgba(96,165,250,0.30)", dark: "#1e3a5f" },
  prototype: { main: "#f97316", glow: "rgba(249,115,22,0.30)", dark: "#7c2d12" },
  selected:  { main: "#facc15", glow: "rgba(250,204,21,0.5)",  dark: "#713f12" },
};

const LINK_COLOR     = "rgba(148,163,184,0.12)";
const LINK_HIGHLIGHT = "rgba(250,204,21,0.6)";
const PARTICLE_COLOR = "#facc15";

function classify(node) {
  if (node.scope === "prototype") return "prototype";
  const c = String(node.className ?? "");
  if (c.startsWith("com.") && !c.startsWith("com.devtrace.") && !c.includes("springframework")) return "app";
  return "framework";
}

function nodeDisplayName(n) {
  return n.label || n.id || "unknown";
}

/**
 * Build a stable fingerprint from graph props so we only reset the simulation
 * when the actual bean data changes – not on every snapshot poll.
 */
function graphFingerprint(graph) {
  const nodeIds = (graph.nodes ?? []).map(n => n.id).sort().join(",");
  const linkIds = (graph.links ?? []).map(l => `${l.source?.id ?? l.source}->${l.target?.id ?? l.target}`).sort().join(",");
  return `${nodeIds}|${linkIds}`;
}

export default function BeanGraph({ graph }) {
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const [showParticles, setShowParticles] = useState(true);

  /*
   * ─── Stable graph data ───
   * Only recompute when the actual node/link IDs change,
   * NOT on every 2-second snapshot poll.
   */
  const prevFingerprintRef = useRef("");
  const stableGraphRef = useRef({ nodes: [], links: [], nodeMap: new Map() });

  const fingerprint = useMemo(() => graphFingerprint(graph), [graph]);

  if (fingerprint !== prevFingerprintRef.current) {
    prevFingerprintRef.current = fingerprint;

    const rawNodes = (graph.nodes ?? []).slice(0, 600);
    const nodeSet = new Set(rawNodes.map(n => n.id));
    const rawLinks = (graph.links ?? [])
      .filter(l => nodeSet.has(l.source?.id ?? l.source) && nodeSet.has(l.target?.id ?? l.target))
      .slice(0, 1200);

    // Degree map
    const degMap = new Map();
    rawNodes.forEach(n => degMap.set(n.id, 0));
    rawLinks.forEach(l => {
      const s = l.source?.id ?? l.source, t = l.target?.id ?? l.target;
      degMap.set(s, (degMap.get(s) ?? 0) + 1);
      degMap.set(t, (degMap.get(t) ?? 0) + 1);
    });

    const nodeMap = new Map();
    const nodes = rawNodes.map(n => {
      const role = classify(n);
      const enriched = {
        ...n,
        _role: role,
        _deg: degMap.get(n.id) ?? 0,
        _color: PALETTE[role].main,
        _label: nodeDisplayName(n),
      };
      nodeMap.set(n.id, enriched);
      return enriched;
    });

    stableGraphRef.current = {
      nodes,
      links: rawLinks.map(l => ({ ...l })),
      nodeMap,
    };
  }

  const { nodes, links, nodeMap } = stableGraphRef.current;

  // graphData object – stable reference unless fingerprint changed
  const graphData = useMemo(() => ({
    nodes: [...nodes],
    links: [...links],
  }), [fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId ? (nodeMap.get(selectedId) ?? null) : null;
  const hovered = hoveredId ? (nodeMap.get(hoveredId) ?? null) : null;

  const stats = useMemo(() => {
    let a = 0, f = 0, p = 0;
    nodes.forEach(n => { const r = n._role; r === "app" ? a++ : r === "prototype" ? p++ : f++; });
    return { app: a, framework: f, prototype: p, total: nodes.length, edges: links.length };
  }, [fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchSet = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const matched = new Set();
    nodes.forEach(n => {
      if (n.id?.toLowerCase().includes(q) || n.className?.toLowerCase().includes(q) || n._label?.toLowerCase().includes(q))
        matched.add(n.id);
    });
    const extended = new Set(matched);
    links.forEach(l => {
      const s = l.source?.id ?? l.source, t = l.target?.id ?? l.target;
      if (matched.has(s)) extended.add(t);
      if (matched.has(t)) extended.add(s);
    });
    return { matched, extended };
  }, [search, fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const neighborSet = useMemo(() => {
    if (!selectedId) return null;
    const s = new Set([selectedId]);
    links.forEach(l => {
      const src = l.source?.id ?? l.source, tgt = l.target?.id ?? l.target;
      if (src === selectedId) s.add(tgt);
      if (tgt === selectedId) s.add(src);
    });
    return s;
  }, [selectedId, fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  const conn = useMemo(() => {
    if (!selectedId) return { out: [], in: [] };
    const out = [], inn = [];
    links.forEach(l => {
      const s = l.source?.id ?? l.source, t = l.target?.id ?? l.target;
      if (s === selectedId) out.push(t);
      if (t === selectedId) inn.push(s);
    });
    return { out, in: inn };
  }, [selectedId, fingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resize observer */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Fullscreen */
  function toggleFullscreen() {
    const el = containerRef.current?.closest('.bean-graph-wrapper');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* Node 3D object */
  const nodeThreeObject = useCallback((node) => {
    const nId = node.id;
    const info = nodeMap.get(nId) ?? node;
    const role = info._role ?? "framework";
    const deg = info._deg ?? 0;
    const label = info._label ?? nodeDisplayName(node);

    const isSelected = selectedId === nId;
    const isHovered = hoveredId === nId;
    const isSearchMatch = matchSet?.matched?.has(nId);
    const isSearchNeighbor = matchSet?.extended?.has(nId);
    const isNeighbor = neighborSet?.has(nId);
    const dimmed = (matchSet && !isSearchMatch && !isSearchNeighbor) ||
                   (neighborSet && !isNeighbor);

    const baseSize = Math.max(2.5, Math.min(10, 2 + deg * 0.6));
    const size = isSelected ? baseSize * 1.6 : isHovered ? baseSize * 1.3 : baseSize;
    const palette = isSelected ? PALETTE.selected : PALETTE[role];
    const opacity = dimmed ? 0.08 : 1;

    const group = new THREE.Group();

    const geo = new THREE.SphereGeometry(size, 20, 20);
    const mat = new THREE.MeshPhongMaterial({
      color: palette.main,
      emissive: palette.main,
      emissiveIntensity: isSelected ? 0.8 : isHovered ? 0.6 : 0.3,
      transparent: true,
      opacity,
      shininess: 80,
    });
    const sphere = new THREE.Mesh(geo, mat);
    group.add(sphere);

    if ((deg >= 3 || role === "app" || isSelected) && !dimmed) {
      const ringGeo = new THREE.RingGeometry(size * 1.3, size * 1.6, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: palette.main,
        transparent: true,
        opacity: isSelected ? 0.5 : 0.15,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.lookAt(0, 0, 1);
      group.add(ring);
    }

    if (showLabels && !dimmed && (deg >= 2 || role === "app" || isSelected || isHovered)) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const text = label.length > 24 ? label.slice(0, 22) + "\u2026" : label;
      canvas.width = 256;
      canvas.height = 64;
      ctx.font = "bold 22px Inter, system-ui, sans-serif";
      ctx.fillStyle = isSelected ? "#facc15" : palette.main;
      ctx.textAlign = "center";
      ctx.fillText(text, 128, 36);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: isSelected ? 1 : 0.8 });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(size * 4, size * 1.2, 1);
      sprite.position.y = size + 4;
      group.add(sprite);
    }

    return group;
  }, [selectedId, hoveredId, matchSet, neighborSet, showLabels, nodeMap]);

  /* Node 2D canvas */
  const nodeCanvasObject2D = useCallback((node, ctx, globalScale) => {
    const nId = node.id;
    const info = nodeMap.get(nId) ?? node;
    const role = info._role ?? "framework";
    const deg = info._deg ?? 0;
    const label = info._label ?? nodeDisplayName(node);

    const isSelected = selectedId === nId;
    const isHovered = hoveredId === nId;
    const dimmed = (matchSet && !matchSet.matched?.has(nId) && !matchSet.extended?.has(nId)) ||
                   (neighborSet && !neighborSet.has(nId));
    const palette = isSelected ? PALETTE.selected : PALETTE[role];
    const baseSize = Math.max(3, Math.min(12, 2.5 + deg * 0.7));
    const size = isSelected ? baseSize * 1.5 : isHovered ? baseSize * 1.2 : baseSize;

    if (!dimmed && (deg >= 2 || role === "app" || isSelected)) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size * 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = palette.glow;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = dimmed ? "rgba(100,100,100,0.1)" : palette.main;
    ctx.fill();

    if (isSelected || isHovered) {
      ctx.strokeStyle = palette.main;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    if (showLabels && !dimmed && (deg >= 2 || role === "app" || isSelected || isHovered)) {
      const displayLabel = label.length > 22 ? label.slice(0, 20) + "\u2026" : label;
      const fontSize = Math.max(10, 12) / globalScale;
      ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = dimmed ? "rgba(100,100,100,0.15)" : isSelected ? "#facc15" : "rgba(226,232,240,0.85)";
      ctx.fillText(displayLabel, node.x, node.y + size + 3 / globalScale);
    }
  }, [selectedId, hoveredId, matchSet, neighborSet, showLabels, nodeMap]);

  /* Tooltip builder – uses nodeMap for guaranteed label access */
  const nodeTooltip = useCallback((node) => {
    const info = nodeMap.get(node.id) ?? node;
    const label = info._label ?? nodeDisplayName(node);
    const role = info._role ?? "framework";
    const deg = info._deg ?? 0;
    return `<div style="background:rgba(10,10,20,0.92);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:8px 12px;font-family:Inter,system-ui,sans-serif;font-size:12px;color:#e2e8f0;max-width:280px;backdrop-filter:blur(8px)">
      <div style="font-weight:700;margin-bottom:3px;color:${PALETTE[role]?.main}">${label}</div>
      <div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-bottom:4px">${info.className ?? ""}</div>
      <div style="font-size:10px;color:#64748b">${deg} connections \u00b7 ${role} \u00b7 ${info.scope ?? "singleton"}</div>
    </div>`;
  }, [nodeMap]);

  const linkColor = useCallback((link) => {
    if (!selectedId) return matchSet ? (matchSet.matched?.has(link.source?.id ?? link.source) || matchSet.matched?.has(link.target?.id ?? link.target) ? "rgba(250,204,21,0.3)" : "rgba(100,100,100,0.04)") : LINK_COLOR;
    const s = link.source?.id ?? link.source, t = link.target?.id ?? link.target;
    return s === selectedId || t === selectedId ? LINK_HIGHLIGHT : "rgba(100,100,100,0.04)";
  }, [selectedId, matchSet]);

  const linkWidth = useCallback((link) => {
    if (!selectedId) return 0.5;
    const s = link.source?.id ?? link.source, t = link.target?.id ?? link.target;
    return s === selectedId || t === selectedId ? 2 : 0.3;
  }, [selectedId]);

  const linkParticles = useCallback((link) => {
    if (!showParticles) return 0;
    if (!selectedId) return 0;
    const s = link.source?.id ?? link.source, t = link.target?.id ?? link.target;
    return s === selectedId || t === selectedId ? 3 : 0;
  }, [selectedId, showParticles]);

  const handleNodeClick = useCallback((node) => {
    const nId = node.id;
    setSelectedId(prev => prev === nId ? null : nId);
    if (fgRef.current && is3D) {
      const info = nodeMap.get(nId);
      const deg = info?._deg ?? 0;
      const dist = 80 + deg * 15;
      fgRef.current.cameraPosition(
        { x: node.x + dist, y: node.y + dist * 0.4, z: node.z + dist },
        node,
        1200
      );
    }
  }, [is3D, nodeMap]);

  const handleNodeHover = useCallback((n) => {
    setHoveredId(n ? n.id : null);
  }, []);

  const handleBgClick = useCallback(() => setSelectedId(null), []);

  function resetCamera() {
    if (fgRef.current) {
      if (is3D) {
        fgRef.current.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 1200);
      } else {
        fgRef.current.centerAt(0, 0, 800);
        fgRef.current.zoom(1, 800);
      }
    }
  }

  function zoomGraph(factor) {
    if (fgRef.current) {
      if (is3D) {
        const cam = fgRef.current.camera();
        const pos = cam.position;
        fgRef.current.cameraPosition(
          { x: pos.x * factor, y: pos.y * factor, z: pos.z * factor },
          undefined,
          500
        );
      } else {
        const z = fgRef.current.zoom();
        fgRef.current.zoom(z / factor, 500);
      }
    }
  }

  /* ─── Empty state ─── */
  if (nodes.length === 0) {
    return (
      <div className="card bean-panel">
        <div className="card-header"><span className="card-title">Bean Dependency Graph</span></div>
        <div className="empty-state" style={{ padding: "48px 24px" }}>
          <GitBranch size={40} />
          <h3 style={{ margin: "12px 0 4px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Bean Dependency Graph</h3>
          <p style={{ maxWidth: 480, lineHeight: 1.7 }}>
            This graph visualizes every Spring bean and its dependencies.<br /><br />
            <strong style={{ color: "var(--text-primary)" }}>Requirements:</strong><br />
            1. Add <code style={{ fontSize: 11, background: "var(--bg-input)", padding: "2px 6px", borderRadius: 4 }}>spring-boot-starter-devtrace</code> to your app<br />
            2. App must have fully started (ApplicationReadyEvent)<br /><br />
            <small>The zero-code agent mode does not emit bean graphs.</small>
          </p>
        </div>
      </div>
    );
  }

  const GraphComponent = is3D ? ForceGraph3D : ForceGraph2D;
  const graphProps = is3D ? {
    nodeThreeObject,
    nodeThreeObjectExtend: false,
    linkOpacity: 0.6,
    backgroundColor: "rgba(0,0,0,0)",
    showNavInfo: false,
  } : {
    nodeCanvasObject: nodeCanvasObject2D,
    linkCanvasObjectMode: () => "replace",
  };

  return (
    <div className="bean-graph-wrapper" style={{
      display: "flex", flexDirection: "column",
      height: isFullscreen ? "100vh" : "calc(100vh - var(--header-h) - 120px)",
      background: isFullscreen ? "#0a0a0f" : "transparent",
      position: "relative",
    }}>
      {/* ─── Toolbar ─── */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center", padding: "8px 12px",
        flexShrink: 0, flexWrap: "wrap", zIndex: 10,
        background: isFullscreen ? "rgba(10,10,15,0.95)" : "transparent",
        borderBottom: isFullscreen ? "1px solid rgba(255,255,255,0.06)" : "none",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180, maxWidth: 300,
          padding: "0 10px", height: 32,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
        }}>
          <Search size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search beans\u2026"
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "var(--text-primary)" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}><X size={12} /></button>}
        </div>

        <div style={{
          display: "flex", borderRadius: 8, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <button onClick={() => setIs3D(true)} style={{
            padding: "5px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
            background: is3D ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.03)",
            color: is3D ? "#60a5fa" : "var(--text-muted)",
          }}>3D</button>
          <button onClick={() => setIs3D(false)} style={{
            padding: "5px 12px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer",
            background: !is3D ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.03)",
            color: !is3D ? "#60a5fa" : "var(--text-muted)",
          }}>2D</button>
        </div>

        <button className="btn btn-ghost" onClick={() => zoomGraph(0.7)} title="Zoom In" style={{ padding: "4px 8px" }}><ZoomIn size={14} /></button>
        <button className="btn btn-ghost" onClick={() => zoomGraph(1.4)} title="Zoom Out" style={{ padding: "4px 8px" }}><ZoomOut size={14} /></button>
        <button className="btn btn-ghost" onClick={resetCamera} title="Reset View" style={{ padding: "4px 8px" }}><RotateCcw size={14} /></button>
        <button className="btn btn-ghost" onClick={() => setShowLabels(v => !v)} title="Toggle Labels" style={{ padding: "4px 8px" }}>
          {showLabels ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button className="btn btn-ghost" onClick={() => setShowParticles(v => !v)} title="Toggle Particles" style={{ padding: "4px 8px", color: showParticles ? "#facc15" : undefined }}>
          <Sparkles size={14} />
        </button>
        <button className="btn btn-ghost" onClick={toggleFullscreen} title="Toggle Fullscreen" style={{ padding: "4px 8px" }}>
          {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
        </button>

        <div style={{ display: "flex", gap: 14, marginLeft: "auto", fontSize: 11, color: "var(--text-secondary)" }}>
          {[["app", "Your beans", stats.app], ["framework", "Framework", stats.framework], ["prototype", "Prototype", stats.prototype]]
            .filter(([, , c]) => c > 0).map(([key, label, count]) => (
              <span key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: PALETTE[key].main,
                  boxShadow: `0 0 6px ${PALETTE[key].glow}`,
                }} />
                {label} ({count})
              </span>
            ))}
          <span style={{ color: "var(--text-muted)" }}>\u00b7</span>
          <span>{stats.edges} deps</span>
        </div>
      </div>

      {/* ─── Graph Canvas ─── */}
      <div ref={containerRef} style={{
        flex: 1, position: "relative", overflow: "hidden",
        borderRadius: isFullscreen ? 0 : 10,
        border: isFullscreen ? "none" : "1px solid rgba(255,255,255,0.06)",
        background: "radial-gradient(ellipse at center, rgba(15,15,30,0.95) 0%, rgba(5,5,10,1) 100%)",
      }}>
        <GraphComponent
          ref={fgRef}
          key={is3D ? "3d" : "2d"}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeId="id"
          nodeLabel={nodeTooltip}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={linkColor}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => PARTICLE_COLOR}
          linkDirectionalParticleSpeed={0.006}
          linkCurvature={0.1}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onBackgroundClick={handleBgClick}
          cooldownTicks={120}
          warmupTicks={40}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.35}
          {...graphProps}
        />

        {/* ─── Selected Node Panel ─── */}
        {selected && (
          <div style={{
            position: "absolute", top: 12, right: 12, width: 260, zIndex: 20,
            background: "rgba(10,10,20,0.92)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(250,204,21,0.15)", borderRadius: 12,
            padding: 16, fontSize: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(250,204,21,0.05)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#facc15", wordBreak: "break-all", flex: 1 }}>
                {selected._label}
              </div>
              <button onClick={() => setSelectedId(null)} style={{
                background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer",
                color: "var(--text-muted)", padding: "4px", borderRadius: 6, flexShrink: 0,
              }}><X size={14} /></button>
            </div>
            {selected.className && (
              <div style={{
                fontFamily: "monospace", fontSize: 10, color: "#94a3b8", marginBottom: 8,
                wordBreak: "break-all", padding: "4px 6px", background: "rgba(255,255,255,0.03)",
                borderRadius: 4, border: "1px solid rgba(255,255,255,0.04)",
              }}>{selected.className}</div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {selected.scope && <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.15)",
              }}>scope: {selected.scope}</span>}
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: `${PALETTE[selected._role]?.glow ?? "rgba(255,255,255,0.05)"}`,
                color: PALETTE[selected._role]?.main ?? "#e2e8f0",
                border: `1px solid ${PALETTE[selected._role]?.main ?? "#555"}33`,
              }}>{selected._role}</span>
              <span style={{
                padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                background: "rgba(255,255,255,0.04)", color: "#94a3b8",
              }}>{selected._deg} deps</span>
            </div>
            {conn.out.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: "#34d399" }}>{"\u2192"} Depends on ({conn.out.length})</div>
                <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                  {conn.out.map(id => {
                    const dep = nodeMap.get(id);
                    return <div key={id} style={{ padding: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dep?._label ?? id}</div>;
                  })}
                </div>
              </div>
            )}
            {conn.in.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: "#f97316" }}>{"\u2190"} Used by ({conn.in.length})</div>
                <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                  {conn.in.map(id => {
                    const dep = nodeMap.get(id);
                    return <div key={id} style={{ padding: "2px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dep?._label ?? id}</div>;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Bottom stats bar ─── */}
        <div style={{
          position: "absolute", bottom: 12, left: 12, right: 12,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 14px", borderRadius: 10, fontSize: 11,
          background: "rgba(10,10,20,0.85)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#64748b", zIndex: 10,
        }}>
          <span><Box size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />{stats.total} beans \u00b7 {stats.edges} dependencies</span>
          <span>{is3D ? "Drag to orbit \u00b7 Scroll to zoom \u00b7 Click node to inspect" : "Drag to pan \u00b7 Scroll to zoom \u00b7 Click node to inspect"}</span>
          <span>{isFullscreen ? "ESC to exit fullscreen" : "Click \u26f6 for fullscreen"}</span>
        </div>
      </div>
    </div>
  );
}
