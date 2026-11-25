import { ArrowLeft, Folder, FolderMinus, FolderSearch, Layers, MonitorPlay, Star } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StreamItem } from "../types";

export type VaultPointerDropTarget =
  | { kind: "sidebar-favorites"; label: string }
  | { kind: "sidebar-folder"; id: string; label: string }
  | { kind: "dock-folder"; id: string; label: string; isMember?: boolean }
  | { kind: "dock-more"; label: string }
  | { kind: "stream-reorder"; streamId: string; position: "before" | "after" };

export interface ActiveStreamDragState {
  streamIds: string[];
  leadStream: StreamItem | null;
  clientX: number;
  clientY: number;
  pointerType: string;
}

interface PendingDragState {
  streamIds: string[];
  leadStream: StreamItem | null;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  holdTimerId: number | null;
}

interface UseVaultStreamDragOptions {
  enabled: boolean;
  streams: StreamItem[];
  selectedIds: Set<string>;
  isCustomSort: boolean;
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  sidebarScrollRef: React.RefObject<HTMLDivElement | null>;
  dockScrollRef: React.RefObject<HTMLDivElement | null>;
  onDropToFolder: (streamIds: string[], folderId: string) => void;
  onDropToFavorites: (streamIds: string[]) => void;
  onDropToMoreFolders: (streamIds: string[]) => void;
  onReorderStreams: (
    streamIds: string[],
    targetStreamId: string,
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
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
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
  if (
    coord >= startEdge - outsideStartAllowancePx &&
    coord < startEdge + zonePx
  ) {
    const distIntoZone = Math.min(
      zonePx,
      Math.max(0, startEdge + zonePx - coord),
    );
    const ratio = distIntoZone / zonePx;
    return -Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  if (coord > endEdge - zonePx && coord <= endEdge + outsideEndAllowancePx) {
    const distIntoZone = Math.min(
      zonePx,
      Math.max(0, coord - (endEdge - zonePx)),
    );
    const ratio = distIntoZone / zonePx;
    return Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  return 0;
}

function dropTargetsEqual(
  a: VaultPointerDropTarget | null,
  b: VaultPointerDropTarget | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "stream-reorder" && b.kind === "stream-reorder") {
    return a.streamId === b.streamId && a.position === b.position;
  }
  if ("id" in a && "id" in b) {
    return a.id === b.id;
  }
  return true;
}

export function useVaultStreamDrag({
  enabled,
  streams,
  selectedIds,
  isCustomSort,
  mainScrollRef,
  sidebarScrollRef,
  dockScrollRef,
  onDropToFolder,
  onDropToFavorites,
  onDropToMoreFolders,
  onReorderStreams,
}: UseVaultStreamDragOptions) {
  const [dragState, setDragState] = useState<ActiveStreamDragState | null>(
    null,
  );
  const [activeDropTarget, setActiveDropTarget] =
    useState<VaultPointerDropTarget | null>(null);

  const pendingRef = useRef<PendingDragState | null>(null);
  const activeDragRef = useRef<ActiveStreamDragState | null>(null);
  const activeDropRef = useRef<VaultPointerDropTarget | null>(null);
  const heldKeysRef = useRef<{ up: boolean; down: boolean }>({
    up: false,
    down: false,
  });
  const justDraggedUntilRef = useRef(0);

  const streamsById = useMemo(
    () => new Map(streams.map((s) => [s.id, s])),
    [streams],
  );

  const callbacksRef = useRef({
    isCustomSort,
    onDropToFolder,
    onDropToFavorites,
    onDropToMoreFolders,
    onReorderStreams,
  });
  callbacksRef.current = {
    isCustomSort,
    onDropToFolder,
    onDropToFavorites,
    onDropToMoreFolders,
    onReorderStreams,
  };

  const resolveDropTargetAtPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedStreamIds: string[],
    ): VaultPointerDropTarget | null => {
      if (typeof document === "undefined") return null;
      const elements = document.elementsFromPoint(clientX, clientY);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        const dropEl = el.closest<HTMLElement>("[data-vault-drop-kind]");
        if (dropEl && dropEl.dataset.vaultDropDisabled !== "true") {
          const kind = dropEl.dataset.vaultDropKind;
          const id = dropEl.dataset.vaultDropId || "";
          const label = dropEl.dataset.vaultDropLabel || "";
          switch (kind) {
            case "sidebar-favorites":
              return {
                kind: "sidebar-favorites",
                label: label || "Favorites",
              };
            case "sidebar-folder":
              if (id) return { kind: "sidebar-folder", id, label };
              break;
            case "dock-folder":
              if (id) {
                return {
                  kind: "dock-folder",
                  id,
                  label,
                  isMember: dropEl.dataset.vaultDropMember === "true",
                };
              }
              break;
            case "dock-more":
              return { kind: "dock-more", label: label || "Choose folders…" };
          }
        }

        if (callbacksRef.current.isCustomSort) {
          const reorderEl = el.closest<HTMLElement>("[data-vault-reorder-id]");
          if (reorderEl) {
            const targetStreamId = reorderEl.dataset.vaultReorderId;
            if (targetStreamId && !draggedStreamIds.includes(targetStreamId)) {
              const rect = reorderEl.getBoundingClientRect();
              const axis =
                reorderEl.dataset.vaultReorderAxis === "y" ? "y" : "x";
              const position: "before" | "after" =
                axis === "y"
                  ? clientY < rect.top + rect.height / 2
                    ? "before"
                    : "after"
                  : clientX < rect.left + rect.width / 2
                    ? "before"
                    : "after";
              return {
                kind: "stream-reorder",
                streamId: targetStreamId,
                position,
              };
            }
          }
        }
      }
      return null;
    },
    [],
  );

  const updateDropTarget = useCallback(
    (clientX: number, clientY: number, streamIds: string[]) => {
      const next = resolveDropTargetAtPoint(clientX, clientY, streamIds);
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

  const stopActiveDrag = useCallback(
    (markJustDragged: boolean) => {
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
    },
    [clearPending],
  );

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
      if (
        pending.pointerType === "touch" &&
        typeof navigator !== "undefined" &&
        "vibrate" in navigator
      ) {
        try {
          navigator.vibrate(12);
        } catch {
          // Ignore haptics errors
        }
      }
      const nextState: ActiveStreamDragState = {
        streamIds: pending.streamIds,
        leadStream: pending.leadStream,
        clientX: pending.lastX,
        clientY: pending.lastY,
        pointerType: pending.pointerType,
      };
      activeDragRef.current = nextState;
      setDragState(nextState);
      updateDropTarget(pending.lastX, pending.lastY, pending.streamIds);
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
        if (
          asideRect.width > 0 &&
          isPointInsideRect(clientX, clientY, asideRect, 4, 4)
        ) {
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

  // Global pointer, wheel, keyboard (W/S), and touchmove lock while dragging or pending
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

      const updated: ActiveStreamDragState = {
        ...active,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      activeDragRef.current = updated;
      setDragState(updated);
      updateDropTarget(e.clientX, e.clientY, active.streamIds);
    };

    const commitDropAndStop = (clientX: number, clientY: number) => {
      const active = activeDragRef.current;
      if (!active) {
        clearPending();
        return;
      }

      const resolved =
        resolveDropTargetAtPoint(clientX, clientY, active.streamIds) ??
        activeDropRef.current;
      const ids = active.streamIds;
      stopActiveDrag(true);

      if (!resolved || ids.length === 0) return;
      const cb = callbacksRef.current;
      switch (resolved.kind) {
        case "sidebar-favorites":
          cb.onDropToFavorites(ids);
          break;
        case "sidebar-folder":
        case "dock-folder":
          cb.onDropToFolder(ids, resolved.id);
          break;
        case "dock-more":
          cb.onDropToMoreFolders(ids);
          break;
        case "stream-reorder":
          cb.onReorderStreams(ids, resolved.streamId, resolved.position);
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
        e.preventDefault();
      }
    };

    const onWheel = (e: WheelEvent) => {
      const active = activeDragRef.current;
      if (!active) return;

      const target = getScrollTargetForPoint(e.clientX, e.clientY);
      if (!target) return;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      else if (e.deltaMode === 2) dy *= target.el.clientHeight || 320;

      if (dy !== 0) {
        e.preventDefault();
        target.el.scrollTop += dy;
        updateDropTarget(active.clientX, active.clientY, active.streamIds);
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
      if (e.code === "KeyW" || lower === "w") {
        e.preventDefault();
        heldKeysRef.current.up = true;
      } else if (e.code === "KeyS" || lower === "s") {
        e.preventDefault();
        heldKeysRef.current.down = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const lower = e.key.toLowerCase();
      if (e.code === "KeyW" || lower === "w") {
        heldKeysRef.current.up = false;
      } else if (e.code === "KeyS" || lower === "s") {
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
    stopActiveDrag,
    updateDropTarget,
  ]);

  // Smooth rAF loop for edge auto-scrolling & held W/S keyboard scrolling
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
            hoveredKind === "dock-folder";

          if (
            !isHoveringDock &&
            isPointInsideRect(clientX, clientY, scrollTarget.rect, 24, 56)
          ) {
            const isAboveDockSpan = Boolean(
              dockRect &&
                dockRect.height > 0 &&
                clientX >= dockRect.left - 8 &&
                clientX <= dockRect.right + 8 &&
                clientY < dockRect.top,
            );
            const effectiveEndEdge =
              isAboveDockSpan && dockRect
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
        updateDropTarget(clientX, clientY, active.streamIds);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isDragging, dockScrollRef, getScrollTargetForPoint, updateDropTarget]);

  const handleStreamPointerDown = useCallback(
    (streamId: string, e: React.PointerEvent) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const targetEl = e.target as HTMLElement | null;
      if (
        targetEl?.closest(
          '[data-no-stream-drag="true"], input, textarea, select, option, a',
        )
      ) {
        return;
      }

      clearPending();
      const dragIds =
        selectedIds.has(streamId) && selectedIds.size > 1
          ? Array.from(selectedIds)
          : [streamId];
      const leadStream = streamsById.get(streamId) ?? null;

      const pending: PendingDragState = {
        streamIds: dragIds,
        leadStream,
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
    [enabled, clearPending, selectedIds, streamsById, activateDrag],
  );

  const shouldSuppressClick = useCallback((): boolean => {
    return (
      activeDragRef.current !== null || Date.now() < justDraggedUntilRef.current
    );
  }, []);

  const activeDragStreamIds = useMemo(
    () => new Set(dragState?.streamIds ?? []),
    [dragState],
  );

  const renderDragPreview = useCallback(() => {
    if (!dragState || typeof document === "undefined") return null;
    const count = dragState.streamIds.length;
    const title =
      dragState.leadStream?.customLabel ||
      dragState.leadStream?.title ||
      "Selected stream";
    const offsetY = dragState.pointerType === "touch" ? -56 : 14;
    const offsetX = dragState.pointerType === "touch" ? -80 : 14;

    const dropLabel = (() => {
      if (!activeDropTarget) return null;
      switch (activeDropTarget.kind) {
        case "sidebar-favorites":
          return "Add to Favorites";
        case "sidebar-folder":
          return `Move to "${activeDropTarget.label}"`;
        case "dock-folder":
          return activeDropTarget.isMember
            ? `Remove from "${activeDropTarget.label}"`
            : `Move to "${activeDropTarget.label}"`;
        case "dock-more":
          return activeDropTarget.label || "Choose folders…";
        case "stream-reorder":
          return activeDropTarget.position === "before"
            ? "Insert before stream"
            : "Insert after stream";
      }
    })();

    const DropIcon = (() => {
      if (!activeDropTarget) return MonitorPlay;
      switch (activeDropTarget.kind) {
        case "sidebar-favorites":
          return Star;
        case "dock-more":
          return FolderSearch;
        case "dock-folder":
          return activeDropTarget.isMember ? FolderMinus : Folder;
        case "stream-reorder":
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
                ? "var(--accent-fg)"
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
                "Scroll: Wheel · W / S keys · Edges"
              )}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [dragState, activeDropTarget]);

  return {
    isDraggingStreams: dragState !== null,
    dragState,
    activeDropTarget,
    activeDragStreamIds,
    handleStreamPointerDown,
    shouldSuppressClick,
    renderDragPreview,
  };
}
