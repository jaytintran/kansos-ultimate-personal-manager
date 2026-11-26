import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckSquare,
  ChevronRight,
  GitMerge,
  GripVertical,
  Headphones,
  MonitorPlay,
  Palette,
  Pencil,
  Pin,
  Play,
  Plus,
  Star,
  Tag,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import type { ChannelPointerDropTarget } from '../../hooks/useVaultChannelDrag';
import type { VaultPointerDropTarget } from '../../hooks/useVaultStreamDrag';
import type { StreamChannelMeta, StreamItem } from '../../types';
import { DynamicIcon } from '../IconLibrary';

export type ChannelsViewMode = 'carousels' | 'directory' | 'split';
export type ChannelsSortMode =
  | 'custom'
  | 'count-desc'
  | 'count-asc'
  | 'listens'
  | 'recent'
  | 'title-asc'
  | 'title-desc';

export interface ChannelSummaryEntry {
  name: string;
  streams: StreamItem[];
  totalListens: number;
  latestAddedAt: string;
  favTopIds: string[];
  previewThumbnails: { id: string; url: string }[];
  meta: StreamChannelMeta;
}

interface StreamChannelsOverviewProps {
  channels: ChannelSummaryEntry[];
  viewMode: ChannelsViewMode;
  isCustomChannelSort: boolean;
  isCustomStreamSort: boolean;
  searchQuery: string;
  activeIdSet: Set<string>;
  bulkMode: boolean;
  selectedStreamIds: Set<string>;
  channelBulkMode: boolean;
  selectedChannelNames: Set<string>;
  brokenThumbs: Record<string, boolean>;
  onBrokenThumb: (streamId: string) => void;
  activeStreamDropTarget: VaultPointerDropTarget | null;
  activeDragStreamIds: Set<string>;
  onStreamPointerDown: (streamId: string, e: React.PointerEvent) => void;
  shouldSuppressStreamClick: () => boolean;
  draggingChannelName: string | null;
  activeChannelDropTarget: ChannelPointerDropTarget | null;
  onChannelPointerDown: (
    channelName: string,
    streamCount: number,
    pinned: boolean,
    e: React.PointerEvent,
  ) => void;
  shouldSuppressChannelClick: () => boolean;
  splitListScrollRef?: React.RefObject<HTMLDivElement | null>;
  onToggleSelectStream: (streamId: string) => void;
  onToggleSelectChannel: (channelName: string) => void;
  onSelectAllChannels: () => void;
  onClearChannelSelection: () => void;
  onCloseChannelBulkMode: () => void;
  onBulkMergeSelectedChannels: () => void;
  onBulkBatchEditChannels: () => void;
  onBulkTogglePinChannels: () => void;
  onBulkLoadSelectedChannels: () => void;
  onBulkDeleteSelectedChannels: () => void;
  onOpenChannel: (channelName: string) => void;
  onEditStream: (streamId: string) => void;
  onAddStreamInChannel: (channelName: string, defaultTopic?: string) => void;
  onStackStream: (streamId: string) => void;
  onToggleStreamInGrid: (streamId: string) => void;
  onUpdateStream: (streamId: string, patch: Partial<StreamItem>) => void;
  onIncrementListen: (streamId: string) => void;
  onLoadStreamsToGrid: (
    streamIds: string[],
    mode: 'replace' | 'append',
    label: string,
  ) => void;
  onTogglePinChannel: (channelName: string) => void;
  onRequestRenameChannel: (fromName: string, newName: string) => void;
  onOpenChannelSettings: (channelName: string) => void;
  onOpenChannelBatchEdit: (channelName: string) => void;
  onOpenChannelDelete: (channelName: string) => void;
}

