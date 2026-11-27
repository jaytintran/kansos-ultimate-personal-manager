import React from "react";
import {
  BookOpen,
  Calendar,
  FileText,
  GitCommitVertical,
  Grid2x2Check,
  Headphones,
  Languages,
  ListTodo,
  MonitorPlay,
  Target,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import type { ViewId, WorkspaceNavigationSettings } from "../types";

export interface ViewRegistryItem {
  id: ViewId;
  label: string;
  description: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
}

export const KANSO_VIEW_REGISTRY: ViewRegistryItem[] = [
  {
    id: "focus",
    label: "Focus",
    description: "Anchors, X-Active & tabs",
    icon: Target,
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Daily chronological spine",
    icon: GitCommitVertical,
  },
  {
    id: "habits",
    label: "Habits",
    description: "Matrix, cards & streaks",
    icon: Grid2x2Check,
  },
  {
    id: "achievements",
    label: "Achievements",
    description: "Milestones & completed wins",
    icon: Trophy,
  },
  {
    id: "notes",
    label: "Notes",
    description: "Card grid & rich editor",
    icon: FileText,
  },
  {
    id: "events",
    label: "Events",
    description: "Scheduled calendar items",
    icon: Calendar,
  },
  {
    id: "lists",
    label: "Lists",
    description: "Collections & backlogs",
    icon: ListTodo,
  },
  {
    id: "library",
    label: "Library",
    description: "Offline PDF & EPUB reader",
    icon: BookOpen,
  },
  {
    id: "streamer",
    label: "Streamer",
    description: "Multi-YouTube stream grid",
    icon: MonitorPlay,
  },
  {
    id: "audio",
    label: "Audio",
    description: "Local audio studio & mixer",
    icon: Headphones,
  },
  {
    id: "contacts",
    label: "Contacts",
    description: "Personal CRM & relationships",
    icon: Users,
  },
  {
    id: "finance",
    label: "Finance",
    description: "Multi-currency money & bills",
    icon: Wallet,
  },
  {
    id: "languages",
    label: "Languages",
    description: "Grammar, vocab & SRS studio",
    icon: Languages,
  },
];

export const VIEW_META_MAP: Record<ViewId, ViewRegistryItem> =
  Object.fromEntries(
    KANSO_VIEW_REGISTRY.map((item) => [item.id, item]),
  ) as Record<ViewId, ViewRegistryItem>;

const ALL_VIEW_IDS: ViewId[] = KANSO_VIEW_REGISTRY.map((v) => v.id);
const VALID_VIEW_ID_SET = new Set<string>(ALL_VIEW_IDS);

export const DEFAULT_DESKTOP_VIEW_GROUPS: ViewId[][] = [
  ["focus", "timeline", "habits", "achievements"],
  ["notes", "events", "lists"],
  ["library", "streamer", "audio"],
  ["contacts", "finance", "languages"],
];

export const DEFAULT_MOBILE_PRIMARY_VIEWS: ViewId[] = [
  "focus",
  "timeline",
  "habits",
  "notes",
  "lists",
];

export const DEFAULT_MOBILE_MORE_VIEWS: ViewId[] = [
  "events",
  "contacts",
  "finance",
  "languages",
  "library",
  "streamer",
  "audio",
  "achievements",
];

export const MIN_MOBILE_PRIMARY_SLOTS = 3;
export const DEFAULT_MOBILE_PRIMARY_SLOTS = 5;
export const MAX_MOBILE_PRIMARY_SLOTS = 5;
export const MOBILE_PRIMARY_SLOT_OPTIONS = [3, 4, 5] as const;

export function normalizeMobilePrimarySlots(raw?: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_MOBILE_PRIMARY_SLOTS;
  }
  const rounded = Math.round(raw);
  return Math.min(
    MAX_MOBILE_PRIMARY_SLOTS,
    Math.max(MIN_MOBILE_PRIMARY_SLOTS, rounded),
  );
}

function isValidViewId(value: unknown): value is ViewId {
  return typeof value === "string" && VALID_VIEW_ID_SET.has(value);
}

function normalizeDesktopGroups(rawGroups?: ViewId[][]): ViewId[][] {
  const source =
    Array.isArray(rawGroups) && rawGroups.length > 0
      ? rawGroups
      : DEFAULT_DESKTOP_VIEW_GROUPS;

  const seen = new Set<ViewId>();
  const groups: ViewId[][] = [];

  for (const rawGroup of source) {
    if (!Array.isArray(rawGroup)) continue;
    const cleanGroup: ViewId[] = [];
    for (const id of rawGroup) {
      if (isValidViewId(id) && !seen.has(id)) {
        seen.add(id);
        cleanGroup.push(id);
      }
    }
    if (cleanGroup.length > 0) {
      groups.push(cleanGroup);
    }
  }

  // Append any newly added Kanso views that weren't present in older synced payloads
  const missing = ALL_VIEW_IDS.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    if (groups.length > 0) {
      groups[groups.length - 1] = [...groups[groups.length - 1], ...missing];
    } else {
      groups.push(missing);
    }
  }

  return groups;
}

