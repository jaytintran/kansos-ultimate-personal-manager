import { ArrowUpDown, ListMusic } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface PlaylistPointerDropTarget {
  playlistId: string;
  position: "before" | "after";
}

export interface ActivePlaylistDragState {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  pinned: boolean;
  clientX: number;
  clientY: number;
  pointerType: string;
}

interface PendingPlaylistDragState {
  playlistId: string;
  playlistName: string;
  trackCount: number;
  pinned: boolean;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  holdTimerId: number | null;
}

interface UseManagerPlaylistDragOptions {
  enabled: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  onReorderPlaylists: (
    draggedId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
}

const MOUSE_DRAG_THRESHOLD_PX = 5;
const TOUCH_HOLD_MS = 220;
const TOUCH_CANCEL_MOVE_PX = 9;

function computeEdgeVelocity(
  coord: number,
  startEdge: number,
  endEdge: number,
  zonePx: number,
  maxSpeedPxPerSec: number,
): number {
  if (coord >= startEdge - 20 && coord < startEdge + zonePx) {
    const ratio =
      Math.min(zonePx, Math.max(0, startEdge + zonePx - coord)) / zonePx;
    return -Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  if (coord > endEdge - zonePx && coord <= endEdge + 20) {
    const ratio =
      Math.min(zonePx, Math.max(0, coord - (endEdge - zonePx))) / zonePx;
    return Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  return 0;
}

export function useManagerPlaylistDrag({
  enabled,
  scrollContainerRef,
  onReorderPlaylists,
}: UseManagerPlaylistDragOptions) {
  const [dragState, setDragState] = useState<ActivePlaylistDragState | null>(
    null,
  );
  const [activeDropTarget, setActiveDropTarget] =
    useState<PlaylistPointerDropTarget | null>(null);

  const pendingRef = useRef<PendingPlaylistDragState | null>(null);
  const activeDragRef = useRef<ActivePlaylistDragState | null>(null);
  const activeDropRef = useRef<PlaylistPointerDropTarget | null>(null);
  const justDraggedUntilRef = useRef(0);
  const onReorderRef = useRef(onReorderPlaylists);
  onReorderRef.current = onReorderPlaylists;

  const resolveDropTargetAtPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedId: string,
      draggedPinned: boolean,
    ): PlaylistPointerDropTarget | null => {
      if (typeof document === "undefined") return null;
      const elements = document.elementsFromPoint(clientX, clientY);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        const reorderEl = el.closest<HTMLElement>(
          "[data-playlist-reorder-id]",
        );
        if (!reorderEl) continue;
        const targetId = reorderEl.dataset.playlistReorderId;
        if (!targetId || targetId === draggedId) continue;
        const targetPinned = reorderEl.dataset.playlistPinned === "true";
        if (targetPinned !== draggedPinned) continue;

        const rect = reorderEl.getBoundingClientRect();
        const position: "before" | "after" =
          clientY < rect.top + rect.height / 2 ? "before" : "after";
        return { playlistId: targetId, position };
      }
      return null;
    },
    [],
  );

