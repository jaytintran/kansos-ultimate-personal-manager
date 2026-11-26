import { ArrowUpDown, Tv } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ChannelPointerDropTarget {
  channelName: string;
  position: "before" | "after";
}

export interface ActiveChannelDragState {
  channelName: string;
  streamCount: number;
  pinned: boolean;
  clientX: number;
  clientY: number;
  pointerType: string;
}

interface PendingChannelDragState {
  channelName: string;
  streamCount: number;
  pinned: boolean;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  holdTimerId: number | null;
}

interface UseVaultChannelDragOptions {
  enabled: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  secondaryScrollRef?: React.RefObject<HTMLDivElement | null>;
  onReorderChannels: (
    draggedChannel: string,
    targetChannel: string,
    position: "before" | "after",
  ) => void;
}

const MOUSE_DRAG_THRESHOLD_PX = 6;
const TOUCH_HOLD_MS = 220;
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

function computeEdgeVelocity(
  coord: number,
  startEdge: number,
  endEdge: number,
  zonePx: number,
  maxSpeedPxPerSec: number,
): number {
  if (coord >= startEdge - 24 && coord < startEdge + zonePx) {
    const distIntoZone = Math.min(
      zonePx,
      Math.max(0, startEdge + zonePx - coord),
    );
    const ratio = distIntoZone / zonePx;
    return -Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  if (coord > endEdge - zonePx && coord <= endEdge + 24) {
    const distIntoZone = Math.min(
      zonePx,
      Math.max(0, coord - (endEdge - zonePx)),
    );
    const ratio = distIntoZone / zonePx;
    return Math.pow(ratio, 1.3) * maxSpeedPxPerSec;
  }
  return 0;
}

export function useVaultChannelDrag({
  enabled,
  scrollContainerRef,
  secondaryScrollRef,
  onReorderChannels,
}: UseVaultChannelDragOptions) {
  const [dragState, setDragState] = useState<ActiveChannelDragState | null>(
    null,
  );
  const [activeDropTarget, setActiveDropTarget] =
    useState<ChannelPointerDropTarget | null>(null);

  const pendingRef = useRef<PendingChannelDragState | null>(null);
  const activeDragRef = useRef<ActiveChannelDragState | null>(null);
  const activeDropRef = useRef<ChannelPointerDropTarget | null>(null);
  const justDraggedUntilRef = useRef(0);
  const onReorderRef = useRef(onReorderChannels);
  onReorderRef.current = onReorderChannels;

  const resolveDropTargetAtPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedChannelName: string,
      draggedPinned: boolean,
    ): ChannelPointerDropTarget | null => {
      if (typeof document === "undefined") return null;
      const elements = document.elementsFromPoint(clientX, clientY);
      for (const el of elements) {
        if (!(el instanceof HTMLElement)) continue;
        const reorderEl = el.closest<HTMLElement>("[data-channel-reorder-id]");
        if (!reorderEl) continue;
        const targetChannelName = reorderEl.dataset.channelReorderId;
        if (!targetChannelName || targetChannelName === draggedChannelName) {
          continue;
        }
        const targetPinned = reorderEl.dataset.channelPinned === "true";
        if (targetPinned !== draggedPinned) {
          continue;
        }
        const rect = reorderEl.getBoundingClientRect();
        const axis = reorderEl.dataset.channelReorderAxis === "x" ? "x" : "y";
        const position: "before" | "after" =
          axis === "x"
            ? clientX < rect.left + rect.width / 2
              ? "before"
              : "after"
            : clientY < rect.top + rect.height / 2
              ? "before"
              : "after";
        return { channelName: targetChannelName, position };
      }
      return null;
    },
    [],
  );

  const updateDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      draggedChannelName: string,
      draggedPinned: boolean,
    ) => {
      const next = resolveDropTargetAtPoint(
        clientX,
        clientY,
        draggedChannelName,
        draggedPinned,
      );
      const cur = activeDropRef.current;
      if (
        cur?.channelName !== next?.channelName ||
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
    (pending: PendingChannelDragState) => {
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
      const nextState: ActiveChannelDragState = {
        channelName: pending.channelName,
        streamCount: pending.streamCount,
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
        pending.channelName,
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

      const updated: ActiveChannelDragState = {
        ...active,
        clientX: e.clientX,
        clientY: e.clientY,
      };
      activeDragRef.current = updated;
      setDragState(updated);
      updateDropTarget(
        e.clientX,
        e.clientY,
        active.channelName,
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
          active.channelName,
          active.pinned,
        ) ?? activeDropRef.current;
      const draggedName = active.channelName;
      stopActiveDrag(true);
      if (resolved) {
        onReorderRef.current(
          draggedName,
          resolved.channelName,
          resolved.position,
        );
      }
    };

    const onPointerCancel = () => {
      if (pendingRef.current) clearPending();
      if (activeDragRef.current) stopActiveDrag(false);
    };

    const getScrollerAtPoint = (clientX: number, clientY: number): HTMLDivElement | null => {
      const secondary = secondaryScrollRef?.current;
      if (secondary && secondary.scrollHeight > secondary.clientHeight + 2) {
        const sRect = secondary.getBoundingClientRect();
        if (sRect.width > 0 && isPointInsideRect(clientX, clientY, sRect, 12, 12)) {
          return secondary;
        }
      }
      const primary = scrollContainerRef.current;
      if (primary && primary.scrollHeight > primary.clientHeight + 2) {
        const pRect = primary.getBoundingClientRect();
        if (pRect.width > 0 && isPointInsideRect(clientX, clientY, pRect, 12, 12)) {
          return primary;
        }
      }
      return null;
    };

    const onWheel = (e: WheelEvent) => {
      const active = activeDragRef.current;
      if (!active) return;
      const scroller = getScrollerAtPoint(e.clientX, e.clientY);
      if (!scroller) return;

      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32;
      else if (e.deltaMode === 2) dy *= scroller.clientHeight || 320;
      if (dy !== 0) {
        e.preventDefault();
        scroller.scrollTop += dy;
        updateDropTarget(
          active.clientX,
          active.clientY,
          active.channelName,
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
    secondaryScrollRef,
    stopActiveDrag,
    updateDropTarget,
  ]);

  const isDraggingChannel = dragState !== null;
  useEffect(() => {
    if (!isDraggingChannel) return;
    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const active = activeDragRef.current;
      if (!active) return;

      const secondary = secondaryScrollRef?.current;
      const primary = scrollContainerRef.current;
      const secondaryRect = secondary?.getBoundingClientRect();
      const scroller =
        secondary &&
        secondaryRect &&
        secondaryRect.width > 0 &&
        secondary.scrollHeight > secondary.clientHeight + 2 &&
        isPointInsideRect(active.clientX, active.clientY, secondaryRect, 16, 28)
          ? secondary
          : primary;

      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (
          scroller.scrollHeight > scroller.clientHeight + 2 &&
          isPointInsideRect(active.clientX, active.clientY, rect, 24, 36)
        ) {
          const vy = computeEdgeVelocity(
            active.clientY,
            rect.top,
            rect.bottom,
            72,
            640,
          );
          if (vy !== 0) {
            const prevTop = scroller.scrollTop;
            scroller.scrollTop += vy * dt;
            if (scroller.scrollTop !== prevTop) {
              updateDropTarget(
                active.clientX,
                active.clientY,
                active.channelName,
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
  }, [isDraggingChannel, scrollContainerRef, secondaryScrollRef, updateDropTarget]);

  const handleChannelPointerDown = useCallback(
    (
      channelName: string,
      streamCount: number,
      pinned: boolean,
      e: React.PointerEvent,
    ) => {
      if (!enabled) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const targetEl = e.target as HTMLElement | null;
      if (
        !targetEl?.closest('[data-channel-drag-handle="true"]') ||
        targetEl.closest('[data-no-channel-drag="true"], input, textarea, select')
      ) {
        return;
      }

      e.stopPropagation();
      clearPending();
      const pending: PendingChannelDragState = {
        channelName,
        streamCount,
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

  const shouldSuppressChannelClick = useCallback((): boolean => {
    return (
      activeDragRef.current !== null ||
      Date.now() < justDraggedUntilRef.current
    );
  }, []);

  const renderChannelDragPreview = useCallback(() => {
    if (!dragState || typeof document === "undefined") return null;
    const offsetY = dragState.pointerType === "touch" ? -48 : 14;
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
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border shadow-xl max-w-[260px]"
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
              <Tv className="w-3.5 h-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate text-[var(--text-primary)]">
              {dragState.channelName}
            </div>
            <div className="text-[11px] truncate text-[var(--text-muted)]">
              {activeDropTarget
                ? `${activeDropTarget.position === "before" ? "Move before" : "Move after"} ${activeDropTarget.channelName}`
                : `${dragState.streamCount} ${dragState.streamCount === 1 ? "stream" : "streams"}`}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );
  }, [dragState, activeDropTarget]);

  return {
    isDraggingChannel,
    draggingChannelName: dragState?.channelName ?? null,
    activeChannelDropTarget: activeDropTarget,
    handleChannelPointerDown,
    shouldSuppressChannelClick,
    renderChannelDragPreview,
  };
}
