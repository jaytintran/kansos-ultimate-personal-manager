import React from "react";
import { ArrowRightLeft, Circle, X } from "lucide-react";
import { Entry } from "../../types";

interface SwapXActiveModalProps {
  open: boolean;
  incomingTitle: string;
  xActiveTasks: Entry[];
  xLimit: number;
  onSelectSwapOut: (swapOutEntryId: string) => void;
  onCancel: () => void;
}

export const SwapXActiveModal: React.FC<SwapXActiveModalProps> = ({
  open,
  incomingTitle,
  xActiveTasks,
  xLimit,
  onSelectSwapOut,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Swap an X-Active task"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-2xl border p-5 space-y-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <ArrowRightLeft
                className="w-4 h-4 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <h3 className="font-display text-sm font-bold">
                X-Active is at {xLimit}-task capacity
              </h3>
            </div>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Choose one active task to swap out so{" "}
              <span
                className="font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                &ldquo;{incomingTitle || "this item"}&rdquo;
              </span>{" "}
              can take its focus slot.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="h-7 w-7 flex items-center justify-center rounded-md shrink-0 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Cancel swap"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="rounded-xl border divide-y overflow-hidden"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {xActiveTasks.map((task, idx) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onSelectSwapOut(task.id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <span
                className="text-[11px] font-mono tabular-nums shrink-0 w-5"
                style={{ color: "var(--text-muted)" }}
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <Circle
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="flex-1 min-w-0 text-sm font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {task.title}
              </span>
              <span
                className="text-[11px] font-medium shrink-0"
                style={{ color: "var(--accent)" }}
              >
                Swap out
              </span>
            </button>
          ))}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-3.5 rounded-xl border text-xs font-medium cursor-pointer"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Keep Current Queue
          </button>
        </div>
      </div>
    </div>
  );
};