  const updateDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedId: string,
      draggedPinned: boolean,
    ) => {
      const next = resolveDropTargetAtPoint(
        clientX,
        clientY,
        draggedId,
        draggedPinned,
      );
      const cur = activeDropRef.current;
      if (
        cur?.playlistId !== next?.playlistId ||
        cur?.position !== next?.position
      ) {
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
    (pending: PendingPlaylistDragState) => {
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
      const nextState: ActivePlaylistDragState = {
        playlistId: pending.playlistId,
        playlistName: pending.playlistName,
        trackCount: pending.trackCount,
        pinned: pending.pinned,
        clientX: pending.lastX,
        clientY: pending.lastY,
        pointerType: pending.pointerType,
      };
      activeDragRef.current = nextState;
      setDragState(nextState);
      updateDropTarget(
        pending.lastX,
        pending.lastY,
        pending.playlistId,
        pending.pinned,
      );
    },
    [updateDropTarget],
  );

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
        const dist = Math.hypot(
          e.clientX - pending.startX,
          e.clientY - pending.startY,
        );
        if (pending.pointerType === "touch") {
          if (dist > TOUCH_CANCEL_MOVE_PX) clearPending();
          return;
        }
        if (dist >= MOUSE_DRAG_THRESHOLD_PX) {
          activateDrag(pending);
        }
        return;
      }

      const active = activeDragRef.current;
      if (!active) return;

      const updated: ActivePlaylistDragState = {
        ...active,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      activeDragRef.current = updated;
      setDragState(updated);
      updateDropTarget(
        e.clientX,
        e.clientY,
        active.playlistId,
        active.pinned,
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingRef.current && e.pointerId === pendingRef.current.pointerId) {
        clearPending();
        return;
      }
      const active = activeDragRef.current;
      if (!active) return;

      const resolved =
        resolveDropTargetAtPoint(
          e.clientX,
          e.clientY,
          active.playlistId,
          active.pinned,
        ) ?? activeDropRef.current;
      const draggedId = active.playlistId;
      stopActiveDrag(true);
      if (resolved) {
        onReorderRef.current(draggedId, resolved.playlistId, resolved.position);
      }
    };

    const onPointerCancel = () => {
      if (pendingRef.current) clearPending();
      if (activeDragRef.current) stopActiveDrag(false);
    };

    const onWheel = (e: WheelEvent) => {
      const active = activeDragRef.current;
      const scroller = scrollContainerRef.current;
      if (!active || !scroller) return;
      if (scroller.scrollHeight <= scroller.clientHeight + 2) return;

      const rect = scroller.getBoundingClientRect();
      if (
        e.clientX < rect.left - 12 ||
        e.clientX > rect.right + 12 ||
        e.clientY < rect.top - 12 ||
        e.clientY > rect.bottom + 12
      ) {
        return;
      }

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      else if (e.deltaMode === 2) dy *= scroller.clientHeight || 280;
      if (dy !== 0) {
        e.preventDefault();
        scroller.scrollTop += dy;
        updateDropTarget(
          active.clientX,
          active.clientY,
          active.playlistId,
          active.pinned,
        );
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (activeDragRef.current && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        stopActiveDrag(false);
      }
    };

    const onWindowBlur = () => {
      if (activeDragRef.current) stopActiveDrag(false);
      else clearPending();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    enabled,
    activateDrag,
    clearPending,
    resolveDropTargetAtPoint,
    scrollContainerRef,
    stopActiveDrag,
    updateDropTarget,
  ]);

  const isDraggingPlaylist = dragState !== null;
  useEffect(() => {
    if (!isDraggingPlaylist) return;
    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const active = activeDragRef.current;
      const scroller = scrollContainerRef.current;
      if (active && scroller && scroller.scrollHeight > scroller.clientHeight + 2) {
        const rect = scroller.getBoundingClientRect();
        if (
          active.clientX >= rect.left - 24 &&
          active.clientX <= rect.right + 24 &&
          active.clientY >= rect.top - 36 &&
          active.clientY <= rect.bottom + 36
        ) {
          const vy = computeEdgeVelocity(
            active.clientY,
            rect.top,
            rect.bottom,
            56,
            520,
          );
          if (vy !== 0) {
            const prevTop = scroller.scrollTop;
            scroller.scrollTop += vy * dt;
            if (scroller.scrollTop !== prevTop) {
              updateDropTarget(
                active.clientX,
                active.clientY,
                active.playlistId,
                active.pinned,
              );
            }
          }
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isDraggingPlaylist, scrollContainerRef, updateDropTarget]);

  const handlePlaylistPointerDown = useCallback(
    (
      playlistId: string,
      playlistName: string,
      trackCount: number,
      pinned: boolean,
      e: React.PointerEvent,
    ) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const targetEl = e.target as HTMLElement | null;
      if (
        !targetEl?.closest('[data-playlist-drag-handle="true"]') ||
        targetEl.closest(
          '[data-no-playlist-drag="true"], input, textarea, select',
        )
      ) {
        return;
      }

      e.stopPropagation();
      clearPending();
      const pending: PendingPlaylistDragState = {
        playlistId,
        playlistName,
        trackCount,
        pinned,
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
    [enabled, clearPending, activateDrag],
  );

  const shouldSuppressPlaylistClick = useCallback((): boolean => {
    return (
      activeDragRef.current !== null ||
      Date.now() < justDraggedUntilRef.current
    );
  }, []);

  const renderPlaylistDragPreview = useCallback(() => {
    if (!dragState || typeof document === "undefined") return null;
    const offsetY = dragState.pointerType === "touch" ? -46 : 14;
    const offsetX = dragState.pointerType === "touch" ? -72 : 14;

    return createPortal(
      <div
        aria-hidden="true"
        className="fixed top-0 left-0 z-[95] pointer-events-none select-none"
        style={{
          transform: `translate3d(${Math.round(dragState.clientX + offsetX)}px, ${Math.round(dragState.clientY + offsetY)}px, 0)`,
        }}
      >
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border shadow-xl max-w-[240px]"
          style={{
            backgroundColor: "var(--bg-elevated)",
            borderColor: activeDropTarget
              ? "var(--accent)"
              : "var(--border-strong)",
            boxShadow: "var(--shadow-popover)",
          }}
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
            {activeDropTarget ? (
              <ArrowUpDown className="w-3.5 h-3.5" />
            ) : (
              <ListMusic className="w-3.5 h-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate text-[var(--text-primary)]">
              {dragState.playlistName}
            </div>
            <div className="text-[11px] truncate text-[var(--text-muted)]">
              {activeDropTarget
                ? activeDropTarget.position === "before"
                  ? "Move before"
                  : "Move after"
                : `${dragState.trackCount} ${dragState.trackCount === 1 ? "track" : "tracks"}`}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [dragState, activeDropTarget]);

  return {
    isDraggingPlaylist,
    draggingPlaylistId: dragState?.playlistId ?? null,
    activePlaylistDropTarget: activeDropTarget,
    handlePlaylistPointerDown,
    shouldSuppressPlaylistClick,
    renderPlaylistDragPreview,
  };
}
