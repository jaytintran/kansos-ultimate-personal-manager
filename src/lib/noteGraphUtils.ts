import type { Entry, NoteNotebook } from "../types";
import { extractWikiLinks } from "../utils/noteMarkdown";

export type NoteConnectionKind = "wikilink" | "hierarchy" | "tag";

export interface NoteGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: NoteConnectionKind;
  label?: string;
}

export interface NoteGraphNode {
  id: string;
  title: string;
  icon: string;
  notebookId: string | null;
  color: string;
  degree: number;
  x: number;
  y: number;
  hop: number; // 0 = center, 1 = direct neighbor, 2 = 2nd hop, 3 = outer/workspace
}

const NOTEBOOK_PALETTE = [
  "#b45309", // amber/ochre
  "#4f46e5", // indigo
  "#059669", // emerald
  "#0284c7", // sky
  "#be185d", // rose
  "#7c3aed", // violet
  "#0f766e", // teal
  "#c2410c", // terracotta
];

export function getNotebookColor(
  notebookId: string | null | undefined,
  notebooks: NoteNotebook[],
): string {
  if (!notebookId) return "var(--text-muted)";
  const idx = notebooks.findIndex((nb) => nb.id === notebookId);
  if (idx >= 0) return NOTEBOOK_PALETTE[idx % NOTEBOOK_PALETTE.length];
  let hash = 0;
  for (let i = 0; i < notebookId.length; i++) {
    hash = (hash * 31 + notebookId.charCodeAt(i)) | 0;
  }
  return NOTEBOOK_PALETTE[Math.abs(hash) % NOTEBOOK_PALETTE.length];
}

export function buildNoteChildrenMap(notes: Entry[]): Map<string, Entry[]> {
  const activeIds = new Set(notes.map((n) => n.id));
  const map = new Map<string, Entry[]>();
  for (const n of notes) {
    const parentKey =
      n.parentId && activeIds.has(n.parentId) && n.parentId !== n.id
        ? n.parentId
        : "__root__";
    const list = map.get(parentKey) ?? [];
    list.push(n);
    map.set(parentKey, list);
  }
  return map;
}

export function getNoteAncestorChain(
  noteId: string,
  noteMap: Map<string, Entry>,
): Entry[] {
  const chain: Entry[] = [];
  const seen = new Set<string>([noteId]);
  const self = noteMap.get(noteId);
  let cursor = self?.parentId ? noteMap.get(self.parentId) : undefined;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    chain.unshift(cursor);
    cursor = cursor.parentId ? noteMap.get(cursor.parentId) : undefined;
  }
  return chain;
}

export function getNoteDescendantIds(
  rootId: string,
  notes: Entry[],
): Set<string> {
  const descendants = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const n of notes) {
      if (
        (n.parentId === rootId || (n.parentId && descendants.has(n.parentId))) &&
        n.id !== rootId &&
        !descendants.has(n.id)
      ) {
        descendants.add(n.id);
        added = true;
      }
    }
  }
  return descendants;
}

export function wouldCreateParentCycle(
  noteId: string,
  proposedParentId: string | null,
  notes: Entry[],
): boolean {
  if (!proposedParentId) return false;
  if (proposedParentId === noteId) return true;
  const descendants = getNoteDescendantIds(noteId, notes);
  return descendants.has(proposedParentId);
}

