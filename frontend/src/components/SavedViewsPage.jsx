import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark, Plus, Trash2, MessageSquare, Clock, ExternalLink, Search,
  Tag, X, Save, Filter, Star, StarOff, RefreshCw, Upload, Download, Cloud, CloudOff
} from "lucide-react";
import { formatDuration, formatTimestamp, authFetch, apiBase } from "../utils.js";

/* ─── Main Page ─── */
export default function SavedViewsPage({ requests, onSelectTrace, onNavigate }) {
  const [bookmarks, setBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("devtrace-bookmarks") ?? "[]"); } catch { return []; }
  });
  const [filter, setFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showBookmark, setShowBookmark] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [synced, setSynced] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Persist to localStorage as fallback
  useEffect(() => {
    localStorage.setItem("devtrace-bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks]);

  // ─── Backend sync: load on mount ───
  useEffect(() => {
    let cancelled = false;
    async function loadFromServer() {
      try {
        const res = await authFetch(`${apiBase()}/api/v1/bookmarks`);
        if (!res.ok) throw new Error();
        const serverBookmarks = await res.json();
        if (!cancelled && Array.isArray(serverBookmarks) && serverBookmarks.length > 0) {
          // Merge: server wins for duplicates, keep local-only ones
          const serverMap = new Map(serverBookmarks.map(b => [b.traceId, b]));
          const localOnly = bookmarks.filter(b => !serverMap.has(b.traceId));
          setBookmarks([...serverBookmarks, ...localOnly]);
          // Upload local-only bookmarks to server
          if (localOnly.length > 0) {
            authFetch(`${apiBase()}/api/v1/bookmarks/import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(localOnly),
            }).catch(() => {});
          }
          setSynced(true);
        } else if (!cancelled && Array.isArray(serverBookmarks)) {
          // Server has none, push local to server
          if (bookmarks.length > 0) {
            authFetch(`${apiBase()}/api/v1/bookmarks/import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bookmarks),
            }).catch(() => {});
          }
          setSynced(true);
        }
      } catch {
        if (!cancelled) setSynced(false);
      }
    }
    loadFromServer();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sync helper: push single bookmark to server ───
  const syncToServer = useCallback(async (bookmark) => {
    try {
      await authFetch(`${apiBase()}/api/v1/bookmarks/${bookmark.traceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookmark),
      });
      setSynced(true);
    } catch { setSynced(false); }
  }, []);

  const deleteFromServer = useCallback(async (traceId) => {
    try {
      await authFetch(`${apiBase()}/api/v1/bookmarks/${traceId}`, { method: "DELETE" });
    } catch {}
  }, []);

  const forceSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await authFetch(`${apiBase()}/api/v1/bookmarks/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookmarks),
      });
      if (res.ok) setSynced(true);
    } catch { setSynced(false); }
    setSyncing(false);
  }, [bookmarks]);

  // All unique tags
  const allTags = useMemo(() => {
    const tags = new Set();
    for (const b of bookmarks) {
      for (const t of (b.tags ?? [])) tags.add(t);
    }
    return [...tags].sort();
  }, [bookmarks]);

  const filtered = useMemo(() => {
    let arr = bookmarks;
    if (filter) {
      const q = filter.toLowerCase();
      arr = arr.filter(b =>
        b.traceId.toLowerCase().includes(q) ||
        (b.label ?? "").toLowerCase().includes(q) ||
        (b.method ?? "").toLowerCase().includes(q) ||
        (b.path ?? "").toLowerCase().includes(q) ||
        (b.notes ?? []).some(n => n.text.toLowerCase().includes(q))
      );
    }
    if (tagFilter) arr = arr.filter(b => (b.tags ?? []).includes(tagFilter));
    return arr.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.savedAt - a.savedAt);
  }, [bookmarks, filter, tagFilter]);

  function addBookmark(trace) {
    if (bookmarks.some(b => b.traceId === trace.traceId)) return;
    const newBookmark = {
      traceId: trace.traceId,
      requestId: trace.requestId,
      method: trace.method,
      path: trace.path,
      service: trace.service,
      status: trace.status,
      durationMs: trace.durationMs,
      label: `${trace.method} ${trace.path}`,
      notes: [],
      tags: [],
      starred: false,
      savedAt: Date.now(),
    };
    setBookmarks(prev => [...prev, newBookmark]);
    syncToServer(newBookmark);
  }

  function removeBookmark(traceId) {
    setBookmarks(prev => prev.filter(b => b.traceId !== traceId));
    deleteFromServer(traceId);
  }

  function toggleStar(traceId) {
    setBookmarks(prev => {
      const updated = prev.map(b => b.traceId === traceId ? { ...b, starred: !b.starred } : b);
      const bookmark = updated.find(b => b.traceId === traceId);
      if (bookmark) syncToServer(bookmark);
      return updated;
    });
  }

  function addNote(traceId) {
    if (!noteText.trim()) return;
    setBookmarks(prev => {
      const updated = prev.map(b =>
        b.traceId === traceId
          ? { ...b, notes: [...(b.notes ?? []), { text: noteText, author: "You", timestamp: Date.now() }] }
          : b
      );
      const bookmark = updated.find(b => b.traceId === traceId);
      if (bookmark) syncToServer(bookmark);
      return updated;
    });
    setNoteText("");
    setEditingNote(null);
  }

  function addTag(traceId, tag) {
    if (!tag.trim()) return;
    setBookmarks(prev => {
      const updated = prev.map(b =>
        b.traceId === traceId && !(b.tags ?? []).includes(tag)
          ? { ...b, tags: [...(b.tags ?? []), tag] }
          : b
      );
      const bookmark = updated.find(b => b.traceId === traceId);
      if (bookmark) syncToServer(bookmark);
      return updated;
    });
  }

  function removeTag(traceId, tag) {
    setBookmarks(prev => {
      const updated = prev.map(b =>
        b.traceId === traceId ? { ...b, tags: (b.tags ?? []).filter(t => t !== tag) } : b
      );
      const bookmark = updated.find(b => b.traceId === traceId);
      if (bookmark) syncToServer(bookmark);
      return updated;
    });
  }

  function removeNote(traceId, idx) {
    setBookmarks(prev => {
      const updated = prev.map(b =>
        b.traceId === traceId ? { ...b, notes: (b.notes ?? []).filter((_, i) => i !== idx) } : b
      );
      const bookmark = updated.find(b => b.traceId === traceId);
      if (bookmark) syncToServer(bookmark);
      return updated;
    });
  }

  // Export bookmarks as JSON
  function exportBookmarks() {
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `devtrace-bookmarks-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import bookmarks from JSON file
  function importBookmarks() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (Array.isArray(imported)) {
          const existingIds = new Set(bookmarks.map(b => b.traceId));
          const newOnes = imported.filter(b => b.traceId && !existingIds.has(b.traceId));
          if (newOnes.length > 0) {
            setBookmarks(prev => [...prev, ...newOnes]);
            // Sync to server
            authFetch(`${apiBase()}/api/v1/bookmarks/import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newOnes),
            }).catch(() => {});
          }
        }
      } catch { /* ignore invalid files */ }
    };
    input.click();
  }

  // Traces not yet bookmarked
  const unbookmarked = useMemo(() => {
    const ids = new Set(bookmarks.map(b => b.traceId));
    return (requests ?? []).filter(r => !ids.has(r.traceId));
  }, [requests, bookmarks]);

  return (
    <>
      <div className="page-header">
        <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bookmark size={22} /> Saved Views & Annotations
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span title={synced ? "Synced with server" : "Local only"} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: synced ? "var(--green)" : "var(--text-muted)" }}>
            {synced ? <Cloud size={14} /> : <CloudOff size={14} />}
            {synced ? "Synced" : "Local"}
          </span>
          <button className="btn btn-ghost" onClick={forceSync} disabled={syncing} title="Sync all bookmarks to server" style={{ padding: "4px 8px", fontSize: 11 }}>
            <RefreshCw size={12} className={syncing ? "spin" : ""} /> Sync
          </button>
          <button className="btn btn-ghost" onClick={exportBookmarks} title="Export bookmarks" style={{ padding: "4px 8px", fontSize: 11 }}>
            <Download size={12} /> Export
          </button>
          <button className="btn btn-ghost" onClick={importBookmarks} title="Import bookmarks" style={{ padding: "4px 8px", fontSize: 11 }}>
            <Upload size={12} /> Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowBookmark(!showBookmark)}>
            <Plus size={14} /> Bookmark Trace
          </button>
        </div>
      </div>

      {/* Quick-add panel */}
      {showBookmark && unbookmarked.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Select a trace to bookmark</span>
            <button className="btn btn-ghost" onClick={() => setShowBookmark(false)} style={{ fontSize: 11, padding: "4px 8px" }}><X size={14} /></button>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {unbookmarked.slice(0, 20).map(t => (
              <div key={t.traceId} className="saved-quick-add" onClick={() => { addBookmark(t); setShowBookmark(false); }}>
                <span style={{
                  color: t.method === "GET" ? "var(--green)" : t.method === "POST" ? "var(--accent)" : "var(--amber)",
                  fontWeight: 700, fontSize: 10, fontFamily: "var(--font-mono)", minWidth: 40
                }}>{t.method}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.path}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{t.traceId.slice(0, 12)}…</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>{formatDuration(t.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {bookmarks.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Search bookmarks…"
            style={{ width: 220, padding: "5px 10px", fontSize: 12, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none" }} />
          {allTags.length > 0 && (
            <>
              <Filter size={14} style={{ color: "var(--text-muted)", marginLeft: 8 }} />
              <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}
                style={{ padding: "5px 10px", fontSize: 12, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)" }}>
                <option value="">All tags</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </>
          )}
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{filtered.length} bookmark{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Bookmarks */}
      {bookmarks.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Bookmark size={40} style={{ color: "var(--accent)", marginBottom: 12 }} />
          <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Saved Views & Annotations</h3>
          <p style={{ color: "var(--text-secondary)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
            Bookmark important traces, add notes for your team, and tag them for easy retrieval.
            Bookmarks are synced to the server so your whole team can see them.<br /><br />
            Click "Bookmark Trace" to save your first trace.
          </p>
        </div>
      ) : (
        <div className="saved-grid">
          {filtered.map(b => (
            <div key={b.traceId} className="saved-card">
              <div className="saved-card-header">
                <div className="saved-card-left">
                  <button className="saved-star" onClick={() => toggleStar(b.traceId)} title={b.starred ? "Unstar" : "Star"}>
                    {b.starred ? <Star size={16} style={{ color: "var(--amber)", fill: "var(--amber)" }} /> : <StarOff size={16} style={{ color: "var(--text-muted)" }} />}
                  </button>
                  <div>
                    <div className="saved-card-route">
                      <span style={{ color: b.method === "GET" ? "var(--green)" : b.method === "POST" ? "var(--accent)" : b.method === "DELETE" ? "var(--red)" : "var(--amber)", fontWeight: 700, fontSize: 11, fontFamily: "var(--font-mono)" }}>{b.method}</span>
                      <span className="saved-card-path" title={b.path}>{b.path}</span>
                    </div>
                    <div className="saved-card-meta">
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{b.traceId.slice(0, 16)}…</span>
                      <span>{b.service}</span>
                      <span>{formatDuration(b.durationMs)}</span>
                      <span style={{ color: b.status === "ERROR" ? "var(--red)" : "var(--green)" }}>{b.status}</span>
                    </div>
                  </div>
                </div>
                <div className="saved-card-actions">
                  <button className="btn btn-ghost" onClick={() => { onSelectTrace?.(b.traceId); onNavigate?.("traces"); }} style={{ padding: "4px 6px", fontSize: 10 }}>
                    <ExternalLink size={12} /> View
                  </button>
                  <button className="btn btn-ghost" onClick={() => removeBookmark(b.traceId)} style={{ padding: "4px 6px", color: "var(--red)" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div className="saved-tags">
                {(b.tags ?? []).map(tag => (
                  <span key={tag} className="saved-tag">
                    <Tag size={10} /> {tag}
                    <button className="saved-tag-remove" onClick={() => removeTag(b.traceId, tag)}>×</button>
                  </span>
                ))}
                <TagInput onAdd={tag => addTag(b.traceId, tag)} />
              </div>

              {/* Notes */}
              <div className="saved-notes">
                {(b.notes ?? []).map((note, i) => (
                  <div key={i} className="saved-note">
                    <div className="saved-note-header">
                      <span className="saved-note-author">{note.author}</span>
                      <span className="saved-note-time">{formatTimestamp(note.timestamp)}</span>
                      <button className="saved-note-delete" onClick={() => removeNote(b.traceId, i)}>×</button>
                    </div>
                    <div className="saved-note-text">{note.text}</div>
                  </div>
                ))}
                {editingNote === b.traceId ? (
                  <div className="saved-note-editor">
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                      placeholder="Add a note for your team…" rows={2}
                      style={{ width: "100%", resize: "vertical", padding: "8px 10px", fontSize: 12, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-primary)", outline: "none", fontFamily: "var(--font-sans)" }} />
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                      <button className="btn btn-ghost" onClick={() => { setEditingNote(null); setNoteText(""); }} style={{ fontSize: 11, padding: "4px 8px" }}>Cancel</button>
                      <button className="btn btn-primary" onClick={() => addNote(b.traceId)} style={{ fontSize: 11, padding: "4px 10px" }} disabled={!noteText.trim()}>
                        <Save size={12} /> Add Note
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="saved-add-note" onClick={() => { setEditingNote(b.traceId); setNoteText(""); }}>
                    <MessageSquare size={12} /> Add Note
                  </button>
                )}
              </div>

              <div className="saved-card-footer">
                <Clock size={10} /> Saved {formatTimestamp(b.savedAt)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Tag Input ─── */
function TagInput({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  function submit(e) {
    e.preventDefault();
    if (val.trim()) { onAdd(val.trim()); setVal(""); setOpen(false); }
  }

  if (!open) return (
    <button className="saved-tag-add" onClick={() => setOpen(true)}>
      <Plus size={10} /> tag
    </button>
  );

  return (
    <form onSubmit={submit} style={{ display: "inline-flex", gap: 4 }}>
      <input value={val} onChange={e => setVal(e.target.value)} autoFocus
        placeholder="tag name" onBlur={() => { if (!val) setOpen(false); }}
        style={{ width: 80, padding: "2px 6px", fontSize: 10, background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", outline: "none" }} />
    </form>
  );
}

