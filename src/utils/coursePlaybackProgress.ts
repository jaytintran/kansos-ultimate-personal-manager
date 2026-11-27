import { useEffect, useState } from "react";
import type { ListItemStatus } from "../types";
import { formatMediaTimestamp } from "./youtube";

export interface CoursePlaybackProgress {
  currentTime: number;
  duration?: number;
  playbackRate?: number;
  updatedAt: string;
}

const COURSE_PLAYBACK_PROGRESS_KEY = "kanso_course_playback_progress_v1";
const COURSE_PLAYBACK_EVENT = "kanso:course-playback-progress-changed";

export function loadAllCoursePlaybackProgress(): Record<
  string,
  CoursePlaybackProgress
> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(COURSE_PLAYBACK_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, CoursePlaybackProgress>;
    }
  } catch {
    // Ignore storage parse failures
  }
  return {};
}

function saveAllCoursePlaybackProgress(
  map: Record<string, CoursePlaybackProgress>,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(COURSE_PLAYBACK_PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COURSE_PLAYBACK_EVENT));
  }
}

export function getCoursePlaybackProgress(
  itemId: string,
): CoursePlaybackProgress | null {
  const all = loadAllCoursePlaybackProgress();
  return all[itemId] ?? null;
}

export function saveCoursePlaybackProgress(
  itemId: string,
  patch: {
    currentTime?: number;
    duration?: number;
    playbackRate?: number;
  },
): void {
  if (!itemId) return;
  const all = loadAllCoursePlaybackProgress();
  const prev = all[itemId];
  const nextCurrent =
    typeof patch.currentTime === "number" && Number.isFinite(patch.currentTime)
      ? Math.max(0, Math.floor(patch.currentTime))
      : prev?.currentTime ?? 0;
  const nextDuration =
    typeof patch.duration === "number" &&
    Number.isFinite(patch.duration) &&
    patch.duration > 0
      ? Math.floor(patch.duration)
      : prev?.duration;
  const nextRate =
    typeof patch.playbackRate === "number" && Number.isFinite(patch.playbackRate)
      ? patch.playbackRate
      : prev?.playbackRate;

  all[itemId] = {
    currentTime: nextCurrent,
    ...(nextDuration ? { duration: nextDuration } : {}),
    ...(nextRate ? { playbackRate: nextRate } : {}),
    updatedAt: new Date().toISOString(),
  };
  saveAllCoursePlaybackProgress(all);
}

export function removeCoursePlaybackProgress(itemIds: string[]): void {
  if (itemIds.length === 0) return;
  const all = loadAllCoursePlaybackProgress();
  let changed = false;
  for (const id of itemIds) {
    if (id in all) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) {
    saveAllCoursePlaybackProgress(all);
  }
}

export function useCoursePlaybackProgress(): Record<
  string,
  CoursePlaybackProgress
> {
  const [progressMap, setProgressMap] = useState<
    Record<string, CoursePlaybackProgress>
  >(loadAllCoursePlaybackProgress);

  useEffect(() => {
    const sync = () => setProgressMap(loadAllCoursePlaybackProgress());
    window.addEventListener(COURSE_PLAYBACK_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(COURSE_PLAYBACK_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return progressMap;
}

export function formatCourseResumeLabel(
  progress: CoursePlaybackProgress | null | undefined,
  status: ListItemStatus,
): string | null {
  if (!progress || status === "done" || status === "dropped") return null;
  if (progress.currentTime < 5) return null;
  return `Resume ${formatMediaTimestamp(progress.currentTime)}`;
}
