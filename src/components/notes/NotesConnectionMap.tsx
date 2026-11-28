import React, { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  Globe,
  Hash,
  Link2,
  LocateFixed,
  Network,
  Plus,
  Search,
  Unlink,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import {
  appendWikiLinkToHtml,
  buildNoteChildrenMap,
  buildRadialNoteGraph,
  extractAllNoteEdges,
  getNoteAncestorChain,
  getNotebookColor,
  type NoteConnectionKind,
} from "../../lib/noteGraphUtils";
import type { Entry, NoteNotebook } from "../../types";
import type { AiChatRecord } from "../../types/aiVault";

export type ConnectionMapMode = "tree" | "graph";
export type ConnectionMapScope = "active" | "workspace";
export type GraphDepthMode = "1-hop" | "2-hop" | "all";

interface NotesConnectionMapProps {
  allNotes: Entry[];
  notebooks: NoteNotebook[];
  focusedNoteId: string | null;
  isOpenDesktop: boolean;
  isOpenMobile: boolean;
  mode: ConnectionMapMode;
  onModeChange: (mode: ConnectionMapMode) => void;
  onFocusNote: (noteId: string) => void;
  onOpenNote: (noteId: string) => void;
  onUpdateNoteContent: (noteId: string, nextHtml: string, targetTitle: string) => void;
  aiChats?: AiChatRecord[];
  onToggleAiChatLink?: (chatId: string, noteId: string) => void;
  onJumpToAiChat?: (chatId: string) => void;
  onCloseDesktop: () => void;
  onCloseMobile: () => void;
}

export const NotesConnectionMap: React.FC<NotesConnectionMapProps> = ({
  allNotes,
  notebooks,
  focusedNoteId,
  isOpenDesktop,
  isOpenMobile,
  mode,
  onModeChange,
  onFocusNote,
  onOpenNote,
  onUpdateNoteContent,
  aiChats = [],
  onToggleAiChatLink,
  onJumpToAiChat,
  onCloseDesktop,
  onCloseMobile,
}) => {
  const [scope, setScope] = useState<ConnectionMapScope>("active");
  const [depthMode, setDepthMode] = useState<GraphDepthMode>("2-hop");
  const [enabledKinds, setEnabledKinds] = useState<Record<NoteConnectionKind, boolean>>({
    wikilink: true,
    hierarchy: true,
    tag: false,
  });

  // + Link Note / Link AI Chat picker state
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [aiLinkPickerOpen, setAiLinkPickerOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");

  // Tree collapsible sections
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Graph interaction state (pan, zoom, node drag overrides, hover focus)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [nodeOffsets, setNodeOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<
    | { kind: "pan"; startX: number; startY: number; origX: number; origY: number }
    | {
        kind: "node";
        nodeId: string;
        startX: number;
        startY: number;
        origDx: number;
        origDy: number;
        moved: boolean;
      }
    | null
  >(null);

  const noteById = useMemo(() => new Map(allNotes.map((n) => [n.id, n])), [allNotes]);
  const childrenMap = useMemo(() => buildNoteChildrenMap(allNotes), [allNotes]);

  const effectiveFocusNote = useMemo(() => {
    if (focusedNoteId && noteById.has(focusedNoteId)) {
      return noteById.get(focusedNoteId)!;
    }
    return allNotes[0] ?? null;
  }, [focusedNoteId, noteById, allNotes]);

  const allEdges = useMemo(
    () => extractAllNoteEdges(allNotes, enabledKinds),
    [allNotes, enabledKinds],
  );

  // Compute Tree relations for active note
  const treeRelations = useMemo(() => {
    if (!effectiveFocusNote) {
      return {
        ancestors: [] as Entry[],
        subPages: [] as Entry[],
        outgoing: [] as Entry[],
        backlinks: [] as Entry[],
        sharedTags: [] as Array<{ note: Entry; label: string }>,
      };
    }

    const id = effectiveFocusNote.id;
    const ancestors = getNoteAncestorChain(id, noteById);
    const subPages = childrenMap.get(id) ?? [];

    const outgoingIds = new Set<string>();
    const backlinkIds = new Set<string>();
    const sharedTagEntries: Array<{ note: Entry; label: string }> = [];

    for (const edge of allEdges) {
      if (edge.kind === "wikilink") {
        if (edge.source === id) outgoingIds.add(edge.target);
        if (edge.target === id) backlinkIds.add(edge.source);
      } else if (edge.kind === "tag") {
        if (edge.source === id) {
          const n = noteById.get(edge.target);
          if (n) sharedTagEntries.push({ note: n, label: edge.label || "" });
        } else if (edge.target === id) {
          const n = noteById.get(edge.source);
          if (n) sharedTagEntries.push({ note: n, label: edge.label || "" });
        }
      }
    }

    const outgoing = Array.from(outgoingIds)
      .map((nid) => noteById.get(nid))
      .filter((n): n is Entry => Boolean(n));
    const backlinks = Array.from(backlinkIds)
      .map((nid) => noteById.get(nid))
      .filter((n): n is Entry => Boolean(n));

    return { ancestors, subPages, outgoing, backlinks, sharedTags: sharedTagEntries };
  }, [effectiveFocusNote, noteById, childrenMap, allEdges]);

  // Workspace degree summary for Global Tree mode
  const workspaceHubs = useMemo(() => {
    const degree = new Map<string, number>();
    for (const n of allNotes) degree.set(n.id, 0);
    for (const e of allEdges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    }
    return [...allNotes]
      .map((note) => ({ note, count: degree.get(note.id) || 0 }))
      .sort((a, b) => b.count - a.count || a.note.title.localeCompare(b.note.title));
  }, [allNotes, allEdges]);

  // Radial Graph layout
  const graphLayout = useMemo(() => {
    const effectiveDepth: GraphDepthMode = scope === "workspace" ? "all" : depthMode;
    return buildRadialNoteGraph({
      notes: allNotes,
      notebooks,
      centerNoteId: effectiveFocusNote?.id ?? null,
      depthMode: effectiveDepth,
      enabledKinds,
    });
  }, [allNotes, notebooks, effectiveFocusNote?.id, scope, depthMode, enabledKinds]);

  const positionedNodes = useMemo(() => {
    return graphLayout.nodes.map((node) => {
      const off = nodeOffsets[node.id];
      return off ? { ...node, x: node.x + off.dx, y: node.y + off.dy } : node;
    });
  }, [graphLayout.nodes, nodeOffsets]);

  const nodePosMap = useMemo(
    () => new Map(positionedNodes.map((n) => [n.id, n])),
    [positionedNodes],
  );

  const hoverNeighbors = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set<string>([hoveredNodeId]);
    for (const e of graphLayout.edges) {
      if (e.source === hoveredNodeId) set.add(e.target);
      if (e.target === hoveredNodeId) set.add(e.source);
    }
    return set;
  }, [hoveredNodeId, graphLayout.edges]);

  const linkCandidates = useMemo(() => {
    if (!effectiveFocusNote) return [];
    const q = linkQuery.trim().toLowerCase();
    return allNotes
      .filter((n) => n.id !== effectiveFocusNote.id)
      .filter((n) => !q || (n.title || "Untitled Note").toLowerCase().includes(q))
      .slice(0, 12);
  }, [allNotes, effectiveFocusNote, linkQuery]);

  const linkedAiChats = useMemo(() => {
    if (!effectiveFocusNote) return [];
    return aiChats.filter((c) =>
      (c.linkedNoteIds || []).includes(effectiveFocusNote.id),
    );
  }, [aiChats, effectiveFocusNote]);

  const aiChatCandidates = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    return aiChats
      .filter(
        (c) =>
          !q ||
          (c.title || "Untitled AI Chat").toLowerCase().includes(q) ||
          (c.model || "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [aiChats, linkQuery]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetViewport = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setNodeOffsets({});
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    dragStateRef.current = {
      kind: "pan",
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      setPan({ x: drag.origX + dx, y: drag.origY + dy });
    } else if (drag.kind === "node") {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (dist > 3) drag.moved = true;
      const dx = (e.clientX - drag.startX) / zoom;
      const dy = (e.clientY - drag.startY) / zoom;
      setNodeOffsets((prev) => ({
        ...prev,
        [drag.nodeId]: { dx: drag.origDx + dx, dy: drag.origDy + dy },
      }));
    }
  };

  const handleSvgPointerUp = () => {
    dragStateRef.current = null;
  };

  const renderTreeNoteRow = (note: Entry, subtitle?: string) => {
    const color = getNotebookColor(note.notebookId, notebooks);
    const isFocused = effectiveFocusNote?.id === note.id;
    return (
      <div
        key={`${note.id}:${subtitle ?? ""}`}
        className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
        style={{
          backgroundColor: isFocused ? "var(--accent-soft)" : "transparent",
        }}
      >
        <button
          type="button"
          onClick={() => onFocusNote(note.id)}
          onDoubleClick={() => onOpenNote(note.id)}
          className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
          title="Click to inspect connections · Double-click to open"
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="text-xs font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {note.title || "Untitled Note"}
            </div>
            {subtitle && (
              <div
                className="text-[10.5px] font-mono truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {subtitle}
              </div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onOpenNote(note.id)}
          title="Open note"
          aria-label={`Open ${note.title || "Untitled Note"}`}
          className="h-6 w-6 flex items-center justify-center rounded-md opacity-70 group-hover:opacity-100 hover:bg-[var(--bg-surface)] cursor-pointer shrink-0"
          style={{ color: "var(--accent)" }}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  const renderTreeGroup = (
    key: string,
    title: string,
    count: number,
    icon: React.ReactNode,
    children: React.ReactNode,
  ) => {
    const collapsed = Boolean(collapsedGroups[key]);
    return (
      <div
        className="rounded-xl border overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <button
          type="button"
          onClick={() => toggleGroup(key)}
          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <span style={{ color: "var(--accent)" }}>{icon}</span>
            <span>{title}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
            <span>{count}</span>
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </span>
        </button>
        {!collapsed && (
          <div
            className="px-1.5 pb-1.5 pt-1 border-t space-y-0.5"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {children}
          </div>
        )}
      </div>
    );
  };

  const panelBody = (isMobile: boolean) => (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Header */}
      <div
        className="h-12 px-3 flex items-center justify-between gap-2 border-b shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Network className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold truncate">Connections</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Mode Switcher */}
          <div
            className="inline-flex items-center p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => onModeChange("tree")}
              className="px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: mode === "tree" ? "var(--bg-surface)" : "transparent",
                color: mode === "tree" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              Tree
            </button>
            <button
              type="button"
              onClick={() => onModeChange("graph")}
              className="px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: mode === "graph" ? "var(--bg-surface)" : "transparent",
                color: mode === "graph" ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              Graph
            </button>
          </div>

          <button
            type="button"
            onClick={isMobile ? onCloseMobile : onCloseDesktop}
            aria-label="Close connection map"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Controls Strip: Scope + Focus Picker + Relationship Layer Filters + Link Note */}
      <div
        className="px-3 py-2.5 border-b space-y-2 shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="inline-flex items-center p-0.5 rounded-lg border"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => setScope("active")}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
              style={{
                backgroundColor: scope === "active" ? "var(--bg-surface)" : "transparent",
                color: scope === "active" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <LocateFixed className="w-3 h-3" />
              <span>Active Note</span>
            </button>
            <button
              type="button"
              onClick={() => setScope("workspace")}
              className="px-2 py-0.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
              style={{
                backgroundColor:
                  scope === "workspace" ? "var(--bg-surface)" : "transparent",
                color: scope === "workspace" ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              <Globe className="w-3 h-3" />
              <span>Workspace</span>
            </button>
          </div>

          {effectiveFocusNote && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setLinkPickerOpen((v) => !v);
                  setAiLinkPickerOpen(false);
                  setLinkQuery("");
                }}
                className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:border-[var(--accent)] cursor-pointer shrink-0"
                style={{
                  backgroundColor: linkPickerOpen ? "var(--accent-soft)" : "var(--bg-canvas)",
                  borderColor: linkPickerOpen ? "var(--accent)" : "var(--border-subtle)",
                  color: linkPickerOpen ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                <Plus className="w-3 h-3" />
                <span>Link Note</span>
              </button>
              {onToggleAiChatLink && aiChats.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setAiLinkPickerOpen((v) => !v);
                    setLinkPickerOpen(false);
                    setLinkQuery("");
                  }}
                  title="Link AI Vault chat"
                  className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:border-[var(--accent)] cursor-pointer shrink-0"
                  style={{
                    backgroundColor: aiLinkPickerOpen ? "var(--accent-soft)" : "var(--bg-canvas)",
                    borderColor: aiLinkPickerOpen ? "var(--accent)" : "var(--border-subtle)",
                    color: aiLinkPickerOpen ? "var(--accent)" : "var(--text-primary)",
                  }}
                >
                  <Brain className="w-3 h-3" />
                  <span>AI</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Focused Note Selector */}
        {allNotes.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={effectiveFocusNote?.id || ""}
              onChange={(e) => onFocusNote(e.target.value)}
              aria-label="Focused note"
              className="flex-1 min-w-0 h-7 px-2 rounded-lg border text-xs font-medium outline-none cursor-pointer"
              style={{
                backgroundColor: "var(--bg-canvas)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              {allNotes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || "Untitled Note"}
                </option>
              ))}
            </select>
            {effectiveFocusNote && (
              <button
                type="button"
                onClick={() => onOpenNote(effectiveFocusNote.id)}
                title="Open focused note"
                className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer shrink-0"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--accent)",
                }}
              >
                <span>Open</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Inline + Link Note Picker */}
        {linkPickerOpen && effectiveFocusNote && (
          <div
            className="rounded-xl border p-2 space-y-1.5"
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderColor: "var(--accent)",
            }}
          >
            <div className="flex items-center gap-1.5 px-2 h-7 rounded-md border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-surface)" }}>
              <Search className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder={`Link a note into "${effectiveFocusNote.title || "Untitled"}"...`}
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {linkCandidates.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => {
                    const nextHtml = appendWikiLinkToHtml(
                      effectiveFocusNote.content,
                      target,
                    );
                    onUpdateNoteContent(
                      effectiveFocusNote.id,
                      nextHtml,
                      target.title || "Untitled Note",
                    );
                    setLinkPickerOpen(false);
                    setLinkQuery("");
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                >
                  <FileText className="w-3 h-3 shrink-0 opacity-75" />
                  <span className="truncate">{target.title || "Untitled Note"}</span>
                </button>
              ))}
              {linkCandidates.length === 0 && (
                <p className="px-2 py-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  No matching notes to link.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Inline + Link AI Vault Chat Picker */}
        {aiLinkPickerOpen && effectiveFocusNote && onToggleAiChatLink && (
          <div
            className="rounded-xl border p-2 space-y-1.5"
            style={{
              backgroundColor: "var(--bg-canvas)",
              borderColor: "var(--accent)",
            }}
          >
            <div className="flex items-center gap-1.5 px-2 h-7 rounded-md border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-surface)" }}>
              <Search className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search AI Vault chats to link..."
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {aiChatCandidates.map((chat) => {
                const isLinked = (chat.linkedNoteIds || []).includes(
                  effectiveFocusNote.id,
                );
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => {
                      onToggleAiChatLink(chat.id, effectiveFocusNote.id);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-xs text-left hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Brain className="w-3 h-3 shrink-0 opacity-75" />
                      <span className="truncate">{chat.title || "Untitled AI Chat"}</span>
                    </span>
                    <span
                      className="text-[10px] font-mono shrink-0"
                      style={{
                        color: isLinked ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {isLinked ? "Linked" : "Link"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Relationship Layer Toggles */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            {(
              [
                { kind: "wikilink" as const, label: "Links", icon: Link2 },
                { kind: "hierarchy" as const, label: "Hierarchy", icon: GitBranch },
                { kind: "tag" as const, label: "Tags", icon: Hash },
              ] as const
            ).map(({ kind, label, icon: Icon }) => {
              const on = enabledKinds[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() =>
                    setEnabledKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))
                  }
                  aria-pressed={on}
                  className="h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                  style={{
                    backgroundColor: on ? "var(--accent-soft)" : "transparent",
                    borderColor: on ? "var(--accent)" : "var(--border-subtle)",
                    color: on ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {mode === "graph" && scope === "active" && (
            <div
              className="inline-flex items-center rounded-md border p-0.5"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {(["1-hop", "2-hop", "all"] as GraphDepthMode[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDepthMode(d)}
                  className="px-1.5 py-0.5 rounded text-[10.5px] font-mono cursor-pointer"
                  style={{
                    backgroundColor: depthMode === d ? "var(--accent-soft)" : "transparent",
                    color: depthMode === d ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {d === "all" ? "All" : d}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Map Body */}
      {allNotes.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2"
          style={{ color: "var(--text-muted)" }}
        >
          <Network className="w-7 h-7 opacity-45" />
          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            No notes to map yet
          </p>
          <p className="text-[11px]">
            Create notes, nest sub-pages, or link them with [[Title]] to explore your knowledge map.
          </p>
        </div>
      ) : mode === "tree" ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {scope === "active" && effectiveFocusNote ? (
            <>
              {enabledKinds.hierarchy &&
                renderTreeGroup(
                  "ancestors",
                  "Parent & Ancestors",
                  treeRelations.ancestors.length,
                  <GitBranch className="w-3.5 h-3.5" />,
                  treeRelations.ancestors.length > 0 ? (
                    treeRelations.ancestors.map((n, idx) =>
                      renderTreeNoteRow(n, `Level ${idx + 1}`),
                    )
                  ) : (
                    <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Top-level page
                    </p>
                  ),
                )}

              {enabledKinds.hierarchy &&
                renderTreeGroup(
                  "subpages",
                  "Sub-pages",
                  treeRelations.subPages.length,
                  <FileText className="w-3.5 h-3.5" />,
                  treeRelations.subPages.length > 0 ? (
                    treeRelations.subPages.map((n) => renderTreeNoteRow(n))
                  ) : (
                    <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      No nested sub-pages
                    </p>
                  ),
                )}

              {enabledKinds.wikilink &&
                renderTreeGroup(
                  "outgoing",
                  "Outgoing Links",
                  treeRelations.outgoing.length,
                  <Link2 className="w-3.5 h-3.5" />,
                  treeRelations.outgoing.length > 0 ? (
                    treeRelations.outgoing.map((n) => renderTreeNoteRow(n))
                  ) : (
                    <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Use [[Title]] or &ldquo;+ Link Note&rdquo; to reference other notes.
                    </p>
                  ),
                )}

              {enabledKinds.wikilink &&
                renderTreeGroup(
                  "backlinks",
                  "Backlinks",
                  treeRelations.backlinks.length,
                  <ArrowUpRight className="w-3.5 h-3.5" />,
                  treeRelations.backlinks.length > 0 ? (
                    treeRelations.backlinks.map((n) => renderTreeNoteRow(n))
                  ) : (
                    <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      No other notes link here yet.
                    </p>
                  ),
                )}

              {enabledKinds.tag &&
                renderTreeGroup(
                  "tags",
                  "Shared Tags",
                  treeRelations.sharedTags.length,
                  <Hash className="w-3.5 h-3.5" />,
                  treeRelations.sharedTags.length > 0 ? (
                    treeRelations.sharedTags.map(({ note, label }) =>
                      renderTreeNoteRow(note, label),
                    )
                  ) : (
                    <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      No notes share tags with this note.
                    </p>
                  ),
                )}

              {(linkedAiChats.length > 0 || aiChats.length > 0) &&
                renderTreeGroup(
                  "ai_vault",
                  "Linked AI Chats",
                  linkedAiChats.length,
                  <Brain className="w-3.5 h-3.5" />,
                  linkedAiChats.length > 0 ? (
                    linkedAiChats.map((chat) => (
                      <div
                        key={chat.id}
                        className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-[var(--bg-surface-hover)]"
                      >
                        <button
                          type="button"
                          onClick={() => onJumpToAiChat?.(chat.id)}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                        >
                          <Brain className="w-3.5 h-3.5 shrink-0 opacity-75" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">
                              {chat.title || "Untitled AI Chat"}
                            </div>
                            <div
                              className="text-[10.5px] font-mono truncate"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {chat.model || chat.platform} · {chat.turnCount} turns
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {onToggleAiChatLink && (
                            <button
                              type="button"
                              onClick={() =>
                                onToggleAiChatLink(chat.id, effectiveFocusNote.id)
                              }
                              title="Unlink AI chat"
                              className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--bg-surface)] cursor-pointer"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          )}
                          {onJumpToAiChat && (
                            <button
                              type="button"
                              onClick={() => onJumpToAiChat(chat.id)}
                              title="Open in AI Vault"
                              className="h-6 w-6 flex items-center justify-center rounded-md opacity-70 group-hover:opacity-100 hover:bg-[var(--bg-surface)] cursor-pointer"
                              style={{ color: "var(--accent)" }}
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      No AI Vault chats linked yet.
                    </p>
                  ),
                )}
            </>
          ) : (
            renderTreeGroup(
              "workspace_hubs",
              "Workspace Hubs",
              workspaceHubs.length,
              <Globe className="w-3.5 h-3.5" />,
              workspaceHubs.map(({ note, count }) =>
                renderTreeNoteRow(note, `${count} connection${count === 1 ? "" : "s"}`),
              ),
            )
          )}
        </div>
      ) : (
        /* Anytype-style Radial Hub SVG Graph */
        <div className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
          <svg
            ref={svgRef}
            viewBox="-240 -240 480 480"
            className="w-full h-full touch-none select-none cursor-grab active:cursor-grabbing"
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerUp}
            onWheel={(e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.12 : 0.9;
              setZoom((z) => Math.min(2.6, Math.max(0.42, z * factor)));
            }}
          >
            <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
              {/* Connection Lines */}
              {graphLayout.edges.map((edge) => {
                const s = nodePosMap.get(edge.source);
                const t = nodePosMap.get(edge.target);
                if (!s || !t) return null;

                const isHighlighted =
                  !hoverNeighbors ||
                  (hoverNeighbors.has(edge.source) && hoverNeighbors.has(edge.target));
                const strokeColor =
                  edge.kind === "wikilink"
                    ? "var(--accent)"
                    : edge.kind === "hierarchy"
                      ? "var(--text-secondary)"
                      : "var(--text-muted)";

                return (
                  <line
                    key={edge.id}
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={strokeColor}
                    strokeWidth={edge.kind === "wikilink" ? 1.35 : 1.05}
                    strokeDasharray={
                      edge.kind === "hierarchy"
                        ? "4 3"
                        : edge.kind === "tag"
                          ? "2 3"
                          : undefined
                    }
                    opacity={
                      isHighlighted
                        ? edge.kind === "tag"
                          ? 0.45
                          : 0.72
                        : 0.14
                    }
                  />
                );
              })}

              {/* Nodes */}
              {positionedNodes.map((node) => {
                const isCenter = node.id === effectiveFocusNote?.id;
                const isDimmed = Boolean(hoverNeighbors && !hoverNeighbors.has(node.id));
                const radius = isCenter ? 9 : 5.5 + Math.min(6, node.degree * 1.15);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    opacity={isDimmed ? 0.22 : 1}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() =>
                      setHoveredNodeId((prev) => (prev === node.id ? null : prev))
                    }
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const off = nodeOffsets[node.id] ?? { dx: 0, dy: 0 };
                      dragStateRef.current = {
                        kind: "node",
                        nodeId: node.id,
                        startX: e.clientX,
                        startY: e.clientY,
                        origDx: off.dx,
                        origDy: off.dy,
                        moved: false,
                      };
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dragStateRef.current?.kind === "node" && dragStateRef.current.moved) {
                        return;
                      }
                      onFocusNote(node.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onOpenNote(node.id);
                    }}
                  >
                    {isCenter && (
                      <circle
                        r={radius + 4}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        opacity={0.75}
                      />
                    )}
                    <circle
                      r={radius}
                      fill={node.color}
                      stroke="var(--bg-canvas)"
                      strokeWidth={1.5}
                    />
                    <text
                      y={radius + 12}
                      textAnchor="middle"
                      fontSize={isCenter ? 10.5 : 9.5}
                      fontWeight={isCenter ? 600 : 500}
                      fill="var(--text-primary)"
                      stroke="var(--bg-canvas)"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {node.title.length > 20 ? `${node.title.slice(0, 19)}…` : node.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Top-right Zoom & Reset Controls */}
          <div
            className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-lg border p-0.5 backdrop-blur-sm"
            style={{
              backgroundColor: "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.45, z / 1.2))}
              title="Zoom out"
              aria-label="Zoom out"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.6, z * 1.2))}
              title="Zoom in"
              aria-label="Zoom in"
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={resetViewport}
              title="Reset view"
              aria-label="Reset graph view"
              className="h-6 px-1.5 flex items-center justify-center rounded text-[10px] font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              Reset
            </button>
          </div>

          {/* Bottom Focused Node Bar */}
          {effectiveFocusNote && (
            <div
              className="px-3 py-2 border-t flex items-center justify-between gap-2 text-xs shrink-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {effectiveFocusNote.title || "Untitled Note"}
                </div>
                <div
                  className="text-[10.5px] font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {positionedNodes.length} nodes · {graphLayout.edges.length} links
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenNote(effectiveFocusNote.id)}
                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <span>Open Note</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      {isOpenDesktop && (
        <aside
          aria-label="Notes connection map"
          className="hidden lg:flex lg:flex-col w-[340px] xl:w-[390px] h-full shrink-0 border-l overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {panelBody(false)}
        </aside>
      )}

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex justify-end bg-black/50 backdrop-blur-[1px] overscroll-none"
          onClick={onCloseMobile}
        >
          <div
            className="w-[min(92vw,390px)] h-full pt-safe pb-safe border-l flex flex-col overflow-hidden"
            style={{ borderColor: "var(--border-strong)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {panelBody(true)}
          </div>
        </div>
      )}
    </>
  );
};
