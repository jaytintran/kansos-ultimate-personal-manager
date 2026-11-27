import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  X,
} from "lucide-react";
import type { ListItem } from "../../types";
import {
  buildYouTubeCourseEmbedUrl,
  formatMediaTimestamp,
  parseYouTubeCourseUrl,
  parseYouTubeMessage,
  registerYouTubeListener,
  sendYouTubeCommand,
} from "../../utils/youtube";
import {
  getCoursePlaybackProgress,
  saveCoursePlaybackProgress,
} from "../../utils/coursePlaybackProgress";
import { openExternalUrlSafely } from "../../utils/listBookLinks";

export interface CourseYouTubePlayerHandle {
  seekTo: (seconds: number, playIfPaused?: boolean) => void;
  getCurrentTime: () => number;
  play: () => void;
  pause: () => void;
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 1.75, 2] as const;

interface CourseYouTubePlayerProps {
  item: ListItem;
  mode: "theater" | "study";
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onOpenStudyTab?: () => void;
  onMarkCompleted?: () => void;
  nextVideoTitle?: string | null;
  onNextVideo?: () => void;
  autoplay?: boolean;
  maxHeightClass?: string;
  extraControlSlot?: React.ReactNode;
  onInsertTimestamp?: (seconds: number) => void;
}

export const CourseYouTubePlayer = forwardRef<
  CourseYouTubePlayerHandle,
  CourseYouTubePlayerProps
