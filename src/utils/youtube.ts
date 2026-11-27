export interface ParsedYouTubeInfo {
  videoId: string;
  normalizedUrl: string;
  thumbnailUrl: string;
  playlistId?: string;
  startSeconds?: number;
}

export interface ParsedYouTubeCourseInfo {
  kind: 'video' | 'playlist';
  videoId: string | null;
  playlistId: string | null;
  startSeconds?: number;
  normalizedUrl: string;
  thumbnailUrl: string;
}

export interface FetchedYouTubeMetadata {
  videoId: string;
  normalizedUrl: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  fetchedOnline: boolean;
}

export interface FetchedYouTubeCourseMetadata {
  kind: 'video' | 'playlist';
  videoId: string | null;
  playlistId: string | null;
  normalizedUrl: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  fetchedOnline: boolean;
}

export function formatMediaTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function parseTimestampParam(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const val = Number(trimmed);
    return Number.isFinite(val) && val > 0 ? val : undefined;
  }
  const hmsMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!hmsMatch) return undefined;
  const hours = Number(hmsMatch[1] || 0);
  const mins = Number(hmsMatch[2] || 0);
  const secs = Number(hmsMatch[3] || 0);
  const total = hours * 3600 + mins * 60 + secs;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

/**
 * Extracts single video / livestream / playlist / timestamp details from any YouTube URL or bare ID.
 */
export function parseYouTubeCourseUrl(input: string): ParsedYouTubeCourseInfo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare 11-character YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return {
      kind: 'video',
      videoId: trimmed,
      playlistId: null,
      normalizedUrl: `https://www.youtube.com/watch?v=${trimmed}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${trimmed}/hqdefault.jpg`,
    };
  }

  let urlObj: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    urlObj = new URL(withProtocol);
  } catch {
    return null;
  }

  const host = urlObj.hostname.replace(/^www\./, '').toLowerCase();
  let videoId: string | null = null;
  const rawListId = urlObj.searchParams.get('list');
  const playlistId =
    rawListId && /^[a-zA-Z0-9_-]{8,}$/.test(rawListId) ? rawListId : null;
  const startSeconds =
    parseTimestampParam(urlObj.searchParams.get('t')) ??
    parseTimestampParam(urlObj.searchParams.get('start'));

  if (host === 'youtu.be') {
    videoId = urlObj.pathname.split('/').filter(Boolean)[0] || null;
  } else if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    if (urlObj.searchParams.get('v')) {
      videoId = urlObj.searchParams.get('v');
    } else {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      const markerIdx = parts.findIndex((p) => ['embed', 'live', 'shorts', 'v'].includes(p));
      if (markerIdx !== -1 && parts[markerIdx + 1]) {
        videoId = parts[markerIdx + 1];
      }
    }
  } else {
    return null;
  }

  const validVideoId = videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;

  if (validVideoId) {
    const normalized = new URL(`https://www.youtube.com/watch?v=${validVideoId}`);
    if (playlistId) normalized.searchParams.set('list', playlistId);
    if (startSeconds) normalized.searchParams.set('t', `${startSeconds}s`);
    return {
      kind: 'video',
      videoId: validVideoId,
      playlistId,
      startSeconds,
      normalizedUrl: normalized.toString(),
      thumbnailUrl: `https://i.ytimg.com/vi/${validVideoId}/hqdefault.jpg`,
    };
  }

  if (playlistId) {
    return {
      kind: 'playlist',
      videoId: null,
      playlistId,
      startSeconds,
      normalizedUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      thumbnailUrl: '',
    };
  }

  return null;
}

/**
 * Extracts an 11-character YouTube video ID from standard watch, youtu.be, live, shorts, embed URLs, or bare IDs.
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeInfo | null {
  const courseParsed = parseYouTubeCourseUrl(input);
  if (!courseParsed || !courseParsed.videoId) return null;
  return {
    videoId: courseParsed.videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${courseParsed.videoId}`,
    thumbnailUrl: courseParsed.thumbnailUrl,
    playlistId: courseParsed.playlistId || undefined,
    startSeconds: courseParsed.startSeconds,
  };
}

/**
 * Auto-fetches YouTube title, channel, and thumbnail via CORS-friendly oEmbed when online,
 * falling back cleanly to deterministic thumbnail + editable placeholder when offline.
 */
