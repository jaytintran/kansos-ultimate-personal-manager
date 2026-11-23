import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  Headphones,
  Loader2,
  Minus,
  MonitorPlay,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { StreamFolder, StreamItem } from '../../types';
import { fetchYouTubeMetadata, parseYouTubeUrl } from '../../utils/youtube';

interface StreamEditorDrawerProps {
  mode: 'create' | 'edit';
  stream: StreamItem | null;
  allStreams: StreamItem[];
  folders: StreamFolder[];
  inGrid: boolean;
  defaultFolderId?: string | null;
  defaultTopic?: string;
  defaultChannel?: string;
  onClose: () => void;
  onCreate: (stream: Omit<StreamItem, 'id' | 'addedAt'>, addToGrid: boolean) => void;
  onUpdate: (id: string, patch: Partial<StreamItem>) => void;
  onDelete: (id: string) => void;
  onToggleInGrid: (id: string) => void;
  onAddFolder: (name: string, parentId?: string | null) => StreamFolder;
  onNotify: (text: string, tone?: 'neutral' | 'success' | 'error') => void;
}

interface FlattenedFolder {
  folder: StreamFolder;
  depth: number;
}

function flattenFolders(folders: StreamFolder[]): FlattenedFolder[] {
  const validIds = new Set(folders.map((f) => f.id));
  const byParent = new Map<string | null, StreamFolder[]>();
  for (const f of folders) {
    const key = f.parentId && validIds.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(key) || [];
    list.push(f);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const out: FlattenedFolder[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) || [];
    for (const child of children) {
      out.push({ folder: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export const StreamEditorDrawer: React.FC<StreamEditorDrawerProps> = ({
  mode,
  stream,
  allStreams,
  folders,
  inGrid,
  defaultFolderId,
  defaultTopic,
  defaultChannel,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onToggleInGrid,
  onAddFolder,
  onNotify,
}) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [category, setCategory] = useState('General');
  const [tagsText, setTagsText] = useState('');
  const [affirmations, setAffirmations] = useState('');
  const [notes, setNotes] = useState('');
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [rating, setRating] = useState<number>(0);
  const [listenCount, setListenCount] = useState<number>(0);
  const [favorite, setFavorite] = useState(false);
  const [addToGridOnSave, setAddToGridOnSave] = useState(true);

  const [fetching, setFetching] = useState(false);
  const [thumbBroken, setThumbBroken] = useState(false);
  const [quickFolderName, setQuickFolderName] = useState('');
  const [showQuickFolder, setShowQuickFolder] = useState(false);

  // Sync form state when switching target stream / mode
  useEffect(() => {
    setThumbBroken(false);
    if (mode === 'edit' && stream) {
      setUrl(stream.url);
      setTitle(stream.title);
      setChannel(stream.channel);
      setCustomLabel(stream.customLabel);
      setCategory(stream.category || 'General');
      setTagsText(stream.tags.join(', '));
      setAffirmations(stream.affirmations ?? '');
      setNotes(stream.notes ?? '');
      setFolderIds(stream.folderIds ?? []);
      setRating(stream.rating ?? 0);
      setListenCount(stream.listenCount ?? 0);
      setFavorite(stream.favorite);
    } else {
      setUrl('');
      setTitle('');
      setChannel(defaultChannel || '');
      setCustomLabel('');
      setCategory(defaultTopic || 'Subliminals');
      setTagsText('');
      setAffirmations('');
      setNotes('');
      setFolderIds(defaultFolderId ? [defaultFolderId] : []);
      setRating(0);
      setListenCount(0);
      setFavorite(false);
      setAddToGridOnSave(true);
    }
  }, [mode, stream, defaultFolderId, defaultTopic, defaultChannel]);

  // Escape closes drawer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const parsedUrl = useMemo(() => parseYouTubeUrl(url), [url]);

  const duplicateStream = useMemo(() => {
    if (!parsedUrl) return null;
    return (
      allStreams.find(
        (s) => s.videoId === parsedUrl.videoId && (mode === 'create' || s.id !== stream?.id)
      ) || null
    );
  }, [parsedUrl, allStreams, mode, stream?.id]);

  const existingTopics = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStreams) {
      const cat = s.category?.trim();
      if (cat) set.add(cat);
    }
    if (set.size === 0) {
      ['Subliminals', 'Frequencies', 'Deep Focus', 'Sleep & Calm'].forEach((t) => set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStreams]);

  const existingChannels = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStreams) {
      if (s.channel.trim()) set.add(s.channel.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allStreams]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of allStreams) {
      for (const t of s.tags) {
        if (t.trim()) set.add(t.trim().toLowerCase());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b)).slice(0, 16);
  }, [allStreams]);

  const currentTagList = useMemo(
    () =>
      tagsText
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    [tagsText]
  );

  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);

  const handleFetchMetadata = async () => {
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      onNotify('Enter a valid YouTube URL or 11-character video ID', 'error');
      return;
    }
    setFetching(true);
    setThumbBroken(false);
    try {
      const meta = await fetchYouTubeMetadata(url);
      if (meta) {
        setTitle(meta.title);
        if (meta.channel) setChannel(meta.channel);
        if (!meta.fetchedOnline) {
          onNotify('Offline mode: edit title & channel manually');
        } else {
          onNotify('Fetched video title & channel', 'success');
        }
      }
    } finally {
      setFetching(false);
    }
  };

  const handleToggleTagSuggestion = (tag: string) => {
    const set = new Set(currentTagList);
    if (set.has(tag)) {
      set.delete(tag);
    } else {
      set.add(tag);
    }
    setTagsText(Array.from(set).join(', '));
  };

  const handleToggleFolder = (fid: string) => {
    setFolderIds((prev) =>
      prev.includes(fid) ? prev.filter((id) => id !== fid) : [...prev, fid]
    );
  };

  const handleQuickCreateFolder = () => {
    const trimmed = quickFolderName.trim();
    if (!trimmed) return;
    const created = onAddFolder(trimmed, null);
    setFolderIds((prev) => [...prev, created.id]);
    setQuickFolderName('');
    setShowQuickFolder(false);
  };

  const handleCopyUrl = async () => {
    const target = parsedUrl?.normalizedUrl || url.trim();
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target);
      onNotify('YouTube URL copied', 'success');
    } catch {
      onNotify('Could not copy URL', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      onNotify('Paste a valid YouTube URL (watch, youtu.be, live, shorts, or ID)', 'error');
      return;
    }

    let resolvedTitle = title.trim();
    let resolvedChannel = channel.trim();
    let resolvedThumb = parsed.thumbnailUrl;

    if (!resolvedTitle) {
      setFetching(true);
      try {
        const meta = await fetchYouTubeMetadata(url);
        if (meta) {
          resolvedTitle = meta.title;
          resolvedChannel = resolvedChannel || meta.channel;
          resolvedThumb = meta.thumbnailUrl;
        }
      } finally {
        setFetching(false);
      }
    }

    const cleanedTags = Array.from(
      new Set(
        tagsText
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (mode === 'create') {
      onCreate(
        {
          url: parsed.normalizedUrl,
          videoId: parsed.videoId,
          title: resolvedTitle || `YouTube Stream (${parsed.videoId})`,
          channel: resolvedChannel,
          customLabel: customLabel.trim(),
          thumbnailUrl: resolvedThumb,
          category: category.trim() || 'General',
          tags: cleanedTags,
          favorite,
          notes: notes.trim(),
          affirmations: affirmations.trim(),
          folderIds,
          rating,
          listenCount,
          lastListenedAt: addToGridOnSave ? new Date().toISOString() : null,
        },
        addToGridOnSave
      );
      onClose();
      return;
    }

    if (stream) {
      onUpdate(stream.id, {
        url: parsed.normalizedUrl,
        videoId: parsed.videoId,
        thumbnailUrl: parsed.thumbnailUrl,
        title: resolvedTitle || stream.title,
        channel: resolvedChannel,
        customLabel: customLabel.trim(),
        category: category.trim() || 'General',
        tags: cleanedTags,
        favorite,
        notes: notes.trim(),
        affirmations: affirmations.trim(),
        folderIds,
        rating,
        listenCount: Math.max(0, listenCount),
      });
      onNotify('Saved stream details', 'success');
      onClose();
    }
  };

  const previewThumb = parsedUrl?.thumbnailUrl || stream?.thumbnailUrl || '';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'create' ? 'Add URL to Vault' : 'Edit Stream Metadata'}
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-lg h-full border-l flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold truncate">
              {mode === 'create' ? 'Save URL to Vault' : 'Stream Details & Notes'}
            </h2>
            <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {mode === 'create'
                ? 'Paste any YouTube link, assign stacks, and log affirmations.'
                : stream?.channel || 'YouTube stream metadata'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setFavorite((prev) => !prev)}
              className="h-8 w-8 rounded-lg border flex items-center justify-center transition-colors"
              style={{
                backgroundColor: favorite ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                borderColor: favorite ? 'var(--warning)' : 'var(--border-subtle)',
                color: favorite ? 'var(--warning)' : 'var(--text-muted)',
              }}
              title={favorite ? 'Remove from favorites' : 'Mark as favorite'}
              aria-label={favorite ? 'Remove from favorites' : 'Mark as favorite'}
            >
              <Star className={`w-4 h-4 ${favorite ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg border flex items-center justify-center"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <form id="stream-editor-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Thumbnail Preview + URL Input */}
          <div className="space-y-2.5">
            {previewThumb && (
              <div
                className="relative aspect-video w-full rounded-xl overflow-hidden border"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                {!thumbBroken ? (
                  <img
                    src={previewThumb}
                    alt={customLabel || title || 'YouTube preview'}
                    referrerPolicy="no-referrer"
                    onError={() => setThumbBroken(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex flex-col items-center justify-center gap-1.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <MonitorPlay className="w-6 h-6" />
                    <span className="text-xs font-medium">Preview unavailable</span>
                  </div>
                )}

                {parsedUrl && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="h-7 px-2.5 rounded-lg bg-black/70 text-white text-[11px] font-medium inline-flex items-center gap-1 hover:bg-black/85"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy URL</span>
                    </button>
                    <a
                      href={parsedUrl.normalizedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 px-2.5 rounded-lg bg-black/70 text-white text-[11px] font-medium inline-flex items-center gap-1 hover:bg-black/85"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>YouTube</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                YouTube URL or Video ID
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setThumbBroken(false);
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  autoFocus={mode === 'create'}
                  className="flex-1 min-w-0 h-9 px-3 rounded-lg border text-xs font-mono outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  disabled={fetching || !url.trim()}
                  onClick={handleFetchMetadata}
                  className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {fetching ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  <span>Fetch</span>
                </button>
              </div>
              {duplicateStream && (
                <p className="text-[11px]" style={{ color: 'var(--warning)' }}>
                  Already saved in Vault as &ldquo;{duplicateStream.customLabel || duplicateStream.title}&rdquo;.
                </p>
              )}
            </div>
          </div>

          {/* Identity Fields */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-fetched on save"
                  className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                  Custom Short Label
                </label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. 528Hz Deep Clarity"
                  className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Channel / Creator
              </label>
              <input
                type="text"
                list="vault-channel-suggestions"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="e.g. Quadible Integrity, Moza Morph"
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <datalist id="vault-channel-suggestions">
                {existingChannels.map((ch) => (
                  <option key={ch} value={ch} />
                ))}
              </datalist>
            </div>

            {/* Topic / Theme - Full-width row right above Tags with clickable topic chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Topic / Theme
              </label>
              <input
                type="text"
                list="vault-topic-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Abundance, Confidence, Sleep"
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <datalist id="vault-topic-suggestions">
                {existingTopics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              {existingTopics.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {existingTopics.map((top) => {
                    const active = category.trim().toLowerCase() === top.toLowerCase();
                    return (
                      <button
                        key={top}
                        type="button"
                        onClick={() => setCategory(top)}
                        className="h-6 px-2 rounded-md border text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        {top}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Multi-Tags */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="528hz, silent, overnight, booster, binaural"
                className="w-full h-9 px-3 rounded-lg border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              {existingTags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {existingTags.map((tag) => {
                    const active = currentTagList.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTagSuggestion(tag)}
                        className="h-6 px-2 rounded-md border text-[11px] font-medium transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                          color: active ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Folders & Listening Stacks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Folders & Listening Stacks
              </label>
              <button
                type="button"
                onClick={() => setShowQuickFolder((prev) => !prev)}
                className="text-[11px] font-medium inline-flex items-center gap-1"
                style={{ color: 'var(--accent)' }}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>New folder</span>
              </button>
            </div>

            {showQuickFolder && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={quickFolderName}
                  onChange={(e) => setQuickFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleQuickCreateFolder();
                    }
                  }}
                  placeholder="Folder name..."
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--accent)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleQuickCreateFolder}
                  className="h-8 px-2.5 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  Add
                </button>
              </div>
            )}

            <div
              className="rounded-xl border divide-y max-h-40 overflow-y-auto"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {flatFolders.length === 0 ? (
                <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  No folders yet. Create one above to organize listening stacks.
                </div>
              ) : (
                flatFolders.map(({ folder, depth }) => {
                  const checked = folderIds.includes(folder.id);
                  return (
                    <label
                      key={folder.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:opacity-90"
                      style={{
                        paddingLeft: `${12 + depth * 16}px`,
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleFolder(folder.id)}
                        className="rounded"
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                      <span className="truncate font-medium">{folder.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Rating & Listen Count Tracking */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Personal Rating
                </span>
                {rating > 0 && (
                  <button
                    type="button"
                    onClick={() => setRating(0)}
                    className="text-[11px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(rating === star ? 0 : star)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      color: star <= rating ? 'var(--warning)' : 'var(--text-muted)',
                      backgroundColor:
                        star <= rating ? 'var(--bg-surface)' : 'transparent',
                    }}
                    aria-label={`Rate ${star} out of 5`}
                  >
                    <Star className={`w-4 h-4 ${star <= rating ? 'fill-current' : ''}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
                Listen Count
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setListenCount((c) => Math.max(0, c - 1))}
                  className="h-8 w-8 rounded-lg border flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  aria-label="Decrease listen count"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <div
                  className="flex-1 h-8 px-2.5 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-mono tabular-nums font-semibold"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <Headphones className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  <span>{listenCount}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setListenCount((c) => c + 1)}
                  className="h-8 w-8 rounded-lg border flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--accent)',
                  }}
                  aria-label="Increment listen count"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Affirmations & Benefits */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
              Affirmations & Benefits
            </label>
            <textarea
              rows={4}
              value={affirmations}
              onChange={(e) => setAffirmations(e.target.value)}
              placeholder="Paste listed affirmations, key benefits, formulas, or creator description..."
              className="w-full px-3 py-2 rounded-lg border text-xs leading-relaxed outline-none resize-y"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {/* Listening Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>
              Listening Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Personal results, pairing ideas, volume level, or listening schedule notes..."
              className="w-full px-3 py-2 rounded-lg border text-xs leading-relaxed outline-none resize-y"
              style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {mode === 'create' && (
            <label
              className="flex items-center gap-2 text-xs cursor-pointer select-none"
              style={{ color: 'var(--text-secondary)' }}
            >
              <input
                type="checkbox"
                checked={addToGridOnSave}
                onChange={(e) => setAddToGridOnSave(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Add immediately to Live Grid after saving</span>
            </label>
          )}
        </form>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex items-center justify-between gap-2 shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-1.5">
            {mode === 'edit' && stream && (
              <>
                <button
                  type="button"
                  onClick={() => onToggleInGrid(stream.id)}
                  className="h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  style={{
                    backgroundColor: inGrid ? 'var(--accent-soft)' : 'var(--bg-surface-subtle)',
                    borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
                    color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  {inGrid ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{inGrid ? 'In Grid' : 'Add to Grid'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(stream.id);
                    onClose();
                  }}
                  className="h-9 w-9 rounded-lg border flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--danger)',
                  }}
                  title="Delete from vault"
                  aria-label="Delete stream from vault"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg border text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="stream-editor-form"
              disabled={fetching || !url.trim()}
              className="h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-45"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              {fetching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{mode === 'create' ? 'Save URL' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