function normalizeMobileLists(
  rawPrimary?: ViewId[],
  rawMore?: ViewId[],
  maxPrimarySlots = DEFAULT_MOBILE_PRIMARY_SLOTS,
): { mobilePrimary: ViewId[]; mobileMore: ViewId[] } {
  const srcPrimary = Array.isArray(rawPrimary)
    ? rawPrimary
    : DEFAULT_MOBILE_PRIMARY_VIEWS;
  const srcMore = Array.isArray(rawMore)
    ? rawMore
    : DEFAULT_MOBILE_MORE_VIEWS;

  const seen = new Set<ViewId>();
  const mobilePrimary: ViewId[] = [];
  const overflowPrimary: ViewId[] = [];
  const mobileMore: ViewId[] = [];

  for (const id of srcPrimary) {
    if (!isValidViewId(id) || seen.has(id)) continue;
    seen.add(id);
    if (mobilePrimary.length < maxPrimarySlots) {
      mobilePrimary.push(id);
    } else {
      overflowPrimary.push(id);
    }
  }

  // Keep any views trimmed by a smaller slot limit at the top of More
  for (const id of overflowPrimary) {
    mobileMore.push(id);
  }

  for (const id of srcMore) {
    if (isValidViewId(id) && !seen.has(id)) {
      seen.add(id);
      mobileMore.push(id);
    }
  }

  // Include any leftover future views cleanly in mobileMore
  for (const id of ALL_VIEW_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      mobileMore.push(id);
    }
  }

  return { mobilePrimary, mobileMore };
}

function normalizeHiddenViews(
  rawHidden: ViewId[] | undefined,
  desktopOrder: ViewId[],
): ViewId[] {
  if (!Array.isArray(rawHidden) || rawHidden.length === 0) return [];
  const seen = new Set<ViewId>();
  const hidden: ViewId[] = [];
  for (const id of rawHidden) {
    if (isValidViewId(id) && !seen.has(id)) {
      seen.add(id);
      hidden.push(id);
    }
  }
  // Enforce safeguard: at least 1 view must stay active
  if (hidden.length >= ALL_VIEW_IDS.length) {
    const keepId = desktopOrder[0] || ALL_VIEW_IDS[0];
    return hidden.filter((id) => id !== keepId);
  }
  return hidden;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function nestedArraysEqual<T>(a: T[][], b: T[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!arraysEqual(a[i], b[i])) return false;
  }
  return true;
}

export interface ResolvedNavigationConfig {
  hiddenViews: ViewId[];
  hiddenSet: Set<ViewId>;
  enabledViews: ViewId[];
  desktopGroupsAll: ViewId[][];
  desktopGroupsVisible: ViewId[][];
  mobilePrimaryAll: ViewId[];
  mobilePrimaryVisible: ViewId[];
  mobileMoreAll: ViewId[];
  mobileMoreVisible: ViewId[];
  mobilePrimaryMaxSlots: number;
  resolveSafeView: (candidate?: ViewId | null) => ViewId;
}

export function resolveNavigationConfig(
  nav?: WorkspaceNavigationSettings,
): ResolvedNavigationConfig {
  const mobilePrimaryMaxSlots = normalizeMobilePrimarySlots(
    nav?.mobilePrimarySlots,
  );
  const desktopGroupsAll = normalizeDesktopGroups(nav?.desktopGroups);
  const desktopFlat = desktopGroupsAll.flat();
  const { mobilePrimary: mobilePrimaryAll, mobileMore: mobileMoreAll } =
    normalizeMobileLists(
      nav?.mobilePrimary,
      nav?.mobileMore,
      mobilePrimaryMaxSlots,
    );

  const hiddenViews = normalizeHiddenViews(nav?.hiddenViews, desktopFlat);
  const hiddenSet = new Set<ViewId>(hiddenViews);

  const enabledViews = desktopFlat.filter((id) => !hiddenSet.has(id));
  const desktopGroupsVisible = desktopGroupsAll
    .map((group) => group.filter((id) => !hiddenSet.has(id)))
    .filter((group) => group.length > 0);

  const mobilePrimaryVisible = mobilePrimaryAll.filter(
    (id) => !hiddenSet.has(id),
  );
  const mobileMoreVisible = mobileMoreAll.filter((id) => !hiddenSet.has(id));

  const fallbackView = enabledViews[0] || "focus";

  const resolveSafeView = (candidate?: ViewId | null): ViewId => {
    if (candidate && isValidViewId(candidate) && !hiddenSet.has(candidate)) {
      return candidate;
    }
    return fallbackView;
  };

  return {
    hiddenViews,
    hiddenSet,
    enabledViews,
    desktopGroupsAll,
    desktopGroupsVisible,
    mobilePrimaryAll,
    mobilePrimaryVisible,
    mobileMoreAll,
    mobileMoreVisible,
    mobilePrimaryMaxSlots,
    resolveSafeView,
  };
}

