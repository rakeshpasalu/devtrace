import { useEffect, useRef, useState } from "react";
import {
  Activity, Award, GitBranch, GitCompare, HelpCircle, LayoutDashboard, Network, Play,
  Rocket, Search, Settings, Skull, Stethoscope, Terminal, TrendingUp, Zap
} from "lucide-react";

const PAGE_COMMANDS = [
  { id: "onboarding",  label: "Get Started",        icon: Zap },
  { id: "traces",      label: "Trace Explorer",     icon: Activity },
  { id: "dashboard",   label: "Dashboard",          icon: LayoutDashboard },
  { id: "startup",     label: "Boot Sequence",      icon: Rocket },
  { id: "analytics",   label: "Endpoint Analytics", icon: TrendingUp },
  { id: "autopsy",     label: "Service Autopsy",    icon: Skull },
  { id: "ais",         label: "Architecture Score", icon: Award },
  { id: "topology",    label: "Service Topology",   icon: Network },
  { id: "beans",       label: "Bean Graph",         icon: GitBranch },
  { id: "diff",        label: "Trace Diff",         icon: GitCompare },
  { id: "diagnostics", label: "Diagnostics",        icon: Stethoscope },
  { id: "replay",      label: "Request Replay",     icon: Play },
  { id: "nerd",        label: "Nerd Console",       icon: Terminal },
  { id: "settings",    label: "Settings",           icon: Settings },
  { id: "faq",         label: "FAQ",                icon: HelpCircle },
];

export default function CommandPalette({ open, onClose, onNavigate, requests }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) { setQuery(""); setSelectedIndex(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  // Global keyboard shortcut
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); onClose("toggle"); }
      if (e.key === "Escape" && open) { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const needle = query.trim().toLowerCase();

  // Filter pages
  const pageResults = PAGE_COMMANDS.filter(p =>
    !needle || p.label.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle)
  );

  // Filter traces
  const traceResults = needle.length >= 2
    ? (requests ?? []).filter(r =>
        [r.traceId, r.requestId, r.method, r.path, r.service].filter(Boolean)
          .some(v => String(v).toLowerCase().includes(needle))
      ).slice(0, 6)
    : [];

  const allResults = [
    ...pageResults.map(p => ({ type: "page", ...p })),
    ...traceResults.map(r => ({ type: "trace", id: r.traceId, label: `${r.method} ${r.path}`, sub: r.service })),
  ];

  function handleSelect(item) {
    if (item.type === "page") onNavigate(item.id);
    if (item.type === "trace") onNavigate("traces", item.id);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, allResults.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && allResults[selectedIndex]) { e.preventDefault(); handleSelect(allResults[selectedIndex]); }
  }

  return (
    <div className="cmd-overlay" onClick={() => onClose()}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <Search size={16} className="cmd-input-icon" />
          <input ref={inputRef} className="cmd-input" value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, traces, or commands…" />
          <kbd className="cmd-kbd">esc</kbd>
        </div>

        <div className="cmd-results">
          {pageResults.length > 0 && (
            <div className="cmd-group">
              <div className="cmd-group-label">Pages</div>
              {pageResults.map((p, i) => {
                const Icon = p.icon;
                const idx = allResults.findIndex(a => a.type === "page" && a.id === p.id);
                return (
                  <button key={p.id}
                    className={`cmd-result ${selectedIndex === idx ? "selected" : ""}`}
                    onClick={() => handleSelect({ type: "page", ...p })}
                    onMouseEnter={() => setSelectedIndex(idx)}>
                    <Icon size={16} />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {traceResults.length > 0 && (
            <div className="cmd-group">
              <div className="cmd-group-label">Traces</div>
              {traceResults.map((r, i) => {
                const idx = pageResults.length + i;
                return (
                  <button key={r.traceId}
                    className={`cmd-result ${selectedIndex === idx ? "selected" : ""}`}
                    onClick={() => handleSelect({ type: "trace", id: r.traceId })}
                    onMouseEnter={() => setSelectedIndex(idx)}>
                    <Activity size={16} />
                    <span>{r.method} {r.path}</span>
                    <small className="cmd-result-sub">{r.service}</small>
                  </button>
                );
              })}
            </div>
          )}
          {allResults.length === 0 && (
            <div className="cmd-empty">No results for "{query}"</div>
          )}
        </div>
      </div>
    </div>
  );
}