export function extractAllNoteEdges(
  notes: Entry[],
  enabledKinds: Record<NoteConnectionKind, boolean>,
): NoteGraphEdge[] {
  const edges: NoteGraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const byId = new Map(notes.map((n) => [n.id, n]));
  const byTitleLower = new Map<string, Entry>();
  for (const n of notes) {
    const key = (n.title || "").trim().toLowerCase();
    if (key && !byTitleLower.has(key)) {
      byTitleLower.set(key, n);
    }
  }

  // 1. Parent -> Child hierarchy edges
  if (enabledKinds.hierarchy) {
    for (const n of notes) {
      if (n.parentId && byId.has(n.parentId) && n.parentId !== n.id) {
        const key = `h:${n.parentId}->${n.id}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          edges.push({
            id: key,
            source: n.parentId,
            target: n.id,
            kind: "hierarchy",
          });
        }
      }
    }
  }

  // 2. [[Wikilinks]] edges (directed: source mentions target)
  if (enabledKinds.wikilink) {
    for (const n of notes) {
      const refs = extractWikiLinks(n.content || "");
      for (const ref of refs) {
        const target =
          (ref.targetId ? byId.get(ref.targetId) : undefined) ??
          byTitleLower.get(ref.title.trim().toLowerCase());
        if (!target || target.id === n.id) continue;
        const key = `w:${n.id}->${target.id}`;
        if (!edgeKeys.has(key)) {
          edgeKeys.add(key);
          edges.push({
            id: key,
            source: n.id,
            target: target.id,
            kind: "wikilink",
          });
        }
      }
    }
  }

  // 3. Shared tags edges (undirected stored canonically source < target)
  if (enabledKinds.tag) {
    const tagOwners = new Map<string, string[]>();
    for (const n of notes) {
      for (const tag of n.tags || []) {
        const clean = tag.trim().toLowerCase();
        if (!clean) continue;
        const arr = tagOwners.get(clean) ?? [];
        arr.push(n.id);
        tagOwners.set(clean, arr);
      }
    }

    const pairTags = new Map<string, Set<string>>();
    for (const [tag, ids] of tagOwners.entries()) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i] < ids[j] ? ids[i] : ids[j];
          const b = ids[i] < ids[j] ? ids[j] : ids[i];
          const pairKey = `t:${a}<->${b}`;
          const set = pairTags.get(pairKey) ?? new Set<string>();
          set.add(`#${tag}`);
          pairTags.set(pairKey, set);
        }
      }
    }

    for (const [pairKey, tags] of pairTags.entries()) {
      const [a, b] = pairKey.slice(2).split("<->");
      edges.push({
        id: pairKey,
        source: a,
        target: b,
        kind: "tag",
        label: Array.from(tags).slice(0, 3).join(", "),
      });
    }
  }

  return edges;
}

export interface RadialGraphLayout {
  nodes: NoteGraphNode[];
  edges: NoteGraphEdge[];
}

