import type { ListCollection, ListItem } from "../types";

export interface ListTreeIndex {
  byId: Map<string, ListCollection>;
  childrenMap: Map<string, ListCollection[]>;
  rootLists: ListCollection[];
}

export interface FlattenedListNode {
  list: ListCollection;
  depth: number;
  pathLabel: string;
  hasChildren: boolean;
}

const ROOT_KEY = "__root__";

/**
 * Normalizes a list's parentId against existing lists and guards against direct
 * or transitive cycles so the UI tree can never infinite-loop even on corrupted data.
 */
export function buildListTreeIndex(lists: ListCollection[]): ListTreeIndex {
  const byId = new Map<string, ListCollection>();
  for (const list of lists) {
    byId.set(list.id, list);
  }

  const childrenMap = new Map<string, ListCollection[]>();

  const hasCycleToSelf = (
    nodeId: string,
    startParentId: string | null | undefined,
  ): boolean => {
    let cursor = startParentId;
    const seen = new Set<string>([nodeId]);
    while (cursor) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const parent = byId.get(cursor);
      if (!parent) return false;
      cursor = parent.parentId;
    }
    return false;
  };

  for (const list of lists) {
    const rawParent = list.parentId ?? null;
    const validParent =
      rawParent &&
      byId.has(rawParent) &&
      !hasCycleToSelf(list.id, rawParent)
        ? rawParent
        : ROOT_KEY;

    const bucket = childrenMap.get(validParent) || [];
    bucket.push(list);
    childrenMap.set(validParent, bucket);
  }

  return {
    byId,
    childrenMap,
    rootLists: childrenMap.get(ROOT_KEY) || [],
  };
}

export function getListAncestors(
  listId: string,
  byId: Map<string, ListCollection>,
): ListCollection[] {
  const chain: ListCollection[] = [];
  const seen = new Set<string>();
  let cursor: string | null | undefined = listId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = byId.get(cursor);
    if (!node) break;
    chain.push(node);
    cursor = node.parentId ?? null;
  }
  return chain.reverse();
}

export function getListPathLabel(
  listId: string,
  byId: Map<string, ListCollection>,
  separator = " › ",
): string {
  const chain = getListAncestors(listId, byId);
  if (chain.length === 0) return "";
  return chain.map((l) => l.title).join(separator);
}

export function getDescendantListIds(
  rootListId: string,
  childrenMap: Map<string, ListCollection[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [rootListId];
  while (stack.length > 0) {
    const current = stack.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    const children = childrenMap.get(current) || [];
    for (const child of children) {
      if (!seen.has(child.id)) {
        stack.push(child.id);
      }
    }
  }
  return out;
}

export function wouldCreateListCycle(
  listId: string,
  candidateParentId: string | null | undefined,
  byId: Map<string, ListCollection>,
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === listId) return true;
  const seen = new Set<string>();
  let cursor: string | null | undefined = candidateParentId;
  while (cursor && !seen.has(cursor)) {
    if (cursor === listId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

export function flattenListTree(
  lists: ListCollection[],
  excludeSubtreeOfId?: string,
): FlattenedListNode[] {
  const { byId, childrenMap, rootLists } = buildListTreeIndex(lists);
  const excludedIds = excludeSubtreeOfId
    ? new Set(getDescendantListIds(excludeSubtreeOfId, childrenMap))
    : null;

  const result: FlattenedListNode[] = [];
  const visit = (node: ListCollection, depth: number) => {
    if (excludedIds?.has(node.id)) return;
    const children = (childrenMap.get(node.id) || []).filter(
      (c) => !excludedIds?.has(c.id),
    );
    result.push({
      list: node,
      depth,
      pathLabel: getListPathLabel(node.id, byId),
      hasChildren: children.length > 0,
    });
    for (const child of children) {
      visit(child, depth + 1);
    }
  };

  for (const root of rootLists) {
    visit(root, 0);
  }
  return result;
}

export function computeRecursiveListCounts(
  lists: ListCollection[],
  listItems: ListItem[],
): {
  directCounts: Map<string, number>;
  totalCounts: Map<string, number>;
} {
  const directCounts = new Map<string, number>();
  for (const item of listItems) {
    directCounts.set(item.listId, (directCounts.get(item.listId) || 0) + 1);
  }

  const { childrenMap, rootLists } = buildListTreeIndex(lists);
  const totalCounts = new Map<string, number>();
  const visited = new Set<string>();

  const sumSubtree = (listId: string): number => {
    if (totalCounts.has(listId)) return totalCounts.get(listId)!;
    if (visited.has(listId)) return directCounts.get(listId) || 0;
    visited.add(listId);
    let total = directCounts.get(listId) || 0;
    const children = childrenMap.get(listId) || [];
    for (const child of children) {
      total += sumSubtree(child.id);
    }
    totalCounts.set(listId, total);
    return total;
  };

  for (const root of rootLists) {
    sumSubtree(root.id);
  }
  for (const list of lists) {
    if (!totalCounts.has(list.id)) {
      sumSubtree(list.id);
    }
  }

  return { directCounts, totalCounts };
}

/**
 * Given an item's listId and a viewed ancestor baseListId, resolves whether the
 * item lives directly in baseListId ("__direct__") or which direct child of
 * baseListId owns the item's branch.
 */
export function getDirectChildBranchId(
  itemListId: string,
  baseListId: string,
  byId: Map<string, ListCollection>,
): string | "__direct__" | null {
  if (itemListId === baseListId) return "__direct__";
  const seen = new Set<string>();
  let cursor = byId.get(itemListId) || null;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.parentId === baseListId) {
      return cursor.id;
    }
    cursor = cursor.parentId ? byId.get(cursor.parentId) || null : null;
  }
  return null;
}

export function formatIndentedListOptionLabel(
  node: FlattenedListNode,
): string {
  if (node.depth === 0) return node.list.title;
  return `${"\u00A0\u00A0".repeat(node.depth)}↳ ${node.list.title}`;
}
