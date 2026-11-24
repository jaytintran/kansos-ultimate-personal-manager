import { ArrowLeft, BookOpen, Folder, FolderMinus, FolderSearch, Layers, Star, Tag } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BookRecord } from "../types/library";

export type LibraryPointerDropTarget =
  | { kind: "sidebar-favorites"; label: string }
  | { kind: "sidebar-folder"; id: string; label: string }
  | { kind: "sidebar-category"; id: string; label: string }
  | { kind: "sidebar-tag"; id: string; label: string }
  | { kind: "view-folder"; id: string; label: string }
  | { kind: "dock-view-folder"; id: string; label: string }
  | { kind: "dock-sidebar-folder"; id: string; label: string }
  | { kind: "dock-more"; label: string }
  | { kind: "dock-remove"; label: string }
  | { kind: "book-reorder"; bookId: string; position: "before" | "after" };

export interface ActiveBookDragState {
  bookIds: string[];
  leadBook: BookRecord | null;
  clientX: number;
  clientY: number;
  pointerType: string;
}

interface PendingDragState {
  bookIds: string[];
  leadBook: BookRecord | null;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  holdTimerId: number | null;
}

interface UseLibraryBookDragOptions {
  enabled: boolean;
  books: BookRecord[];
  selectedIds: Set<string>;
  isCustomSort: boolean;
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
  dockScrollRef: React.RefObject<HTMLDivElement | null>;
  shelfStripRef?: React.RefObject<HTMLElement | null>;
  onDropToViewFolder: (bookIds: string[], folderId: string) => void;
  onDropToSidebarFolder: (bookIds: string[], folderId: string) => void;
  onDropToCategory: (bookIds: string[], categoryId: string) => void;
  onDropToTag: (bookIds: string[], tagName: string) => void;
  onDropToFavorites: (bookIds: string[]) => void;
  onDropToMoreFolders: (bookIds: string[]) => void;
  onDropToRemoveFromCurrentFolder: (bookIds: string[]) => void;
  onReorderBooks: (
    bookIds: string[],
    targetBookId: string,
    position: "before" | "after",
  ) => void;
}

const MOUSE_DRAG_THRESHOLD_PX = 6;
const TOUCH_HOLD_MS = 240;
const TOUCH_CANCEL_MOVE_PX = 9;