>(
  (
    {
      item,
      mode,
      collapsed = false,
      onToggleCollapse,
      onClose,
      onOpenStudyTab,
      onMarkCompleted,
      nextVideoTitle,
      onNextVideo,
      autoplay = false,
      maxHeightClass = "max-h-[420px]",
      extraControlSlot,
      onInsertTimestamp,
    },
    ref,
  ) => {
    const parsed = useMemo(
      () => (item.url ? parseYouTubeCourseUrl(item.url) : null),
      [item.url],
    );

    const initialProgress = useMemo(
      () => getCoursePlaybackProgress(item.id),
      // Intentionally keyed only on item.id and parsed URL so live progress saves never reload the iframe
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [item.id, parsed?.normalizedUrl],
    );

    const widgetId = useMemo(
      () => `kanso-course-${mode}-${item.id}`,
      [mode, item.id],
    );

    const embedSrc = useMemo(() => {
      if (!parsed) return "";
      const resumeSec =
        item.status !== "done" &&
        initialProgress &&
        initialProgress.currentTime >= 5
          ? initialProgress.currentTime
          : parsed.startSeconds;
      return buildYouTubeCourseEmbedUrl({
        videoId: parsed.videoId,
        playlistId: parsed.playlistId,
        startSeconds: resumeSec,
        autoplay,
      });
    }, [parsed, initialProgress, item.status, autoplay]);

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const [playerState, setPlayerState] = useState<number>(autoplay ? 1 : -1);
    const [currentTime, setCurrentTime] = useState<number>(
      initialProgress?.currentTime ?? parsed?.startSeconds ?? 0,
    );
    const [duration, setDuration] = useState<number>(
      initialProgress?.duration ?? 0,
    );
    const [playbackRate, setPlaybackRate] = useState<number>(
      initialProgress?.playbackRate ?? 1,
    );
    const [ended, setEnded] = useState(false);

    const latestTimeRef = useRef(currentTime);
    latestTimeRef.current = currentTime;
    const latestDurationRef = useRef(duration);
    latestDurationRef.current = duration;
    const latestRateRef = useRef(playbackRate);
    latestRateRef.current = playbackRate;
    const lastPersistTsRef = useRef(0);
    const hasAppliedInitialRateRef = useRef(false);

    useEffect(() => {
      const saved = getCoursePlaybackProgress(item.id);
      const start =
        saved?.currentTime ?? parsed?.startSeconds ?? 0;
      setCurrentTime(start);
      setDuration(saved?.duration ?? 0);
      setPlaybackRate(saved?.playbackRate ?? 1);
      setPlayerState(autoplay ? 1 : -1);
      setEnded(false);
      hasAppliedInitialRateRef.current = false;
    }, [item.id, parsed?.normalizedUrl, parsed?.startSeconds, autoplay]);

    const persistNow = useCallback(
      (force = false) => {
        const now = Date.now();
        if (!force && now - lastPersistTsRef.current < 2500) return;
        lastPersistTsRef.current = now;
        saveCoursePlaybackProgress(item.id, {
          currentTime: latestTimeRef.current,
          duration: latestDurationRef.current || undefined,
          playbackRate: latestRateRef.current,
        });
      },
      [item.id],
    );

    useEffect(() => {
      return () => {
        if (latestTimeRef.current >= 5) {
          saveCoursePlaybackProgress(item.id, {
            currentTime: latestTimeRef.current,
            duration: latestDurationRef.current || undefined,
            playbackRate: latestRateRef.current,
          });
        }
      };
    }, [item.id]);

    const seekToSeconds = useCallback(
      (rawSeconds: number, playIfPaused = false) => {
        const safe = Math.max(0, Math.floor(rawSeconds));
        setCurrentTime(safe);
        latestTimeRef.current = safe;
        setEnded(false);
        sendYouTubeCommand(iframeRef.current, "seekTo", [safe, true], widgetId);
        if (playIfPaused) {
          sendYouTubeCommand(iframeRef.current, "playVideo", [], widgetId);
          setPlayerState(1);
        }
        persistNow(true);
      },
      [widgetId, persistNow],
    );

    useImperativeHandle(
      ref,
      () => ({
        seekTo: (seconds: number, playIfPaused = true) =>
          seekToSeconds(seconds, playIfPaused),
        getCurrentTime: () => latestTimeRef.current,
        play: () => {
          sendYouTubeCommand(iframeRef.current, "playVideo", [], widgetId);
          setPlayerState(1);
          setEnded(false);
        },
        pause: () => {
          sendYouTubeCommand(iframeRef.current, "pauseVideo", [], widgetId);
          setPlayerState(2);
          persistNow(true);
        },
      }),
      [seekToSeconds, widgetId, persistNow],
    );

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow) return;
        const msg = parseYouTubeMessage(event);
        if (!msg) return;
        if (msg.id && msg.id !== widgetId) return;
        if (!msg.id && event.source !== iframe.contentWindow) return;

        if (msg.event === "onReady" && !hasAppliedInitialRateRef.current) {
          hasAppliedInitialRateRef.current = true;
          if (latestRateRef.current !== 1) {
            sendYouTubeCommand(
              iframeRef.current,
              "setPlaybackRate",
              [latestRateRef.current],
              widgetId,
            );
          }
        }

        if (typeof msg.duration === "number" && msg.duration > 0) {
          setDuration(msg.duration);
          latestDurationRef.current = msg.duration;
        }

        if (typeof msg.currentTime === "number") {
          setCurrentTime(msg.currentTime);
          latestTimeRef.current = msg.currentTime;
          if (msg.currentTime >= 5) {
            persistNow(false);
          }
        }

        if (typeof msg.playbackRate === "number") {
          setPlaybackRate(msg.playbackRate);
          latestRateRef.current = msg.playbackRate;
          persistNow(true);
        }

        if (typeof msg.playerState === "number") {
          setPlayerState(msg.playerState);
          if (msg.playerState === 1) {
            setEnded(false);
            if (
              !hasAppliedInitialRateRef.current &&
              latestRateRef.current !== 1
            ) {
              hasAppliedInitialRateRef.current = true;
              sendYouTubeCommand(
                iframeRef.current,
                "setPlaybackRate",
                [latestRateRef.current],
                widgetId,
              );
            }
          } else if (msg.playerState === 2) {
            persistNow(true);
          } else if (msg.playerState === 0) {
            setEnded(true);
            persistNow(true);
          }
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [widgetId, persistNow]);

    const handleIframeLoad = useCallback(() => {
      const iframe = iframeRef.current;
      registerYouTubeListener(iframe, widgetId);
      window.setTimeout(() => registerYouTubeListener(iframe, widgetId), 650);
      window.setTimeout(() => registerYouTubeListener(iframe, widgetId), 1600);
    }, [widgetId]);

    const isPlaying = playerState === 1;

    const handleTogglePlay = () => {
      if (isPlaying) {
        sendYouTubeCommand(iframeRef.current, "pauseVideo", [], widgetId);
        setPlayerState(2);
        persistNow(true);
      } else {
        sendYouTubeCommand(iframeRef.current, "playVideo", [], widgetId);
        setPlayerState(1);
        setEnded(false);
      }
    };

    const handleChangeSpeed = (rate: number) => {
      setPlaybackRate(rate);
      latestRateRef.current = rate;
      sendYouTubeCommand(iframeRef.current, "setPlaybackRate", [rate], widgetId);
      persistNow(true);
    };

    if (!parsed) return null;

    return (
      <div
        className="rounded-xl border overflow-hidden transition-colors"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Top Header / Sticky Mini-Bar */}
        <div
          className="px-3 py-2 flex items-center justify-between gap-2 border-b"
          style={{
            backgroundColor: "var(--bg-surface-subtle)",
            borderColor: collapsed ? "transparent" : "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {collapsed && (
              <button
                type="button"
                onClick={handleTogglePlay}
                title={isPlaying ? "Pause video" : "Play video"}
                aria-label={isPlaying ? "Pause video" : "Play video"}
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 ml-0.5" />
                )}
              </button>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.title}
                </span>
                {parsed.playlistId && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded border shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Playlist
                  </span>
                )}
              </div>
              {(item.subtitle || currentTime > 0) && (
                <div
                  className="flex items-center gap-1.5 text-[11px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.subtitle && (
                    <span className="truncate">{item.subtitle}</span>
                  )}
                  {item.subtitle && currentTime > 0 && (
                    <span aria-hidden="true">·</span>
                  )}
                  {currentTime > 0 && (
                    <span className="font-mono tabular-nums shrink-0">
                      {formatMediaTimestamp(currentTime)}
                      {duration > 0 ? ` / ${formatMediaTimestamp(duration)}` : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onOpenStudyTab && (
              <button
                type="button"
                onClick={onOpenStudyTab}
                title="Open in Study Mode tab"
                className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <Maximize2 className="w-3 h-3" />
                <span className="hidden sm:inline">Study Tab</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openExternalUrlSafely(parsed.normalizedUrl)}
              title="Open on YouTube"
              aria-label="Open on YouTube"
              className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title={collapsed ? "Expand player" : "Minimize to mini-bar"}
                aria-label={collapsed ? "Expand player" : "Minimize player"}
                className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                {collapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Close player"
                aria-label="Close player"
                className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Video Frame (kept mounted with h-0 when collapsed so audio/state never reloads) */}
        <div
          className={
            collapsed
              ? "h-0 overflow-hidden opacity-0 pointer-events-none"
              : `w-full bg-black relative aspect-video ${maxHeightClass}`
          }
        >
          <iframe
            ref={iframeRef}
            src={embedSrc}
            title={item.title}
            onLoad={handleIframeLoad}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>

        {/* End-of-Video Completion & Next Prompt (non-destructive) */}
        {ended && (
          <div
            className="px-3 py-2 border-t flex flex-wrap items-center justify-between gap-2 text-xs"
            style={{
              backgroundColor: "var(--accent-soft)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <span
              className="font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Video finished
            </span>
            <div className="flex items-center gap-1.5">
              {onMarkCompleted && item.status !== "done" && (
                <button
                  type="button"
                  onClick={onMarkCompleted}
                  className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-90"
                  style={{
                    backgroundColor: "var(--success)",
                    color: "#ffffff",
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark Completed</span>
                </button>
              )}
              {item.status === "done" && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2"
                  style={{ color: "var(--success)" }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Completed</span>
                </span>
              )}
              {onNextVideo && nextVideoTitle && (
                <button
                  type="button"
                  onClick={onNextVideo}
                  title={`Next: ${nextVideoTitle}`}
                  className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer hover:bg-[var(--bg-surface)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-strong)",
                    color: "var(--text-primary)",
                  }}
                >
                  <span>Next Video</span>
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Controls Bar: Play/Pause, -10s, +10s, Speed, Time, Extra Slot */}
        {!collapsed && (
          <div
            className="px-3 py-1.5 border-t flex flex-wrap items-center justify-between gap-2"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleTogglePlay}
                className="h-7 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-primary)" }}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Play</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => seekToSeconds(latestTimeRef.current - 10, false)}
                title="Skip back 10 seconds"
                aria-label="Skip back 10 seconds"
                className="h-7 px-2 rounded-lg text-xs font-mono tabular-nums inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <RotateCcw className="w-3 h-3" />
                <span>-10s</span>
              </button>

              <button
                type="button"
                onClick={() => seekToSeconds(latestTimeRef.current + 10, false)}
                title="Skip forward 10 seconds"
                aria-label="Skip forward 10 seconds"
                className="h-7 px-2 rounded-lg text-xs font-mono tabular-nums inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>+10s</span>
                <RotateCw className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {onInsertTimestamp && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    onInsertTimestamp(Math.max(0, Math.floor(latestTimeRef.current)))
                  }
                  title="Insert current video timestamp into notes"
                  className="h-7 px-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--accent-soft)",
                    borderColor: "transparent",
                    color: "var(--accent)",
                  }}
                >
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="font-mono tabular-nums">
                    + {formatMediaTimestamp(currentTime)}
                  </span>
                </button>
              )}

              {extraControlSlot}

              <select
                value={playbackRate}
                onChange={(e) => handleChangeSpeed(Number(e.target.value))}
                aria-label="Playback speed"
                title="Playback speed"
                className="h-7 px-2 rounded-lg border text-xs font-mono tabular-nums outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface-subtle)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              >
                {SPEED_OPTIONS.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}x
                  </option>
                ))}
              </select>

              <span
                className="text-[11px] font-mono tabular-nums px-1"
                style={{ color: "var(--text-muted)" }}
              >
                {formatMediaTimestamp(currentTime)}
                {duration > 0 ? ` / ${formatMediaTimestamp(duration)}` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  },
);

CourseYouTubePlayer.displayName = "CourseYouTubePlayer";