export async function fetchYouTubeMetadata(rawUrl: string): Promise<FetchedYouTubeMetadata | null> {
  const parsed = parseYouTubeUrl(rawUrl);
  if (!parsed) return null;

  if (navigator.onLine) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 4500);
      const res = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent(parsed.normalizedUrl)}`,
        { signal: controller.signal }
      );
      window.clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
          error?: string;
        };
        if (!data.error && data.title) {
          return {
            videoId: parsed.videoId,
            normalizedUrl: parsed.normalizedUrl,
            title: data.title.trim(),
            channel: (data.author_name || '').trim(),
            thumbnailUrl: data.thumbnail_url || parsed.thumbnailUrl,
            fetchedOnline: true,
          };
        }
      }
    } catch {
      // Offline or timeout — fall back cleanly
    }
  }

  return {
    videoId: parsed.videoId,
    normalizedUrl: parsed.normalizedUrl,
    title: `YouTube Stream (${parsed.videoId})`,
    channel: '',
    thumbnailUrl: parsed.thumbnailUrl,
    fetchedOnline: false,
  };
}

/**
 * Auto-fetches metadata for any YouTube Course link (single video, livestream, or full playlist).
 */
export async function fetchYouTubeCourseMetadata(
  rawUrl: string
): Promise<FetchedYouTubeCourseMetadata | null> {
  const parsed = parseYouTubeCourseUrl(rawUrl);
  if (!parsed) return null;

  const lookupUrl = parsed.videoId
    ? `https://www.youtube.com/watch?v=${parsed.videoId}`
    : parsed.normalizedUrl;

  if (typeof navigator === 'undefined' || navigator.onLine) {
    const endpoints = [
      `https://noembed.com/embed?url=${encodeURIComponent(lookupUrl)}`,
      `https://www.youtube.com/oembed?url=${encodeURIComponent(lookupUrl)}&format=json`,
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 4500);
        const res = await fetch(endpoint, { signal: controller.signal });
        window.clearTimeout(timer);
        if (res.ok) {
          const data = (await res.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
            error?: string;
          };
          if (!data.error && data.title) {
            return {
              kind: parsed.kind,
              videoId: parsed.videoId,
              playlistId: parsed.playlistId,
              normalizedUrl: parsed.normalizedUrl,
              title: data.title.trim(),
              channel: (data.author_name || '').trim(),
              thumbnailUrl: data.thumbnail_url || parsed.thumbnailUrl,
              fetchedOnline: true,
            };
          }
        }
      } catch {
        // Try fallback endpoint or offline return
      }
    }
  }

  return {
    kind: parsed.kind,
    videoId: parsed.videoId,
    playlistId: parsed.playlistId,
    normalizedUrl: parsed.normalizedUrl,
    title: parsed.videoId
      ? `YouTube Course (${parsed.videoId})`
      : `YouTube Playlist (${parsed.playlistId})`,
    channel: '',
    thumbnailUrl: parsed.thumbnailUrl,
    fetchedOnline: false,
  };
}

/**
 * Embed URL starting UNMUTED by default with YouTube JS API enabled for per-card, global mute, and pause/resume control.
 */
export function buildYouTubeEmbedUrl(videoId: string, cleanControls = false): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
  });
  if (cleanControls) {
    params.set('controls', '0');
    params.set('disablekb', '1');
    params.set('fs', '0');
  }
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    params.set('origin', window.location.origin);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildYouTubeCourseEmbedUrl(options: {
  videoId?: string | null;
  playlistId?: string | null;
  startSeconds?: number;
  autoplay?: boolean;
}): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
  });
  if (options.playlistId) {
    params.set('list', options.playlistId);
    if (!options.videoId) {
      params.set('listType', 'playlist');
    }
  }
  if (options.startSeconds && options.startSeconds >= 1) {
    params.set('start', String(Math.floor(options.startSeconds)));
  }
  if (options.autoplay) {
    params.set('autoplay', '1');
  }
  if (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null') {
    params.set('origin', window.location.origin);
  }
  if (options.videoId) {
    return `https://www.youtube.com/embed/${options.videoId}?${params.toString()}`;
  }
  return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
}

