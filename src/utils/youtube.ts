export interface ParsedYouTubeInfo {
  videoId: string;
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

/**
 * Extracts an 11-character YouTube video ID from standard watch, youtu.be, live, shorts, embed URLs, or bare IDs.
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeInfo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare 11-character YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return {
      videoId: trimmed,
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
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return null;
  }

  return {
    videoId,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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
 * real-time playerState and muted updates via window message events.
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
  } catch {
    // Ignore cross-origin postMessage restrictions
  }
}

export interface ParsedYouTubeMessage {
  event: string;
  playerState?: number;
  muted?: boolean;
  currentTime?: number;
  duration?: number;
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

  if (eventName === 'onStateChange' && typeof record.info === 'number') {
    return { event: eventName, playerState: record.info };
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
      rawCurrent !== undefined ||
      rawDuration !== undefined
    ) {
      return {
        event: eventName,
        playerState,
        muted,
        currentTime: rawCurrent,
        duration: rawDuration,
      };
    }
  }

  if (eventName === 'onReady') {
    return { event: eventName };
  }

  return null;
}

