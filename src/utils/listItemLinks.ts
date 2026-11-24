import type {
  Entry,
  ListCollection,
  ListItem,
  ListItemNoteLink,
} from "../types";

export function normalizeListItemNoteLinks(
  raw: ListItemNoteLink[] | undefined | null,
): ListItemNoteLink[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seenIds = new Set<string>();
  const result: ListItemNoteLink[] = [];
  for (const link of raw) {
    if (!link || typeof link !== "object") continue;
    const itemId =
      typeof link.listItemId === "string" && link.listItemId.trim()
        ? link.listItemId
        : null;
    if (itemId) {
      if (seenIds.has(itemId)) continue;
      seenIds.add(itemId);
    }
    result.push({
      listItemId: itemId,
      itemTitle: typeof link.itemTitle === "string" ? link.itemTitle : "Untitled Item",
      listId: typeof link.listId === "string" ? link.listId : undefined,
      listTitle: typeof link.listTitle === "string" ? link.listTitle : undefined,
      listColor: typeof link.listColor === "string" ? link.listColor : undefined,
      quote: typeof link.quote === "string" ? link.quote : undefined,
      itemRemoved: Boolean(link.itemRemoved) || itemId === null,
    });
  }
  return result;
}

export function buildListItemNoteLink(
  item: ListItem,
  list?: ListCollection | null,
  quote?: string,
): ListItemNoteLink {
  return {
    listItemId: item.id,
    itemTitle: item.title || "Untitled Item",
    listId: list?.id ?? item.listId,
    listTitle: list?.title,
    listColor: list?.color,
    quote: quote?.trim() ? quote.trim() : undefined,
    itemRemoved: false,
  };
}

export function getNotesLinkedToListItem(
  entries: Entry[],
  listItemId: string,
  includeArchived = false,
): Entry[] {
  if (!listItemId) return [];
  return entries.filter((entry) => {
    if (entry.type !== "note") return false;
    if (!includeArchived && entry.archived) return false;
    return (entry.listItemLinks || []).some(
      (link) => link.listItemId === listItemId,
    );
  });
}

export function countLinkedNotesForListItems(
  entries: Entry[],
  itemIds: string[],
): {
  totalAffectedNotes: number;
  exclusivelyLinkedNotes: number;
  sharedNotes: number;
} {
  const deleteSet = new Set(itemIds.filter(Boolean));
  if (deleteSet.size === 0) {
    return {
      totalAffectedNotes: 0,
      exclusivelyLinkedNotes: 0,
      sharedNotes: 0,
    };
  }

  let totalAffectedNotes = 0;
  let exclusivelyLinkedNotes = 0;
  let sharedNotes = 0;

  for (const entry of entries) {
    if (entry.type !== "note") continue;
    const links = entry.listItemLinks || [];
    if (!links.some((l) => l.listItemId && deleteSet.has(l.listItemId))) {
      continue;
    }
    totalAffectedNotes += 1;
    const hasOtherLiveItemLink = links.some(
      (l) => l.listItemId && !deleteSet.has(l.listItemId),
    );
    const hasBookLink = Boolean(entry.bookLink);
    if (hasOtherLiveItemLink || hasBookLink) {
      sharedNotes += 1;
    } else {
      exclusivelyLinkedNotes += 1;
    }
  }

  return {
    totalAffectedNotes,
    exclusivelyLinkedNotes,
    sharedNotes,
  };
}