export function buildRadialNoteGraph(params: {
  notes: Entry[];
  notebooks: NoteNotebook[];
  centerNoteId: string | null;
  depthMode: "1-hop" | "2-hop" | "all";
  enabledKinds: Record<NoteConnectionKind, boolean>;
}): RadialGraphLayout {
  const { notes, notebooks, centerNoteId, depthMode, enabledKinds } = params;
  if (notes.length === 0) return { nodes: [], edges: [] };

  const allEdges = extractAllNoteEdges(notes, enabledKinds);
  const noteById = new Map(notes.map((n) => [n.id, n]));

  // Build undirected neighbor lookup & degree count
  const neighbors = new Map<string, Set<string>>();
  for (const n of notes) neighbors.set(n.id, new Set());
  for (const edge of allEdges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const effectiveCenterId =
    centerNoteId && noteById.has(centerNoteId) ? centerNoteId : notes[0].id;

  // BFS hops from center
  const hopMap = new Map<string, number>();
  const parentHopMap = new Map<string, string>();
  hopMap.set(effectiveCenterId, 0);
  const queue: string[] = [effectiveCenterId];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currHop = hopMap.get(curr)!;
    for (const nb of neighbors.get(curr) ?? []) {
      if (!hopMap.has(nb)) {
        hopMap.set(nb, currHop + 1);
        parentHopMap.set(nb, curr);
        queue.push(nb);
      }
    }
  }

  const includedNotes = notes.filter((n) => {
    if (depthMode === "all") return true;
    const h = hopMap.get(n.id);
    if (h === undefined) return false;
    return depthMode === "1-hop" ? h <= 1 : h <= 2;
  });

  const includedSet = new Set(includedNotes.map((n) => n.id));
  const filteredEdges = allEdges.filter(
    (e) => includedSet.has(e.source) && includedSet.has(e.target),
  );

  // Position nodes in a crisp Anytype-inspired radial hub scatter
  const positions = new Map<string, { x: number; y: number }>();
  positions.set(effectiveCenterId, { x: 0, y: 0 });

  const ring1 = includedNotes.filter((n) => hopMap.get(n.id) === 1);
  const ring2 = includedNotes.filter((n) => hopMap.get(n.id) === 2);
  const outer = includedNotes.filter((n) => {
    const h = hopMap.get(n.id);
    return h === undefined || h >= 3;
  });

  const ring1Radius = ring1.length > 8 ? 132 : 108;
  const ring1AngleMap = new Map<string, number>();

  ring1.forEach((n, idx) => {
    const angle = (idx / Math.max(1, ring1.length)) * Math.PI * 2 - Math.PI / 2;
    const jitter = ((idx % 3) - 1) * 12;
    const r = ring1Radius + jitter;
    ring1AngleMap.set(n.id, angle);
    positions.set(n.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  });

  // Group ring2 nodes loosely around their ring1 connector angle so lines stay untangled
  const ring2Groups = new Map<string, Entry[]>();
  for (const n of ring2) {
    const p = parentHopMap.get(n.id) || effectiveCenterId;
    const list = ring2Groups.get(p) ?? [];
    list.push(n);
    ring2Groups.set(p, list);
  }

  let globalR2Idx = 0;
  for (const [parentId, group] of ring2Groups.entries()) {
    const baseAngle =
      ring1AngleMap.get(parentId) ??
      (globalR2Idx / Math.max(1, ring2.length)) * Math.PI * 2;
    const spread = Math.min(Math.PI * 0.75, Math.max(0.45, group.length * 0.34));
    group.forEach((n, idx) => {
      const offset =
        group.length === 1
          ? 0
          : ((idx / (group.length - 1)) - 0.5) * spread;
      const angle = baseAngle + offset;
      const r = 205 + ((globalR2Idx % 3) - 1) * 16;
      positions.set(n.id, {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
      });
      globalR2Idx++;
    });
  }

  // Outer / disconnected workspace nodes scattered softly on outer band grouped by notebook
  const sortedOuter = [...outer].sort((a, b) =>
    (a.notebookId || "zzz").localeCompare(b.notebookId || "zzz"),
  );
  const outerBaseRadius = ring2.length > 0 ? 275 : ring1.length > 0 ? 198 : 135;
  sortedOuter.forEach((n, idx) => {
    const angle = (idx / Math.max(1, sortedOuter.length)) * Math.PI * 2 + 0.35;
    const spiral = ((idx % 4) - 1.5) * 18;
    const r = outerBaseRadius + spiral;
    positions.set(n.id, {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  });

  const graphNodes: NoteGraphNode[] = includedNotes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 };
    const degree = neighbors.get(n.id)?.size ?? 0;
    const hop = hopMap.get(n.id) ?? 3;
    return {
      id: n.id,
      title: n.title || "Untitled Note",
      icon: n.icon || "📝",
      notebookId: n.notebookId ?? null,
      color: getNotebookColor(n.notebookId, notebooks),
      degree,
      x: pos.x,
      y: pos.y,
      hop,
    };
  });

  return {
    nodes: graphNodes,
    edges: filteredEdges,
  };
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function appendWikiLinkToHtml(
  html: string,
  target: Entry,
): string {
  const safeId = escapeHtmlAttr(target.id);
  const safeTitle = escapeHtmlAttr(target.title || "Untitled Note");
  const chipHtml = `<span data-wiki-link="" data-note-id="${safeId}" data-note-title="${safeTitle}">[[${safeTitle}]]</span>`;
  const trimmed = (html || "").trim();
  if (!trimmed || trimmed === "<p></p>") {
    return `<p>${chipHtml}</p>`;
  }
  return `${trimmed}<p>${chipHtml}</p>`;
}