function isPointInsideRect(
  x: number,
  y: number,
  rect: DOMRect,
  padX = 0,
  padY = 0,
): boolean {
  return (
    x >= rect.left - padX &&
    x <= rect.right + padX &&
    y >= rect.top - padY &&
    y <= rect.bottom + padY
  );
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return true;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

function computeEdgeVelocity(
  coord: number,
  startEdge: number,
  endEdge: number,
  zonePx: number,
  maxSpeedPxPerSec: number,
  outsideStartAllowancePx = 0,
  outsideEndAllowancePx = 0,
): number {
  if (coord >= startEdge - outsideStartAllowancePx && coord < startEdge + zonePx) {
    const distIntoZone = Math.min(zonePx, Math.max(0, startEdge + zonePx - coord));
    const ratio = distIntoZone / zonePx;
    return -Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  if (coord > endEdge - zonePx && coord <= endEdge + outsideEndAllowancePx) {
    const distIntoZone = Math.min(zonePx, Math.max(0, coord - (endEdge - zonePx)));
    const ratio = distIntoZone / zonePx;
    return Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  return 0;
}

function dropTargetsEqual(
  a: LibraryPointerDropTarget | null,
  b: LibraryPointerDropTarget | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "book-reorder" && b.kind === "book-reorder") {
    return a.bookId === b.bookId && a.position === b.position;
  }
  if ("id" in a && "id" in b) {
    return a.id === b.id;
  }
  return true;
}

export function useLibraryBookDrag({
  enabled,
  books,
  selectedIds,
  isCustomSort,
  mainScrollRef,
  sidebarScrollRef,
  dockScrollRef,
  shelfStripRef,
  onDropToViewFolder,
  onDropToSidebarFolder,
  onDropToCategory,
  onDropToTag,
  onDropToFavorites,
  onDropToMoreFolders,
  onDropToRemoveFromCurrentFolder,
  onReorderBooks,
}: UseLibraryBookDragOptions) {
  const [dragState, setDragState] = useState<ActiveBookDragState | null>(null);
  const [activeDropTarget, setActiveDropTarget] =
    useState<LibraryPointerDropTarget | null>(null);

  const pendingRef = useRef<PendingDragState | null>(null);
  const activeDragRef = useRef<ActiveBookDragState | null>(null);
  const activeDropRef = useRef<LibraryPointerDropTarget | null>(null);
  const heldKeysRef = useRef<{ up: boolean; down: boolean }>({
    up: false,
    down: false,
  });
  const justDraggedUntilRef = useRef(0);

  const booksById = useMemo(
    () => new Map(books.map((b) => [b.id, b])),
    [books],
  );

  // Keep latest callbacks in refs so active window listeners never go stale
  const callbacksRef = useRef({
    isCustomSort,
    onDropToViewFolder,
    onDropToSidebarFolder,
    onDropToCategory,
    onDropToTag,
    onDropToFavorites,
    onDropToMoreFolders,
    onDropToRemoveFromCurrentFolder,
    onReorderBooks,
  });
  callbacksRef.current = {
    isCustomSort,
    onDropToViewFolder,
    onDropToSidebarFolder,
    onDropToCategory,
    onDropToTag,
    onDropToFavorites,
    onDropToMoreFolders,
    onDropToRemoveFromCurrentFolder,
    onReorderBooks,
  };

  const resolveDropTargetAtPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedBookIds: string[],
    ): LibraryPointerDropTarget | null => {
      if (typeof document === "undefined") return null;
      const elements = document.elementsFromPoint(clientX, clientY);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        const dropEl = el.closest<HTMLElement>("[data-library-drop-kind]");
        if (dropEl && dropEl.dataset.libraryDropDisabled !== "true") {
          const kind = dropEl.dataset.libraryDropKind;
          const id = dropEl.dataset.libraryDropId || "";
          const label = dropEl.dataset.libraryDropLabel || "";
          switch (kind) {
            case "sidebar-favorites":
              return { kind: "sidebar-favorites", label: label || "Favorites" };
            case "sidebar-folder":
              if (id) return { kind: "sidebar-folder", id, label };
              break;
            case "sidebar-category":
              if (id) return { kind: "sidebar-category", id, label };
              break;
            case "sidebar-tag":
              if (id) return { kind: "sidebar-tag", id, label };
              break;
            case "view-folder":
              if (id) return { kind: "view-folder", id, label };
              break;
            case "dock-view-folder":
              if (id) return { kind: "dock-view-folder", id, label };
              break;
            case "dock-sidebar-folder":
              if (id) return { kind: "dock-sidebar-folder", id, label };
              break;
            case "dock-more":
              return { kind: "dock-more", label: label || "Choose folders…" };
            case "dock-remove":
              return { kind: "dock-remove", label: label || "Remove from folder" };
          }
        }

        if (callbacksRef.current.isCustomSort) {
          const reorderEl = el.closest<HTMLElement>("[data-library-reorder-id]");
          if (reorderEl) {
            const targetBookId = reorderEl.dataset.libraryReorderId;
            if (targetBookId && !draggedBookIds.includes(targetBookId)) {
              const rect = reorderEl.getBoundingClientRect();
              const axis = reorderEl.dataset.libraryReorderAxis === "y" ? "y" : "x";
              const position: "before" | "after" =
                axis === "y"
                  ? clientY < rect.top + rect.height / 2
                    ? "before"
                    : "after"
                  : clientX < rect.left + rect.width / 2
                    ? "before"
                    : "after";
              return { kind: "book-reorder", bookId: targetBookId, position };
            }
          }
        }
      }
      return null;
    },
    [],
  );

  const updateDropTarget = useCallback(
    (clientX: number, clientY: number, bookIds: string[]) => {
      const next = resolveDropTargetAtPoint(clientX, clientY, bookIds);
      if (!dropTargetsEqual(activeDropRef.current, next)) {
        activeDropRef.current = next;
        setActiveDropTarget(next);
      }
    },
    [resolveDropTargetAtPoint],
  );

  const clearPending = useCallback(() => {
    const p = pendingRef.current;
    if (p?.holdTimerId !== null && p?.holdTimerId !== undefined) {
      window.clearTimeout(p.holdTimerId);
    }
    pendingRef.current = null;
  }, []);

  const stopActiveDrag = useCallback((markJustDragged: boolean) => {
    clearPending();
    activeDragRef.current = null;
    activeDropRef.current = null;
    heldKeysRef.current.up = false;
    heldKeysRef.current.down = false;
    setDragState(null);
    setActiveDropTarget(null);
    if (typeof document !== "undefined") {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    }
    if (markJustDragged) {
      justDraggedUntilRef.current = Date.now() + 260;
    }
  }, [clearPending]);

  const activateDrag = useCallback(
    (pending: PendingDragState) => {
      if (pending.holdTimerId !== null) {
        window.clearTimeout(pending.holdTimerId);
        pending.holdTimerId = null;
      }
      pendingRef.current = null;
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        // Ignore selection clearing errors
      }
      if (typeof document !== "undefined") {
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
      }
      if (pending.pointerType === "touch" && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(12);
        } catch {
          // Ignore haptics errors
        }
      }
      const nextState: ActiveBookDragState = {
        bookIds: pending.bookIds,
        leadBook: pending.leadBook,
        clientX: pending.lastX,
        clientY: pending.lastY,
        pointerType: pending.pointerType,
      };
      activeDragRef.current = nextState;
      setDragState(nextState);
      updateDropTarget(pending.lastX, pending.lastY, pending.bookIds);
    },
    [updateDropTarget],
  );

  const getScrollTargetForPoint = useCallback(
    (
      clientX: number,
      clientY: number,
    ): {
      kind: "dock" | "sidebar" | "main";
      el: HTMLElement;
      rect: DOMRect;
    } | null => {
      const dockEl = dockScrollRef.current;
      if (dockEl && dockEl.scrollHeight > dockEl.clientHeight + 2) {
        const dockRect = dockEl.getBoundingClientRect();
        if (isPointInsideRect(clientX, clientY, dockRect, 4, 4)) {
          return { kind: "dock", el: dockEl, rect: dockRect };
        }
      }

      const sidebarEl = sidebarScrollRef.current;
      if (sidebarEl && sidebarEl.scrollHeight > sidebarEl.clientHeight + 2) {
        const asideEl = sidebarEl.closest("aside") ?? sidebarEl;
        const asideRect = asideEl.getBoundingClientRect();
        if (asideRect.width > 0 && isPointInsideRect(clientX, clientY, asideRect, 4, 4)) {
          return {
            kind: "sidebar",
            el: sidebarEl,
            rect: sidebarEl.getBoundingClientRect(),
          };
        }
      }

      const mainEl = mainScrollRef.current;
      if (mainEl && mainEl.scrollHeight > mainEl.clientHeight + 2) {
        return {
          kind: "main",
          el: mainEl,
          rect: mainEl.getBoundingClientRect(),
        };
      }
      return null;
    },
    [dockScrollRef, mainScrollRef, sidebarScrollRef],
  );

  // Global pointer, wheel, keyboard (A/D), and rAF auto-scroll loop while dragging or pending
  useEffect(() => {
    if (!enabled) {
      stopActiveDrag(false);
      return;
    }

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending && e.pointerId === pending.pointerId) {
        pending.lastX = e.clientX;
        pending.lastY = e.clientY;
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        const dist = Math.hypot(dx, dy);

        if (pending.pointerType === "touch") {
          // If the user started swiping to scroll normally before hold threshold, cancel drag intent
          if (dist > TOUCH_CANCEL_MOVE_PX) {
            clearPending();
          }
          return;
        }

        if (dist >= MOUSE_DRAG_THRESHOLD_PX) {
          activateDrag(pending);
        }
        return;
      }

      const active = activeDragRef.current;
      if (!active) return;

      const updated: ActiveBookDragState = {
        ...active,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      activeDragRef.current = updated;
      setDragState(updated);
      updateDropTarget(e.clientX, e.clientY, active.bookIds);
    };

    const commitDropAndStop = (clientX: number, clientY: number) => {
      const active = activeDragRef.current;
      if (!active) {
        clearPending();
        return;
      }

      const resolved =
        resolveDropTargetAtPoint(clientX, clientY, active.bookIds) ??
        activeDropRef.current;
      const ids = active.bookIds;
      stopActiveDrag(true);

      if (!resolved || ids.length === 0) return;
      const cb = callbacksRef.current;
      switch (resolved.kind) {
        case "sidebar-favorites":
          cb.onDropToFavorites(ids);
          break;
        case "sidebar-folder":
        case "dock-sidebar-folder":
          cb.onDropToSidebarFolder(ids, resolved.id);
          break;
        case "sidebar-category":
          cb.onDropToCategory(ids, resolved.id);
          break;
        case "sidebar-tag":
          cb.onDropToTag(ids, resolved.id);
          break;
        case "view-folder":
        case "dock-view-folder":
          cb.onDropToViewFolder(ids, resolved.id);
          break;
        case "dock-more":
          cb.onDropToMoreFolders(ids);
          break;
        case "dock-remove":
          cb.onDropToRemoveFromCurrentFolder(ids);
          break;
        case "book-reorder":
          cb.onReorderBooks(ids, resolved.bookId, resolved.position);
          break;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingRef.current && e.pointerId === pendingRef.current.pointerId) {
        clearPending();
        return;
      }
      if (activeDragRef.current) {
        commitDropAndStop(e.clientX, e.clientY);
      }
    };

    const onPointerCancel = () => {
      if (pendingRef.current) clearPending();
      if (activeDragRef.current) stopActiveDrag(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeDragRef.current) {
        // Prevent browser scroll takeover while touch-dragging a lifted book card
        e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const active = activeDragRef.current;
      if (!active) return;

      // Support horizontal scrolling on the mobile shelf strip if pointer is over it
      const shelfEl = shelfStripRef?.current;
      if (shelfEl && shelfEl.scrollWidth > shelfEl.clientWidth + 2) {
        const shelfRect = shelfEl.getBoundingClientRect();
        if (isPointInsideRect(e.clientX, e.clientY, shelfRect, 4, 4)) {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (delta !== 0) {
            e.preventDefault();
            shelfEl.scrollLeft += delta;
            updateDropTarget(active.clientX, active.clientY, active.bookIds);
          }
          return;
        }
      }

      const target = getScrollTargetForPoint(e.clientX, e.clientY);
      if (!target) return;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      else if (e.deltaMode === 2) dy *= target.el.clientHeight || 320;

      if (dy !== 0) {
        e.preventDefault();
        target.el.scrollTop += dy;
        updateDropTarget(active.clientX, active.clientY, active.bookIds);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const active = activeDragRef.current;
      if (!active) return;
      if (isEditableElement(document.activeElement)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        stopActiveDrag(false);
        return;
      }

      const lower = e.key.toLowerCase();
      if (e.code === "KeyA" || lower === "a") {
        e.preventDefault();
        heldKeysRef.current.up = true;
      } else if (e.code === "KeyD" || lower === "d") {
        e.preventDefault();
        heldKeysRef.current.down = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const lower = e.key.toLowerCase();
      if (e.code === "KeyA" || lower === "a") {
        heldKeysRef.current.up = false;
      } else if (e.code === "KeyD" || lower === "d") {
        heldKeysRef.current.down = false;
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (activeDragRef.current) {
        e.preventDefault();
      }
    };

    const onWindowBlur = () => {
      heldKeysRef.current.up = false;
      heldKeysRef.current.down = false;
      if (activeDragRef.current) {
        stopActiveDrag(false);
      } else {
        clearPending();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    enabled,
    activateDrag,
    clearPending,
    getScrollTargetForPoint,
    resolveDropTargetAtPoint,
    shelfStripRef,
    stopActiveDrag,
    updateDropTarget,
  ]);

  // Smooth rAF loop for edge auto-scrolling & held A/D keyboard scrolling
  const isDragging = dragState !== null;
  useEffect(() => {
    if (!isDragging) return;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const active = activeDragRef.current;
      if (!active) return;

      const { clientX, clientY } = active;
      let didScroll = false;

      // 1. Horizontal auto-scroll on mobile shelf strip when dragging over its left/right edges
      const shelfEl = shelfStripRef?.current;
      if (shelfEl && shelfEl.scrollWidth > shelfEl.clientWidth + 2) {
        const shelfRect = shelfEl.getBoundingClientRect();
        if (isPointInsideRect(clientX, clientY, shelfRect, 8, 8)) {
          const vx = computeEdgeVelocity(
            clientX,
            shelfRect.left,
            shelfRect.right,
            48,
            460,
            8,
            8,
          );
          if (vx !== 0) {
            const prevLeft = shelfEl.scrollLeft;
            shelfEl.scrollLeft += vx * dt;
            if (shelfEl.scrollLeft !== prevLeft) didScroll = true;
          }
        }
      }

      // 2. Vertical edge auto-scroll + keyboard A/D scroll
      const keyDir =
        (heldKeysRef.current.down ? 1 : 0) - (heldKeysRef.current.up ? 1 : 0);

      const scrollTarget = getScrollTargetForPoint(clientX, clientY);
      if (scrollTarget) {
        let vy = 0;
        if (keyDir !== 0) {
          vy = keyDir * 720;
        } else if (scrollTarget.kind === "dock") {
          vy = computeEdgeVelocity(
            clientY,
            scrollTarget.rect.top,
            scrollTarget.rect.bottom,
            38,
            440,
            4,
            4,
          );
        } else if (scrollTarget.kind === "sidebar") {
          vy = computeEdgeVelocity(
            clientY,
            scrollTarget.rect.top,
            scrollTarget.rect.bottom,
            64,
            560,
            24,
            24,
          );
        } else {
          // Main library grid: allow top/bottom hot-zones while pausing edge scroll over the bottom tray
          const dockEl = dockScrollRef.current;
          const dockRect =
            dockEl && dockEl.offsetParent !== null
              ? dockEl.getBoundingClientRect()
              : null;
          const isInsideDock = Boolean(
            dockRect &&
              dockRect.height > 0 &&
              isPointInsideRect(clientX, clientY, dockRect, 6, 4),
          );
          const hoveredKind = activeDropRef.current?.kind;
          const isHoveringDock =
            isInsideDock ||
            hoveredKind === "dock-more" ||
            hoveredKind === "dock-remove" ||
            hoveredKind === "dock-view-folder" ||
            hoveredKind === "dock-sidebar-folder";

          if (!isHoveringDock && isPointInsideRect(clientX, clientY, scrollTarget.rect, 24, 56)) {
            const isAboveDockSpan = Boolean(
              dockRect &&
                dockRect.height > 0 &&
                clientX >= dockRect.left - 8 &&
                clientX <= dockRect.right + 8 &&
                clientY < dockRect.top,
            );
            const effectiveEndEdge = isAboveDockSpan && dockRect
              ? Math.min(scrollTarget.rect.bottom, dockRect.top)
              : scrollTarget.rect.bottom;
            const outsideEndAllowance = isAboveDockSpan ? 0 : 44;
            const zonePx = isAboveDockSpan ? 68 : 84;

            vy = computeEdgeVelocity(
              clientY,
              scrollTarget.rect.top,
              effectiveEndEdge,
              zonePx,
              720,
              52,
              outsideEndAllowance,
            );
          }
        }

        if (vy !== 0) {
          const prevTop = scrollTarget.el.scrollTop;
          scrollTarget.el.scrollTop += vy * dt;
          if (scrollTarget.el.scrollTop !== prevTop) {
            didScroll = true;
          }
        }
      }

      if (didScroll) {
        updateDropTarget(clientX, clientY, active.bookIds);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isDragging, dockScrollRef, getScrollTargetForPoint, shelfStripRef, updateDropTarget]);

  const handleBookPointerDown = useCallback(
    (bookId: string, e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest(
          '[data-no-book-drag="true"], input, textarea, select, option, a',
        )
      ) {
        return;
      }

      clearPending();
      const dragIds =
        selectedIds.has(bookId) && selectedIds.size > 1
          ? Array.from(selectedIds)
          : [bookId];
      const leadBook = booksById.get(bookId) ?? null;

      const pending: PendingDragState = {
        bookIds: dragIds,
        leadBook,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        holdTimerId: null,
      };

      if (e.pointerType === "touch") {
        pending.holdTimerId = window.setTimeout(() => {
          if (pendingRef.current === pending) {
            activateDrag(pending);
          }
        }, TOUCH_HOLD_MS);
      }

      pendingRef.current = pending;
    },
    [enabled, clearPending, selectedIds, booksById, activateDrag],
  );

  const shouldSuppressClick = useCallback((): boolean => {
    return (
      activeDragRef.current !== null ||
      Date.now() < justDraggedUntilRef.current
    );
  }, []);

  const activeDragBookIds = useMemo(
    () => new Set(dragState?.bookIds ?? []),
    [dragState],
  );

  const renderDragPreview = useCallback(() => {
    if (!dragState || typeof document === "undefined") return null;
    const count = dragState.bookIds.length;
    const title = dragState.leadBook?.title || "Selected book";
    const offsetY = dragState.pointerType === "touch" ? -56 : 14;
    const offsetX = dragState.pointerType === "touch" ? -80 : 14;

    const dropLabel = (() => {
      if (!activeDropTarget) return null;
      switch (activeDropTarget.kind) {
        case "sidebar-favorites":
          return "Add to Favorites";
        case "sidebar-folder":
        case "dock-sidebar-folder":
        case "view-folder":
        case "dock-view-folder":
          return `Move to "${activeDropTarget.label}"`;
        case "sidebar-category":
          return `Set category "${activeDropTarget.label}"`;
        case "sidebar-tag":
          return `Add tag #${activeDropTarget.label}`;
        case "dock-more":
          return activeDropTarget.label || "Choose folders…";
        case "dock-remove":
          return activeDropTarget.label;
        case "book-reorder":
          return activeDropTarget.position === "before"
            ? "Insert before book"
            : "Insert after book";
      }
    })();

    const DropIcon = (() => {
      if (!activeDropTarget) return BookOpen;
      switch (activeDropTarget.kind) {
        case "sidebar-favorites":
          return Star;
        case "sidebar-tag":
          return Tag;
        case "dock-more":
          return FolderSearch;
        case "dock-remove":
          return FolderMinus;
        case "book-reorder":
          return ArrowLeft;
        default:
          return Folder;
      }
    })();

    return createPortal(
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 z-[95] pointer-events-none select-none"
        style={{
          transform: `translate3d(${Math.round(dragState.clientX + offsetX)}px, ${Math.round(dragState.clientY + offsetY)}px, 0)`,
        }}
      >
        <div
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border shadow-xl max-w-[260px] transition-colors ${
            activeDropTarget
              ? "border-[var(--accent)] bg-[var(--bg-elevated)]"
              : "border-[var(--border-strong)] bg-[var(--bg-elevated)]/95"
          }`}
          style={{ boxShadow: "var(--shadow-popover)" }}
        >
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{
              backgroundColor: activeDropTarget
                ? "var(--accent)"
                : "var(--accent-soft)",
              color: activeDropTarget
                ? "var(--accent-contrast, #fff)"
                : "var(--accent)",
            }}
          >
            {count > 1 && !activeDropTarget ? (
              <Layers className="w-4 h-4" />
            ) : (
              <DropIcon className="w-4 h-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                {title}
              </span>
              {count > 1 && (
                <span className="font-mono-tabular text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                  +{count - 1}
                </span>
              )}
            </div>
            <div className="text-[11px] truncate text-[var(--text-muted)]">
              {dropLabel ? (
                <span className="font-medium text-[var(--accent)]">
                  {dropLabel}
                </span>
              ) : dragState.pointerType === "touch" ? (
                "Drag to edge to scroll · Drop on folder"
              ) : (
                "Scroll: Wheel · A / D keys · Edges"
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [dragState, activeDropTarget]);

  return {
    isDraggingBooks: dragState !== null,
    dragState,
    activeDropTarget,
    activeDragBookIds,
    handleBookPointerDown,
    shouldSuppressClick,
    renderDragPreview,
  };
}