export const StreamChannelsOverview: React.FC<StreamChannelsOverviewProps> = ({
  channels,
  viewMode,
  isCustomChannelSort,
  isCustomStreamSort,
  searchQuery,
  activeIdSet,
  bulkMode,
  selectedStreamIds,
  channelBulkMode,
  selectedChannelNames,
  brokenThumbs,
  onBrokenThumb,
  activeStreamDropTarget,
  activeDragStreamIds,
  onStreamPointerDown,
  shouldSuppressStreamClick,
  draggingChannelName,
  activeChannelDropTarget,
  onChannelPointerDown,
  shouldSuppressChannelClick,
  splitListScrollRef,
  onToggleSelectStream,
  onToggleSelectChannel,
  onSelectAllChannels,
  onClearChannelSelection,
  onCloseChannelBulkMode,
  onBulkMergeSelectedChannels,
  onBulkBatchEditChannels,
  onBulkTogglePinChannels,
  onBulkLoadSelectedChannels,
  onBulkDeleteSelectedChannels,
  onOpenChannel,
  onEditStream,
  onAddStreamInChannel,
  onStackStream,
  onToggleStreamInGrid,
  onUpdateStream,
  onIncrementListen,
  onLoadStreamsToGrid,
  onTogglePinChannel,
  onRequestRenameChannel,
  onOpenChannelSettings,
  onOpenChannelBatchEdit,
  onOpenChannelDelete,
}) => {
  const [renamingChannel, setRenamingChannel] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [selectedSplitChannel, setSelectedSplitChannel] = useState<string | null>(
    () => channels[0]?.name ?? null,
  );
  const directoryGridRef = useRef<HTMLDivElement | null>(null);

  // Keep split selection valid when channels list changes (search, rename, delete)
  useEffect(() => {
    if (channels.length === 0) {
      setSelectedSplitChannel(null);
      return;
    }
    if (!selectedSplitChannel || !channels.some((c) => c.name === selectedSplitChannel)) {
      setSelectedSplitChannel(channels[0].name);
    }
  }, [channels, selectedSplitChannel]);

  const pinnedChannels = useMemo(
    () => channels.filter((c) => Boolean(c.meta.pinned)),
    [channels],
  );
  const unpinnedChannels = useMemo(
    () => channels.filter((c) => !c.meta.pinned),
    [channels],
  );
  const hasPinnedSplit = pinnedChannels.length > 0 && unpinnedChannels.length > 0;

  const startInlineRename = (channelName: string) => {
    setRenamingChannel(channelName);
    setRenameDraft(channelName === 'Unknown Channel' ? '' : channelName);
  };

  const commitInlineRename = (fromName: string) => {
    const trimmed = renameDraft.trim();
    const resolvedTarget = trimmed || 'Unknown Channel';
    setRenamingChannel(null);
    if (resolvedTarget === fromName) return;
    onRequestRenameChannel(fromName, resolvedTarget);
  };

  const cancelInlineRename = () => {
    setRenamingChannel(null);
    setRenameDraft('');
  };

  const isSingleDirectoryColumn = () => {
    const grid = directoryGridRef.current;
    if (grid) {
      const cols = getComputedStyle(grid)
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length;
      if (cols > 0) return cols === 1;
    }
    return typeof window !== 'undefined' ? window.innerWidth < 640 : false;
  };

  const renderChannelIcon = (ch: ChannelSummaryEntry, sizeClass = 'w-4 h-4') => {
    const iconColor = ch.meta.color || 'var(--accent)';
    if (ch.meta.icon) {
      return (
        <DynamicIcon
          name={ch.meta.icon}
          className={`${sizeClass} shrink-0`}
          style={{ color: iconColor }}
        />
      );
    }
    return <Tv className={`${sizeClass} shrink-0`} style={{ color: iconColor }} />;
  };

  if (channels.length === 0) {
    return (
      <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
        <div
          className="w-11 h-11 rounded-xl border flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <Tv className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-display text-sm font-bold">No channels found</h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {searchQuery
              ? 'No channels or tracks match your search query.'
              : 'Save streams with creator channels to organize them here.'}
          </p>
        </div>
      </div>
    );
  }

  /* --------------------------------------------------------------------------
     SHARED HEADER ACTIONS RENDERER (Carousels + Split Right Header)
     -------------------------------------------------------------------------- */
  const renderChannelManagementButtons = (
    ch: ChannelSummaryEntry,
    options?: { showOpenFull?: boolean; showAddUrl?: boolean },
  ) => {
    const isPinned = Boolean(ch.meta.pinned);
    return (
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap" data-no-channel-drag="true">
        <div
          className="inline-flex items-center rounded-lg border overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() =>
              onLoadStreamsToGrid(
                ch.streams.map((s) => s.id),
                'replace',
                ch.name,
              )
            }
            className="h-7 px-2.5 text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            title={`Replace Live Grid with ${ch.name}`}
          >
            <Play className="w-3 h-3 fill-current" style={{ color: 'var(--accent)' }} />
            <span>Load Stack</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onLoadStreamsToGrid(
                ch.streams.map((s) => s.id),
                'append',
                ch.name,
              )
            }
            className="h-7 px-2 border-l text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title={`Layer ${ch.name} onto Live Grid`}
          >
            <Plus className="w-3 h-3" />
            <span>Layer</span>
          </button>
          {ch.favTopIds.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onLoadStreamsToGrid(
                  ch.favTopIds,
                  'replace',
                  `${ch.name} · Favorites & Top`,
                )
              }
              className="h-7 px-2 border-l text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--warning)',
              }}
              title={`Load ${ch.favTopIds.length} favorite or top-rated (4–5★) streams from ${ch.name}`}
            >
              <Star className="w-3 h-3 fill-current" />
              <span>Favs ({ch.favTopIds.length})</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onTogglePinChannel(ch.name)}
          className="h-7 w-7 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{
            backgroundColor: isPinned ? 'var(--accent-soft)' : 'var(--bg-surface)',
            borderColor: isPinned ? 'var(--accent)' : 'var(--border-subtle)',
            color: isPinned ? 'var(--accent)' : 'var(--text-muted)',
          }}
          title={isPinned ? 'Unpin channel' : 'Pin channel to top'}
          aria-label={isPinned ? `Unpin ${ch.name}` : `Pin ${ch.name}`}
        >
          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onOpenChannelBatchEdit(ch.name)}
          className="h-7 w-7 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          title={`Batch edit topic & tags for ${ch.name}`}
          aria-label={`Batch edit topic and tags for ${ch.name}`}
        >
          <Tag className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onOpenChannelSettings(ch.name)}
          className="h-7 w-7 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          title={`Customize icon, color & default topic for ${ch.name}`}
          aria-label={`Customize ${ch.name}`}
        >
          <Palette className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onOpenChannelDelete(ch.name)}
          className="h-7 w-7 rounded-lg border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--danger)',
          }}
          title={`Delete ${ch.name} and its streams`}
          aria-label={`Delete ${ch.name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {options?.showAddUrl && (
          <button
            type="button"
            onClick={() => onAddStreamInChannel(ch.name, ch.meta.defaultTopic)}
            className="h-7 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            <Plus className="w-3 h-3" />
            <span>Add URL</span>
          </button>
        )}

        {options?.showOpenFull && (
          <button
            type="button"
            onClick={() => onOpenChannel(ch.name)}
            className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
            title={`Open dedicated ${ch.name} Vault view`}
          >
            <span>View All</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  };

  /* --------------------------------------------------------------------------
     VIEW MODE 1: HORIZONTAL CAROUSELS
     -------------------------------------------------------------------------- */
  const renderCarouselSection = (ch: ChannelSummaryEntry) => {
    const isRenaming = renamingChannel === ch.name;
    const isChannelSelected = selectedChannelNames.has(ch.name);
    const isDraggingThisChannel = draggingChannelName === ch.name;
    const channelDropTarget =
      activeChannelDropTarget?.channelName === ch.name ? activeChannelDropTarget : null;

    return (
      <section
        key={ch.name}
        data-channel-reorder-id={ch.name}
        data-channel-reorder-axis="y"
        data-channel-pinned={ch.meta.pinned ? 'true' : 'false'}
        onPointerDown={(e) =>
          onChannelPointerDown(ch.name, ch.streams.length, Boolean(ch.meta.pinned), e)
        }
        className={`relative space-y-2.5 rounded-xl transition-opacity ${
          isDraggingThisChannel ? 'opacity-45' : ''
        }`}
      >
        {channelDropTarget && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-1 h-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
              channelDropTarget.position === 'before' ? '-top-2' : '-bottom-2'
            }`}
          />
        )}

        {/* Channel Row Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isCustomChannelSort && (
              <div
                data-channel-drag-handle="true"
                title="Drag to reorder channel"
                aria-label={`Drag to reorder ${ch.name}`}
                className="w-6 h-6 -ml-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] cursor-grab active:cursor-grabbing shrink-0"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
            )}

            {(channelBulkMode || isChannelSelected) && (
              <button
                type="button"
                data-no-channel-drag="true"
                onClick={() => onToggleSelectChannel(ch.name)}
                className="w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 cursor-pointer"
                style={{
                  backgroundColor: isChannelSelected ? 'var(--accent)' : 'var(--bg-surface)',
                  borderColor: isChannelSelected ? 'var(--accent)' : 'var(--border-strong)',
                  color: 'var(--accent-fg)',
                }}
                aria-label={`Select channel ${ch.name}`}
              >
                {isChannelSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </button>
            )}

            {isRenaming ? (
              <form
                data-no-channel-drag="true"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitInlineRename(ch.name);
                }}
                className="flex items-center gap-1.5 min-w-[200px] max-w-sm flex-1"
              >
                {renderChannelIcon(ch)}
                <input
                  type="text"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      cancelInlineRename();
                    }
                  }}
                  placeholder="Channel name (empty = Unknown Channel)"
                  className="flex-1 min-w-0 h-7 px-2.5 rounded-lg border text-xs font-medium outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--accent)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-fg)',
                  }}
                  aria-label="Save channel rename"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineRename}
                  className="h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                  aria-label="Cancel channel rename"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  data-no-channel-drag="true"
                  onClick={() => {
                    if (shouldSuppressChannelClick()) return;
                    onOpenChannel(ch.name);
                  }}
                  className="font-display text-sm font-bold hover:underline truncate text-left inline-flex items-center gap-1.5 cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                  title={`Open dedicated view for ${ch.name}`}
                >
                  {renderChannelIcon(ch)}
                  <span className="truncate">{ch.name}</span>
                </button>

                <button
                  type="button"
                  data-no-channel-drag="true"
                  onClick={() => startInlineRename(ch.name)}
                  className="h-6 w-6 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  title={`Rename ${ch.name}`}
                  aria-label={`Rename ${ch.name}`}
                >
                  <Pencil className="w-3 h-3" />
                </button>

                <span
                  className="text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  · {ch.streams.length} {ch.streams.length === 1 ? 'stream' : 'streams'}
                  {ch.meta.defaultTopic ? ` · Default: ${ch.meta.defaultTopic}` : ''}
                </span>
              </div>
            )}
          </div>

          {renderChannelManagementButtons(ch, { showOpenFull: true })}
        </div>

        {/* Horizontal scrollable carousel supporting in-channel stream drag reorder */}
        <div
          data-no-channel-drag="true"
          className="overflow-x-auto flex gap-3.5 pb-2.5 pt-0.5 scrollbar-none"
        >
          {ch.streams.map((item) => {
            const inGrid = activeIdSet.has(item.id);
            const isSelected = selectedStreamIds.has(item.id);
            const isBeingDragged = activeDragStreamIds.has(item.id);
            const reorderTarget =
              activeStreamDropTarget?.kind === 'stream-reorder' &&
              activeStreamDropTarget.streamId === item.id
                ? activeStreamDropTarget
                : null;

            return (
              <div
                key={item.id}
                data-vault-reorder-id={item.id}
                data-vault-reorder-axis="x"
                onPointerDown={(e) => onStreamPointerDown(item.id, e)}
                className={`relative w-64 shrink-0 rounded-xl border flex flex-col transition-all duration-150 ${
                  isBeingDragged ? 'opacity-45 scale-[0.98]' : ''
                } ${isSelected ? 'ring-2 ring-[var(--accent)]' : ''} ${
                  reorderTarget ? 'ring-1 ring-[var(--accent)]/60' : ''
                }`}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: reorderTarget
                    ? 'var(--accent)'
                    : isSelected || inGrid
                      ? 'var(--accent)'
                      : 'var(--border-subtle)',
                }}
              >
                {reorderTarget && (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                      reorderTarget.position === 'before' ? '-left-2' : '-right-2'
                    }`}
                  />
                )}

                <div className="rounded-[11px] overflow-hidden flex-1 flex flex-col">
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-[var(--bg-surface-subtle)]">
                    <button
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onClick={() => {
                        if (shouldSuppressStreamClick()) return;
                        if (bulkMode) {
                          onToggleSelectStream(item.id);
                        } else {
                          onEditStream(item.id);
                        }
                      }}
                      className="w-full h-full text-left group select-none"
                    >
                      {!brokenThumbs[item.id] ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.customLabel || item.title}
                          draggable={false}
                          referrerPolicy="no-referrer"
                          onError={() => onBrokenThumb(item.id)}
                          className="w-full h-full object-cover pointer-events-none select-none"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] pointer-events-none">
                          <MonitorPlay className="w-6 h-6" />
                        </div>
                      )}
                    </button>

                    {(bulkMode || isSelected) && (
                      <button
                        type="button"
                        data-no-stream-drag="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelectStream(item.id);
                        }}
                        className="absolute top-2 left-2 w-5 h-5 rounded-md border flex items-center justify-center z-20 shadow-md cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                          borderColor: isSelected ? 'var(--accent)' : 'var(--border-strong)',
                          color: 'var(--accent-fg)',
                        }}
                        aria-label="Select stream"
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    )}

                    {inGrid && !bulkMode && !isSelected && (
                      <span
                        className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-tight pointer-events-none"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }}
                      >
                        Stacked
                      </span>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      {isCustomStreamSort && (
                        <div
                          aria-hidden="true"
                          title="Drag to reorder stream"
                          className="w-5 h-5 -ml-1 flex items-center justify-center rounded text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (shouldSuppressStreamClick()) return;
                            if (bulkMode) {
                              onToggleSelectStream(item.id);
                            } else {
                              onEditStream(item.id);
                            }
                          }}
                          className="text-left w-full"
                        >
                          <h4 className="text-xs font-semibold leading-snug line-clamp-2">
                            {item.customLabel || item.title}
                          </h4>
                        </button>
                        <p
                          className="text-[11px] truncate mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {item.category || 'General'}
                        </p>
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between gap-1 pt-1.5 border-t"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <button
                        type="button"
                        data-no-stream-drag="true"
                        onClick={() => onStackStream(item.id)}
                        className="h-6 px-2 rounded-md border text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        style={{
                          backgroundColor: inGrid
                            ? 'var(--accent-soft)'
                            : 'var(--bg-surface-subtle)',
                          borderColor: inGrid ? 'var(--accent)' : 'var(--border-subtle)',
                          color: inGrid ? 'var(--accent)' : 'var(--text-primary)',
                        }}
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>{inGrid ? 'Layer' : 'Stack'}</span>
                      </button>

                      <button
                        type="button"
                        data-no-stream-drag="true"
                        onClick={() =>
                          onUpdateStream(item.id, { favorite: !item.favorite })
                        }
                        className="h-6 w-6 rounded-md flex items-center justify-center cursor-pointer"
                        style={{
                          color: item.favorite ? 'var(--warning)' : 'var(--text-muted)',
                        }}
                        aria-label={item.favorite ? 'Unfavorite' : 'Favorite'}
                      >
                        <Star
                          className={`w-3 h-3 ${item.favorite ? 'fill-current' : ''}`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  /* --------------------------------------------------------------------------
     VIEW MODE 2: DIRECTORY CARDS GRID
     -------------------------------------------------------------------------- */
  const renderDirectoryCard = (ch: ChannelSummaryEntry) => {
    const isRenaming = renamingChannel === ch.name;
    const isChannelSelected = selectedChannelNames.has(ch.name);
    const isPinned = Boolean(ch.meta.pinned);
    const isDraggingThisChannel = draggingChannelName === ch.name;
    const channelDropTarget =
      activeChannelDropTarget?.channelName === ch.name ? activeChannelDropTarget : null;
    const singleCol = isSingleDirectoryColumn();
    const validThumbs = ch.previewThumbnails.filter((t) => !brokenThumbs[t.id]).slice(0, 4);

    return (
      <article
        key={ch.name}
        data-channel-reorder-id={ch.name}
        data-channel-reorder-axis={singleCol ? 'y' : 'x'}
        data-channel-pinned={isPinned ? 'true' : 'false'}
        onPointerDown={(e) =>
          onChannelPointerDown(ch.name, ch.streams.length, isPinned, e)
        }
        className={`relative rounded-xl border flex flex-col transition-all duration-150 ${
          isDraggingThisChannel ? 'opacity-45 scale-[0.98]' : ''
        } ${isChannelSelected ? 'ring-2 ring-[var(--accent)]' : ''} ${
          channelDropTarget ? 'ring-1 ring-[var(--accent)]/60' : ''
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor:
            channelDropTarget || isChannelSelected
              ? 'var(--accent)'
              : 'var(--border-subtle)',
        }}
      >
        {channelDropTarget && (
          <div
            aria-hidden="true"
            className={
              singleCol
                ? `pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                    channelDropTarget.position === 'before' ? '-top-1.5' : '-bottom-1.5'
                  }`
                : `pointer-events-none absolute top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)] z-20 ${
                    channelDropTarget.position === 'before' ? '-left-1.5' : '-right-1.5'
                  }`
            }
          />
        )}

        <div className="rounded-[11px] overflow-hidden flex-1 flex flex-col">
          {/* Preview Thumbnails Collage (clicking opens Single-Channel Vault view) */}
          <div className="relative aspect-video w-full bg-[var(--bg-surface-subtle)] overflow-hidden">
            <button
              type="button"
              data-no-channel-drag="true"
              onClick={() => {
                if (shouldSuppressChannelClick()) return;
                if (channelBulkMode) {
                  onToggleSelectChannel(ch.name);
                  return;
                }
                onOpenChannel(ch.name);
              }}
              className="w-full h-full block text-left cursor-pointer"
              title={`Open ${ch.name}`}
            >
              {validThumbs.length >= 4 ? (
                <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-[var(--bg-canvas)]">
                  {validThumbs.map((t) => (
                    <img
                      key={t.id}
                      src={t.url}
                      alt={ch.name}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onError={() => onBrokenThumb(t.id)}
                      className="w-full h-full object-cover pointer-events-none select-none"
                    />
                  ))}
                </div>
              ) : validThumbs.length >= 2 ? (
                <div className="grid grid-cols-2 w-full h-full gap-0.5 bg-[var(--bg-canvas)]">
                  {validThumbs.slice(0, 2).map((t) => (
                    <img
                      key={t.id}
                      src={t.url}
                      alt={ch.name}
                      draggable={false}
                      referrerPolicy="no-referrer"
                      onError={() => onBrokenThumb(t.id)}
                      className="w-full h-full object-cover pointer-events-none select-none"
                    />
                  ))}
                </div>
              ) : validThumbs.length === 1 ? (
                <img
                  src={validThumbs[0].url}
                  alt={ch.name}
                  draggable={false}
                  referrerPolicy="no-referrer"
                  onError={() => onBrokenThumb(validThumbs[0].id)}
                  className="w-full h-full object-cover pointer-events-none select-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {renderChannelIcon(ch, 'w-8 h-8')}
                </div>
              )}
            </button>

            {(channelBulkMode || isChannelSelected) && (
              <button
                type="button"
                data-no-channel-drag="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelectChannel(ch.name);
                }}
                className="absolute top-2 left-2 w-5 h-5 rounded-md border flex items-center justify-center z-10 shadow cursor-pointer"
                style={{
                  backgroundColor: isChannelSelected ? 'var(--accent)' : 'var(--bg-surface)',
                  borderColor: isChannelSelected ? 'var(--accent)' : 'var(--border-strong)',
                  color: 'var(--accent-fg)',
                }}
                aria-label={`Select channel ${ch.name}`}
              >
                {isChannelSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </button>
            )}

            <button
              type="button"
              data-no-channel-drag="true"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePinChannel(ch.name);
              }}
              className="absolute top-2 right-2 w-7 h-7 rounded-lg border flex items-center justify-center z-10 shadow-sm cursor-pointer"
              style={{
                backgroundColor: isPinned ? 'var(--accent)' : 'var(--bg-elevated)',
                borderColor: isPinned ? 'var(--accent)' : 'var(--border-strong)',
                color: isPinned ? 'var(--accent-fg)' : 'var(--text-muted)',
              }}
              title={isPinned ? 'Unpin channel' : 'Pin channel to top'}
              aria-label={isPinned ? `Unpin ${ch.name}` : `Pin ${ch.name}`}
            >
              <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Directory Card Body */}
          <div className="p-3.5 flex-1 flex flex-col gap-2">
            {isRenaming ? (
              <form
                data-no-channel-drag="true"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitInlineRename(ch.name);
                }}
                className="flex items-center gap-1"
              >
                <input
                  type="text"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      cancelInlineRename();
                    }
                  }}
                  placeholder="Channel name"
                  className="flex-1 min-w-0 h-7 px-2 rounded-md border text-xs font-medium outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--accent)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                  aria-label="Save rename"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={cancelInlineRename}
                  className="h-7 w-7 rounded-md border flex items-center justify-center shrink-0 cursor-pointer"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                  aria-label="Cancel rename"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                {isCustomChannelSort && (
                  <div
                    data-channel-drag-handle="true"
                    title="Drag to reorder channel"
                    aria-label={`Drag to reorder ${ch.name}`}
                    className="w-5 h-5 -ml-1 flex items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] cursor-grab active:cursor-grabbing shrink-0"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}
                {renderChannelIcon(ch, 'w-3.5 h-3.5')}
                <button
                  type="button"
                  data-no-channel-drag="true"
                  onClick={() => {
                    if (shouldSuppressChannelClick()) return;
                    onOpenChannel(ch.name);
                  }}
                  className="flex-1 min-w-0 text-left font-display text-sm font-semibold truncate hover:underline cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {ch.name}
                </button>
                <button
                  type="button"
                  data-no-channel-drag="true"
                  onClick={() => startInlineRename(ch.name)}
                  className="h-6 w-6 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  title={`Rename ${ch.name}`}
                  aria-label={`Rename ${ch.name}`}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Unboxed Summary Stats (Zero-Pill discipline) */}
            <div
              className="text-[11px] font-mono tabular-nums truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {ch.streams.length} {ch.streams.length === 1 ? 'stream' : 'streams'}
              {ch.meta.defaultTopic ? ` · ${ch.meta.defaultTopic}` : ''}
            </div>

            {/* Footer Controls */}
            <div
              data-no-channel-drag="true"
              className="flex items-center justify-between gap-1.5 pt-2 mt-auto border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="inline-flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={() =>
                    onLoadStreamsToGrid(
                      ch.streams.map((s) => s.id),
                      'replace',
                      ch.name,
                    )
                  }
                  className="h-7 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                  title={`Load ${ch.name} to Live Grid`}
                >
                  <Play className="w-3 h-3 fill-current" style={{ color: 'var(--accent)' }} />
                  <span>Load</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onLoadStreamsToGrid(
                      ch.streams.map((s) => s.id),
                      'append',
                      ch.name,
                    )
                  }
                  className="h-7 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-0.5 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  title={`Layer ${ch.name} onto Live Grid`}
                >
                  <Plus className="w-3 h-3" />
                  <span>Layer</span>
                </button>
                {ch.favTopIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onLoadStreamsToGrid(
                        ch.favTopIds,
                        'replace',
                        `${ch.name} · Favorites & Top`,
                      )
                    }
                    className="h-7 px-1.5 rounded-md border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--warning)',
                    }}
                    title={`Load ${ch.favTopIds.length} favorite or top-rated streams`}
                  >
                    <Star className="w-3 h-3 fill-current" />
                    <span className="font-mono tabular-nums">{ch.favTopIds.length}</span>
                  </button>
                )}
              </div>

              <div className="inline-flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenChannelBatchEdit(ch.name)}
                  className="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  title={`Batch edit topic & tags for ${ch.name}`}
                  aria-label={`Batch edit ${ch.name}`}
                >
                  <Tag className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChannelSettings(ch.name)}
                  className="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  title={`Customize ${ch.name}`}
                  aria-label={`Customize ${ch.name}`}
                >
                  <Palette className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChannelDelete(ch.name)}
                  className="h-7 w-7 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                  style={{ color: 'var(--danger)' }}
                  title={`Delete ${ch.name}`}
                  aria-label={`Delete ${ch.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  };

  /* --------------------------------------------------------------------------
     VIEW MODE 3: SPLIT MASTER-DETAIL LIST
     -------------------------------------------------------------------------- */
  const renderSplitView = () => {
    const activeChannel =
      channels.find((c) => c.name === selectedSplitChannel) ?? channels[0];
    if (!activeChannel) return null;

    const isRenamingActive = renamingChannel === activeChannel.name;

    const renderSplitChannelRow = (ch: ChannelSummaryEntry) => {
      const isSelectedDetail = activeChannel.name === ch.name;
      const isChannelBulkChecked = selectedChannelNames.has(ch.name);
      const isPinned = Boolean(ch.meta.pinned);
      const isDraggingThis = draggingChannelName === ch.name;
      const dropTarget =
        activeChannelDropTarget?.channelName === ch.name
          ? activeChannelDropTarget
          : null;
      const firstThumb = ch.previewThumbnails.find((t) => !brokenThumbs[t.id]);

      return (
        <div
          key={ch.name}
          data-channel-reorder-id={ch.name}
          data-channel-reorder-axis="y"
          data-channel-pinned={isPinned ? 'true' : 'false'}
          onPointerDown={(e) =>
            onChannelPointerDown(ch.name, ch.streams.length, isPinned, e)
          }
          onClick={() => {
            if (shouldSuppressChannelClick()) return;
            setSelectedSplitChannel(ch.name);
          }}
          className={`relative group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
            isDraggingThis ? 'opacity-45' : ''
          }`}
          style={{
            backgroundColor: isSelectedDetail ? 'var(--accent-soft)' : undefined,
            boxShadow: dropTarget
              ? dropTarget.position === 'before'
                ? 'inset 0 2px 0 var(--accent)'
                : 'inset 0 -2px 0 var(--accent)'
              : undefined,
          }}
        >
          {isCustomChannelSort && (
            <div
              data-channel-drag-handle="true"
              title="Drag to reorder channel"
              aria-label={`Drag to reorder ${ch.name}`}
              className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)] cursor-grab active:cursor-grabbing shrink-0"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}

          {(channelBulkMode || isChannelBulkChecked) && (
            <button
              type="button"
              data-no-channel-drag="true"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelectChannel(ch.name);
              }}
              className="w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer"
              style={{
                backgroundColor: isChannelBulkChecked
                  ? 'var(--accent)'
                  : 'var(--bg-surface)',
                borderColor: isChannelBulkChecked
                  ? 'var(--accent)'
                  : 'var(--border-strong)',
                color: 'var(--accent-fg)',
              }}
              aria-label={`Select channel ${ch.name}`}
            >
              {isChannelBulkChecked && <Check className="w-3 h-3 stroke-[3]" />}
            </button>
          )}

          <div
            className="w-9 h-6 rounded overflow-hidden border flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {firstThumb ? (
              <img
                src={firstThumb.url}
                alt={ch.name}
                draggable={false}
                referrerPolicy="no-referrer"
                onError={() => onBrokenThumb(firstThumb.id)}
                className="w-full h-full object-cover pointer-events-none select-none"
              />
            ) : (
              renderChannelIcon(ch, 'w-3.5 h-3.5')
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              {renderChannelIcon(ch, 'w-3 h-3')}
              <span
                className={`text-xs truncate ${
                  isSelectedDetail ? 'font-semibold' : 'font-medium'
                }`}
                style={{
                  color: isSelectedDetail
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                }}
              >
                {ch.name}
              </span>
            </div>
          </div>

          <button
            type="button"
            data-no-channel-drag="true"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinChannel(ch.name);
            }}
            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 cursor-pointer ${
              isPinned
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
            style={{ color: isPinned ? 'var(--accent)' : 'var(--text-muted)' }}
            title={isPinned ? 'Unpin channel' : 'Pin channel'}
            aria-label={isPinned ? `Unpin ${ch.name}` : `Pin ${ch.name}`}
          >
            <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
          </button>

          <span
            className="text-[11px] font-mono tabular-nums shrink-0 min-w-[20px] text-right"
            style={{
              color: isSelectedDetail ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {ch.streams.length}
          </span>
        </div>
      );
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)] gap-4 max-w-[1800px] pb-16">
        {/* Left Master Channel List */}
        <div
          className="rounded-xl border flex flex-col overflow-hidden lg:max-h-[calc(100vh-230px)]"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="px-3 py-2 border-b flex items-center justify-between text-[11px] font-semibold"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <span>Channels ({channels.length})</span>
            {isCustomChannelSort && (
              <span className="font-normal">Drag handles to reorder</span>
            )}
          </div>
          <div
            ref={splitListScrollRef}
            className="p-1.5 space-y-0.5 overflow-y-auto flex-1 max-h-[300px] lg:max-h-none"
          >
            {pinnedChannels.length > 0 && (
              <>
                {hasPinnedSplit && (
                  <div
                    className="px-2 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Pinned
                  </div>
                )}
                {pinnedChannels.map(renderSplitChannelRow)}
              </>
            )}
            {unpinnedChannels.length > 0 && (
              <>
                {hasPinnedSplit && (
                  <div
                    className="px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-wide border-t mt-1"
                    style={{
                      color: 'var(--text-muted)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    Channels
                  </div>
                )}
                {unpinnedChannels.map(renderSplitChannelRow)}
              </>
            )}
          </div>
        </div>

        {/* Right Detail Stream Panel */}
        <div
          data-no-channel-drag="true"
          className="rounded-xl border flex flex-col overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* Detail Header */}
          <div
            className="px-4 py-3.5 border-b flex flex-wrap items-start justify-between gap-3"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              {isRenamingActive ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitInlineRename(activeChannel.name);
                  }}
                  className="flex items-center gap-1.5 max-w-sm"
                >
                  {renderChannelIcon(activeChannel)}
                  <input
                    type="text"
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.stopPropagation();
                        cancelInlineRename();
                      }
                    }}
                    placeholder="Channel name"
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-sm font-medium outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: 'var(--bg-canvas)',
                      borderColor: 'var(--accent)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }}
                    aria-label="Save channel rename"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelInlineRename}
                    className="h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                    aria-label="Cancel rename"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  {renderChannelIcon(activeChannel, 'w-4 h-4')}
                  <button
                    type="button"
                    onClick={() => onOpenChannel(activeChannel.name)}
                    className="font-display text-base font-bold truncate hover:underline text-left cursor-pointer"
                    style={{ color: 'var(--text-primary)' }}
                    title={`Open full ${activeChannel.name} view`}
                  >
                    {activeChannel.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => startInlineRename(activeChannel.name)}
                    className="h-6 w-6 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] shrink-0 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                    title={`Rename ${activeChannel.name}`}
                    aria-label={`Rename ${activeChannel.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div
                className="text-xs font-mono tabular-nums flex flex-wrap items-center gap-2"
                style={{ color: 'var(--text-muted)' }}
              >
                <span>
                  {activeChannel.streams.length}{' '}
                  {activeChannel.streams.length === 1 ? 'stream' : 'streams'}
                </span>
                {activeChannel.meta.defaultTopic && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Default topic: {activeChannel.meta.defaultTopic}</span>
                  </>
                )}
              </div>
            </div>

            {renderChannelManagementButtons(activeChannel, {
              showOpenFull: true,
              showAddUrl: true,
            })}
          </div>

          {/* Detail Stream Catalog Rows (supports stream drag reorder) */}
          <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {activeChannel.streams.map((item) => {
              const inGrid = activeIdSet.has(item.id);
              const isSelected = selectedStreamIds.has(item.id);
              const isBeingDragged = activeDragStreamIds.has(item.id);
              const reorderTarget =
                activeStreamDropTarget?.kind === 'stream-reorder' &&
                activeStreamDropTarget.streamId === item.id
                  ? activeStreamDropTarget
                  : null;
              const dropShadow = reorderTarget
                ? reorderTarget.position === 'before'
                  ? 'inset 0 2.5px 0 var(--accent)'
                  : 'inset 0 -2.5px 0 var(--accent)'
                : undefined;

              return (
                <div
                  key={item.id}
                  data-vault-reorder-id={item.id}
                  data-vault-reorder-axis="y"
                  onPointerDown={(e) => onStreamPointerDown(item.id, e)}
                  className={`px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-surface-hover)]/50 transition-colors ${
                    isBeingDragged ? 'opacity-45' : ''
                  }`}
                  style={{
                    boxShadow: dropShadow,
                    backgroundColor: isSelected ? 'var(--accent-soft)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {(bulkMode || isSelected) && (
                      <button
                        type="button"
                        data-no-stream-drag="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelectStream(item.id);
                        }}
                        className="w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: isSelected
                            ? 'var(--accent)'
                            : 'var(--bg-surface)',
                          borderColor: isSelected
                            ? 'var(--accent)'
                            : 'var(--border-strong)',
                          color: 'var(--accent-fg)',
                        }}
                        aria-label="Select stream"
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                    )}

                    {isCustomStreamSort && (
                      <div
                        aria-hidden="true"
                        title="Drag to reorder stream"
                        className="w-5 h-5 -ml-1 flex items-center justify-center rounded text-[var(--text-muted)] cursor-grab active:cursor-grabbing shrink-0"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <button
                      type="button"
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onClick={() => {
                        if (shouldSuppressStreamClick()) return;
                        if (bulkMode) {
                          onToggleSelectStream(item.id);
                        } else {
                          onEditStream(item.id);
                        }
                      }}
                      className="w-16 h-9 rounded-md overflow-hidden border shrink-0 bg-[var(--bg-surface-subtle)] select-none"
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      {!brokenThumbs[item.id] ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.customLabel || item.title}
                          draggable={false}
                          referrerPolicy="no-referrer"
                          onError={() => onBrokenThumb(item.id)}
                          className="w-full h-full object-cover pointer-events-none select-none"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center pointer-events-none">
                          <MonitorPlay
                            className="w-4 h-4"
                            style={{ color: 'var(--text-muted)' }}
                          />
                        </div>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (shouldSuppressStreamClick()) return;
                          if (bulkMode) {
                            onToggleSelectStream(item.id);
                          } else {
                            onEditStream(item.id);
                          }
                        }}
                        className="text-xs font-semibold truncate block max-w-full text-left hover:underline"
                      >
                        {item.customLabel || item.title}
                      </button>
                      <div
                        className="text-[11px] truncate"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {[
                          item.category || 'General',
                          item.tags.length > 0
                            ? item.tags.slice(0, 3).map((t) => `#${t}`).join(' ')
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-no-stream-drag="true"
                      onClick={() => onIncrementListen(item.id)}
                      className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                      title="Log +1 listen"
                    >
                      <Headphones className="w-3 h-3" />
                      <span>{item.listenCount ?? 0}</span>
                    </button>

                    <button
                      type="button"
                      data-no-stream-drag="true"
                      onClick={() =>
                        onUpdateStream(item.id, { favorite: !item.favorite })
                      }
                      className="h-7 w-7 rounded-md flex items-center justify-center cursor-pointer"
                      style={{
                        color: item.favorite ? 'var(--warning)' : 'var(--text-muted)',
                      }}
                      aria-label={item.favorite ? 'Unfavorite' : 'Favorite'}
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${item.favorite ? 'fill-current' : ''}`}
                      />
                    </button>

                    {inGrid ? (
                      <button
                        type="button"
                        data-no-stream-drag="true"
                        onClick={() => onToggleStreamInGrid(item.id)}
                        className="h-7 px-2 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: 'var(--accent-soft)',
                          borderColor: 'var(--accent)',
                          color: 'var(--accent)',
                        }}
                      >
                        <Check className="w-3 h-3" />
                        <span>Stacked</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-no-stream-drag="true"
                        onClick={() => onStackStream(item.id)}
                        className="h-7 px-2.5 rounded-md border text-[11px] font-semibold inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        <span>Stack</span>
                      </button>
                    )}

                    <button
                      type="button"
                      data-no-stream-drag="true"
                      onClick={() => onEditStream(item.id)}
                      className="h-7 w-7 rounded-md border inline-flex items-center justify-center hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                      aria-label="Edit stream details"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* --------------------------------------------------------------------------
     FLOATING CHANNEL BULK ACTION BAR
     -------------------------------------------------------------------------- */
  const renderChannelBulkBar = () => {
    if (!channelBulkMode || selectedChannelNames.size === 0) return null;
    const count = selectedChannelNames.size;

    return (
      <div
        role="region"
        aria-label="Channel bulk selection actions"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1.5rem)] sm:max-w-4xl w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 rounded-2xl border shadow-2xl backdrop-blur-md overflow-x-auto scrollbar-none"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-strong)',
          boxShadow: 'var(--shadow-popover)',
        }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono tabular-nums text-xs font-semibold px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            {count} {count === 1 ? 'channel' : 'channels'}
          </span>

          {count < channels.length ? (
            <button
              type="button"
              onClick={onSelectAllChannels}
              className="h-7 px-2 text-xs font-medium rounded-lg inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">All ({channels.length})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClearChannelSelection}
              className="h-7 px-2 text-xs font-medium rounded-lg inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span>Deselect</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onBulkLoadSelectedChannels}
            className="h-7 px-2.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-fg)',
            }}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Load Stack</span>
          </button>

          <button
            type="button"
            disabled={count < 2}
            onClick={onBulkMergeSelectedChannels}
            className="h-7 px-2.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] disabled:opacity-40 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            title={
              count < 2
                ? 'Select 2 or more channels to merge'
                : 'Merge selected channels into one'
            }
          >
            <GitMerge className="w-3 h-3" />
            <span>Merge</span>
          </button>

          <button
            type="button"
            onClick={onBulkBatchEditChannels}
            className="h-7 px-2.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <Tag className="w-3 h-3" />
            <span>Topic & Tags</span>
          </button>

          <button
            type="button"
            onClick={onBulkTogglePinChannels}
            className="h-7 px-2.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <Pin className="w-3 h-3" />
            <span>Pin / Unpin</span>
          </button>

          <button
            type="button"
            onClick={onBulkDeleteSelectedChannels}
            className="h-7 px-2.5 text-xs font-medium rounded-lg border inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--danger)',
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>

          <button
            type="button"
            onClick={onCloseChannelBulkMode}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] ml-1 cursor-pointer"
            aria-label="Exit channel bulk mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  /* --------------------------------------------------------------------------
     MAIN RENDER BY SELECTED VIEW MODE
     -------------------------------------------------------------------------- */
  if (viewMode === 'split') {
    return (
      <>
        {renderSplitView()}
        {renderChannelBulkBar()}
      </>
    );
  }

  if (viewMode === 'directory') {
    return (
      <>
        <div className="space-y-6 max-w-[1800px] pb-16">
          {pinnedChannels.length > 0 && (
            <div className="space-y-2.5">
              {hasPinnedSplit && (
                <div
                  className="text-xs font-semibold flex items-center gap-1.5 px-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Pin className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>Pinned Channels</span>
                </div>
              )}
              <div
                ref={directoryGridRef}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
              >
                {pinnedChannels.map(renderDirectoryCard)}
              </div>
            </div>
          )}

          {unpinnedChannels.length > 0 && (
            <div className="space-y-2.5">
              {hasPinnedSplit && (
                <div
                  className="text-xs font-semibold px-0.5 pt-2 border-t"
                  style={{
                    color: 'var(--text-muted)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  All Channels
                </div>
              )}
              <div
                ref={pinnedChannels.length === 0 ? directoryGridRef : undefined}
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
              >
                {unpinnedChannels.map(renderDirectoryCard)}
              </div>
            </div>
          )}
        </div>
        {renderChannelBulkBar()}
      </>
    );
  }

  return (
    <>
      <div className="space-y-7 max-w-[1800px] pb-16">
        {pinnedChannels.length > 0 && (
          <div className="space-y-7">
            {hasPinnedSplit && (
              <div
                className="text-xs font-semibold flex items-center gap-1.5 px-1"
                style={{ color: 'var(--text-muted)' }}
              >
                <Pin className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>Pinned Channels</span>
              </div>
            )}
            {pinnedChannels.map(renderCarouselSection)}
          </div>
        )}

        {unpinnedChannels.length > 0 && (
          <div className="space-y-7">
            {hasPinnedSplit && (
              <div
                className="text-xs font-semibold px-1 pt-3 border-t"
                style={{
                  color: 'var(--text-muted)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                All Channels
              </div>
            )}
            {unpinnedChannels.map(renderCarouselSection)}
          </div>
        )}
      </div>
      {renderChannelBulkBar()}
    </>
  );
};