export type YouTubeCommandName =
  | 'mute'
  | 'unMute'
  | 'pauseVideo'
  | 'playVideo'
  | 'setVolume'
  | 'seekTo'
  | 'setPlaybackRate'
  | 'addEventListener';

export function sendYouTubeCommand(
  iframe: HTMLIFrameElement | null,
  func: YouTubeCommandName,
  args: unknown[] = [],
  widgetId?: string
): void {
  if (!iframe || !iframe.contentWindow) return;
  try {
    const payload: Record<string, unknown> = {
      event: 'command',
      func,
      args,
    };
    if (widgetId) {
      payload.id = widgetId;
      payload.channel = 'widget';
    }
    iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
  } catch {
    // Ignore cross-origin postMessage restrictions
  }
}

/**
 * Performs the YouTube IFrame JS API listening handshake so the embed pushes
 * real-time playerState, currentTime, playbackRate, and muted updates via window message events.
 */
export function registerYouTubeListener(iframe: HTMLIFrameElement | null, widgetId: string): void {
  if (!iframe || !iframe.contentWindow) return;
  try {
    iframe.contentWindow.postMessage(
      JSON.stringify({
        event: 'listening',
        id: widgetId,
        channel: 'widget',
      }),
      '*'
    );
    sendYouTubeCommand(iframe, 'addEventListener', ['onStateChange'], widgetId);
    sendYouTubeCommand(iframe, 'addEventListener', ['onPlaybackRateChange'], widgetId);
  } catch {
    // Ignore cross-origin postMessage restrictions
  }
}

export interface ParsedYouTubeMessage {
  event: string;
  id?: string;
  playerState?: number;
  muted?: boolean;
  currentTime?: number;
  duration?: number;
  playbackRate?: number;
}

const YOUTUBE_ORIGINS = new Set([
  'https://www.youtube.com',
  'https://youtube.com',
  'https://www.youtube-nocookie.com',
  'https://youtube-nocookie.com',
]);

/**
 * Safely parses YouTube IFrame API postMessage events (infoDelivery, initialDelivery, onStateChange, onReady).
 */
export function parseYouTubeMessage(event: MessageEvent): ParsedYouTubeMessage | null {
  if (!YOUTUBE_ORIGINS.has(event.origin)) return null;

  let data: unknown = event.data;
  if (typeof data === 'string') {
    if (!data.startsWith('{')) return null;
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const eventName = typeof record.event === 'string' ? record.event : '';
  if (!eventName) return null;
  const id = typeof record.id === 'string' ? record.id : undefined;

  if (eventName === 'onStateChange' && typeof record.info === 'number') {
    return { event: eventName, id, playerState: record.info };
  }

  if (eventName === 'onPlaybackRateChange' && typeof record.info === 'number') {
    return { event: eventName, id, playbackRate: record.info };
  }

  if (
    (eventName === 'infoDelivery' || eventName === 'initialDelivery') &&
    record.info &&
    typeof record.info === 'object'
  ) {
    const info = record.info as Record<string, unknown>;
    const progressState =
      info.progressState && typeof info.progressState === 'object'
        ? (info.progressState as Record<string, unknown>)
        : null;
    const playerState = typeof info.playerState === 'number' ? info.playerState : undefined;
    const muted = typeof info.muted === 'boolean' ? info.muted : undefined;
    const playbackRate =
      typeof info.playbackRate === 'number' && Number.isFinite(info.playbackRate)
        ? info.playbackRate
        : undefined;
    const rawCurrent =
      typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)
        ? info.currentTime
        : progressState &&
            typeof progressState.current === 'number' &&
            Number.isFinite(progressState.current)
          ? progressState.current
          : undefined;
    const rawDuration =
      typeof info.duration === 'number' && Number.isFinite(info.duration)
        ? info.duration
        : progressState &&
            typeof progressState.duration === 'number' &&
            Number.isFinite(progressState.duration)
          ? progressState.duration
          : undefined;
    if (
      playerState !== undefined ||
      muted !== undefined ||
      playbackRate !== undefined ||
      rawCurrent !== undefined ||
      rawDuration !== undefined
    ) {
      return {
        event: eventName,
        id,
        playerState,
        muted,
        playbackRate,
        currentTime: rawCurrent,
        duration: rawDuration,
      };
    }
  }

  if (eventName === 'onReady') {
    return { event: eventName, id };
  }

  return null;
}