/**
 * Strips default-matching arrays so Gist and workspace JSON remain minimal.
 */
export function compactNavigationSettings(input: {
  hiddenViews: ViewId[];
  desktopGroups: ViewId[][];
  mobilePrimary: ViewId[];
  mobileMore: ViewId[];
  mobilePrimarySlots?: number;
}): WorkspaceNavigationSettings | undefined {
  const mobilePrimarySlots = normalizeMobilePrimarySlots(
    input.mobilePrimarySlots,
  );
  const desktopGroups = normalizeDesktopGroups(input.desktopGroups);
  const { mobilePrimary, mobileMore } = normalizeMobileLists(
    input.mobilePrimary,
    input.mobileMore,
    mobilePrimarySlots,
  );
  const hiddenViews = normalizeHiddenViews(
    input.hiddenViews,
    desktopGroups.flat(),
  );

  const out: WorkspaceNavigationSettings = {};
  if (hiddenViews.length > 0) {
    out.hiddenViews = hiddenViews;
  }
  if (!nestedArraysEqual(desktopGroups, DEFAULT_DESKTOP_VIEW_GROUPS)) {
    out.desktopGroups = desktopGroups;
  }
  if (!arraysEqual(mobilePrimary, DEFAULT_MOBILE_PRIMARY_VIEWS)) {
    out.mobilePrimary = mobilePrimary;
  }
  if (!arraysEqual(mobileMore, DEFAULT_MOBILE_MORE_VIEWS)) {
    out.mobileMore = mobileMore;
  }
  if (mobilePrimarySlots !== DEFAULT_MOBILE_PRIMARY_SLOTS) {
    out.mobilePrimarySlots = mobilePrimarySlots;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function sanitizeNavigationSettings(
  nav?: WorkspaceNavigationSettings,
): WorkspaceNavigationSettings | undefined {
  if (!nav || typeof nav !== "object") return undefined;
  const resolved = resolveNavigationConfig(nav);
  return compactNavigationSettings({
    hiddenViews: resolved.hiddenViews,
    desktopGroups: resolved.desktopGroupsAll,
    mobilePrimary: resolved.mobilePrimaryAll,
    mobileMore: resolved.mobileMoreAll,
    mobilePrimarySlots: resolved.mobilePrimaryMaxSlots,
  });
}

// ============================================================================
// Pure Mutation Helpers for Settings -> Views Panel
// ============================================================================

export function toggleViewVisibilityInNav(
  nav: WorkspaceNavigationSettings | undefined,
  viewId: ViewId,
): WorkspaceNavigationSettings | undefined {
  const resolved = resolveNavigationConfig(nav);
  const isHidden = resolved.hiddenSet.has(viewId);

  let nextHidden: ViewId[];
  if (isHidden) {
    nextHidden = resolved.hiddenViews.filter((id) => id !== viewId);
  } else {
    if (resolved.enabledViews.length <= 1) {
      return nav;
    }
    nextHidden = [...resolved.hiddenViews, viewId];
  }

  return compactNavigationSettings({
    hiddenViews: nextHidden,
    desktopGroups: resolved.desktopGroupsAll,
    mobilePrimary: resolved.mobilePrimaryAll,
    mobileMore: resolved.mobileMoreAll,
    mobilePrimarySlots: resolved.mobilePrimaryMaxSlots,
  });
}

export function moveDesktopViewWithinGroup(
  nav: WorkspaceNavigationSettings | undefined,
  groupIdx: number,
  itemIdx: number,
  delta: -1 | 1,
): WorkspaceNavigationSettings | undefined {
  const resolved = resolveNavigationConfig(nav);
  const groups = resolved.desktopGroupsAll.map((g) => [...g]);
  const group = groups[groupIdx];
  if (!group) return nav;
  const targetIdx = itemIdx + delta;
  if (targetIdx < 0 || targetIdx >= group.length) return nav;

  const [moved] = group.splice(itemIdx, 1);
  group.splice(targetIdx, 0, moved);

  return compactNavigationSettings({
    hiddenViews: resolved.hiddenViews,
    desktopGroups: groups,
    mobilePrimary: resolved.mobilePrimaryAll,
    mobileMore: resolved.mobileMoreAll,
    mobilePrimarySlots: resolved.mobilePrimaryMaxSlots,
  });
}

export function moveDesktopViewToGroup(
  nav: WorkspaceNavigationSettings | undefined,
  viewId: ViewId,
  targetGroupIdx: number,
): WorkspaceNavigationSettings | undefined {
  const resolved = resolveNavigationConfig(nav);
  const groups = resolved.desktopGroupsAll.map((g) => [...g]);

  let sourceGroupIdx = -1;
  let sourceItemIdx = -1;
  for (let gi = 0; gi < groups.length; gi++) {
    const idx = groups[gi].indexOf(viewId);
    if (idx !== -1) {
      sourceGroupIdx = gi;
      sourceItemIdx = idx;
      break;
    }
  }
  if (sourceGroupIdx === -1 || sourceGroupIdx === targetGroupIdx) return nav;

  groups[sourceGroupIdx].splice(sourceItemIdx, 1);
  if (targetGroupIdx >= groups.length) {
    groups.push([viewId]);
  } else if (targetGroupIdx >= 0) {
    groups[targetGroupIdx].push(viewId);
  }

  const nonEmpty = groups.filter((g) => g.length > 0);
  return compactNavigationSettings({
    hiddenViews: resolved.hiddenViews,
    desktopGroups: nonEmpty,
    mobilePrimary: resolved.mobilePrimaryAll,
    mobileMore: resolved.mobileMoreAll,
    mobilePrimarySlots: resolved.mobilePrimaryMaxSlots,
  });
}

export function moveMobileViewWithinList(
  nav: WorkspaceNavigationSettings | undefined,
  listName: "primary" | "more",
  itemIdx: number,
  delta: -1 | 1,
): WorkspaceNavigationSettings | undefined {
  const resolved = resolveNavigationConfig(nav);
  const primary = [...resolved.mobilePrimaryAll];
  const more = [...resolved.mobileMoreAll];
  const list = listName === "primary" ? primary : more;

  const targetIdx = itemIdx + delta;
  if (targetIdx < 0 || targetIdx >= list.length) return nav;

  const [moved] = list.splice(itemIdx, 1);
  list.splice(targetIdx, 0, moved);

  return compactNavigationSettings({
    hiddenViews: resolved.hiddenViews,
    desktopGroups: resolved.desktopGroupsAll,
    mobilePrimary: primary,
    mobileMore: more,
    mobilePrimarySlots: resolved.mobilePrimaryMaxSlots,
  });
}

export function moveMobileViewAcrossLists(
  nav: WorkspaceNavigationSettings | undefined,
  viewId: ViewId,
  targetList: "primary" | "more",
): WorkspaceNavigationSettings | undefined {
  const resolved = resolveNavigationConfig(nav);
  const primary = [...resolved.mobilePrimaryAll];
  const more = [...resolved.mobileMoreAll];

  if (targetList === "primary") {
    const idx = more.indexOf(viewId);
    if (idx === -1) return nav;
    more.splice(idx, 1);
    if (primary.length >= resolved.mobilePrimaryMaxSlots) {
      const displaced = primary.pop();
      if (displaced) {
        more.unshift(displaced);
      }
    }
    primary.push(viewId);
  } else {
    const idx = primary.indexOf(viewId);
    if (idx === -1) return nav;
    primary.splice(idx, 1);
    more.unshift(viewId);
  }

  return compactNavigationSettings({
    hiddenViews: resolved.hiddenViews,
    desktopGroups: resolved.desktopGroupsAll,
    mobilePrimary: primary,
    mobileMore: more,
    mobilePrimarySlots: resolved.mobilePrimaryMaxSlots,
  });
}

export function setMobilePrimarySlotLimit(
  nav: WorkspaceNavigationSettings | undefined,
  nextSlots: number,
): WorkspaceNavigationSettings | undefined {
  const resolved = resolveNavigationConfig(nav);
  const normalizedSlots = normalizeMobilePrimarySlots(nextSlots);
  const primary = [...resolved.mobilePrimaryAll];
  const more = [...resolved.mobileMoreAll];

  if (
    normalizedSlots > resolved.mobilePrimaryMaxSlots &&
    primary.length >= resolved.mobilePrimaryMaxSlots
  ) {
    while (primary.length < normalizedSlots && more.length > 0) {
      const nextVisibleIdx = more.findIndex((id) => !resolved.hiddenSet.has(id));
      const pickIdx = nextVisibleIdx !== -1 ? nextVisibleIdx : 0;
      const [promoted] = more.splice(pickIdx, 1);
      if (promoted) {
        primary.push(promoted);
      }
    }
  }

  return compactNavigationSettings({
    hiddenViews: resolved.hiddenViews,
    desktopGroups: resolved.desktopGroupsAll,
    mobilePrimary: primary,
    mobileMore: more,
    mobilePrimarySlots: normalizedSlots,
  });
}
