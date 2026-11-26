import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Columns2,
  FolderEdit,
  FolderPlus,
  GalleryHorizontal,
  GripVertical,
  Hash,
  Layers,
  LayoutGrid,
  List,
  Palette,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Smile,
  Star,
  Tag,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { BottomSheet } from '../ui/BottomSheet';
import { ChannelsSortMode, ChannelsViewMode } from './StreamChannelsOverview';
import { VaultScope } from './StreamVaultSidebar';

export type VaultViewMode = 'grid' | 'table';
export type VaultCardDensity = 'standard' | 'compact';
export type VaultSortMode =
  | 'custom'
  | 'recent'
  | 'listens'
  | 'rating'
  | 'title'
  | 'channel';
export type VaultGroupByMode = 'none' | 'topic' | 'channel';
export type VaultMinRatingFilter = 0 | 4 | 5;
export type VaultGridStatusFilter = 'all' | 'stacked' | 'unstacked';

interface StreamVaultControlsSheetProps {
  open: boolean;
  onClose: () => void;
  scope: VaultScope;
  viewMode: VaultViewMode;
  onChangeViewMode: (mode: VaultViewMode) => void;
  cardDensity: VaultCardDensity;
  onChangeCardDensity: (density: VaultCardDensity) => void;
  sortBy: VaultSortMode;
  onChangeSortBy: (sort: VaultSortMode) => void;
  groupBy: VaultGroupByMode;
  onChangeGroupBy: (groupBy: VaultGroupByMode) => void;
  channelsViewMode: ChannelsViewMode;
  onChangeChannelsViewMode: (mode: ChannelsViewMode) => void;
  channelSortBy: ChannelsSortMode;
  onChangeChannelSortBy: (sort: ChannelsSortMode) => void;
  pinnedOnlyChannels: boolean;
  onTogglePinnedOnlyChannels: () => void;
  collapseUnpinnedChannels: boolean;
  onToggleCollapseUnpinnedChannels: () => void;
  existingTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  minRating: VaultMinRatingFilter;
  onChangeMinRating: (minRating: VaultMinRatingFilter) => void;
  gridStatusFilter: VaultGridStatusFilter;
  onChangeGridStatusFilter: (status: VaultGridStatusFilter) => void;
  untaggedOnly: boolean;
  onToggleUntaggedOnly: () => void;
  onResetFilters: () => void;
}

const STREAM_SORT_OPTIONS: { id: VaultSortMode; label: string }[] = [
  { id: 'recent', label: 'Recently Added' },
  { id: 'listens', label: 'Most Listened' },
  { id: 'rating', label: 'Highest Rated' },
  { id: 'title', label: 'Title (A–Z)' },
  { id: 'channel', label: 'Channel (A–Z)' },
  { id: 'custom', label: 'Custom Drag Order' },
];

const CHANNEL_SORT_OPTIONS: { id: ChannelsSortMode; label: string }[] = [
  { id: 'count-desc', label: 'Most Streams' },
  { id: 'count-asc', label: 'Fewest Streams' },
  { id: 'listens', label: 'Total Listens' },
  { id: 'recent', label: 'Latest Added' },
  { id: 'title-asc', label: 'A–Z' },
  { id: 'title-desc', label: 'Z–A' },
  { id: 'custom', label: 'Custom Drag Order' },
];

export const StreamVaultControlsSheet: React.FC<StreamVaultControlsSheetProps> = ({
  open,
  onClose,
  scope,
  viewMode,
  onChangeViewMode,
  cardDensity,
  onChangeCardDensity,
  sortBy,
  onChangeSortBy,
  groupBy,
  onChangeGroupBy,
  channelsViewMode,
  onChangeChannelsViewMode,
  channelSortBy,
  onChangeChannelSortBy,
  pinnedOnlyChannels,
  onTogglePinnedOnlyChannels,
  collapseUnpinnedChannels,
  onToggleCollapseUnpinnedChannels,
  existingTags,
  selectedTags,
  onToggleTag,
  minRating,
  onChangeMinRating,
  gridStatusFilter,
  onChangeGridStatusFilter,
  untaggedOnly,
  onToggleUntaggedOnly,
  onResetFilters,
}) => {
  const isChannels = scope.kind === 'channels';
  const isCustomStreamSort = sortBy === 'custom';
  const isCustomChannelSort = channelSortBy === 'custom';

  const activeFilterCount =
    selectedTags.length +
    (minRating > 0 ? 1 : 0) +
    (scope.kind !== 'in-grid' && gridStatusFilter !== 'all' ? 1 : 0) +
    (untaggedOnly ? 1 : 0) +
    (isChannels && pinnedOnlyChannels ? 1 : 0);

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={isChannels ? 'Channels View & Filters' : 'Vault View & Filters'}
      ariaLabel={isChannels ? 'Channels view and filters' : 'Vault view and filters'}
    >
      <div className="p-4 space-y-5">
        {/* VIEW MODE */}
        <section className="space-y-2">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Display Mode
          </div>

          {isChannels ? (
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'carousels', label: 'Carousels', Icon: GalleryHorizontal },
                  { id: 'directory', label: 'Directory', Icon: LayoutGrid },
                  { id: 'split', label: 'Split', Icon: Columns2 },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = channelsViewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeChannelsViewMode(id)}
                    className="h-9 px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'grid', label: 'Cards', Icon: LayoutGrid },
                    { id: 'table', label: 'Compact List', Icon: List },
                  ] as const
                ).map(({ id, label, Icon }) => {
                  const active = viewMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onChangeViewMode(id)}
                      className="h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {viewMode === 'grid' && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Card Density
                  </span>
                  <div
                    className="inline-flex items-center p-0.5 rounded-lg border"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {(['standard', 'compact'] as const).map((d) => {
                      const active = cardDensity === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => onChangeCardDensity(d)}
                          className="h-7 px-2.5 rounded-md text-[11px] font-semibold capitalize transition-colors cursor-pointer"
                          style={{
                            backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                            color: active ? 'var(--accent)' : 'var(--text-muted)',
                          }}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* GROUP BY (All Saved only) */}
        {scope.kind === 'all' && (
          <section className="space-y-2">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Group Streams By
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'none', label: 'None' },
                  { id: 'topic', label: 'Topic' },
                  { id: 'channel', label: 'Channel' },
                ] as const
              ).map((opt) => {
                const active = groupBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeGroupBy(opt.id)}
                    className="h-8 px-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* CHANNELS QUICK DISPLAY TOGGLES */}
        {isChannels && (
          <section className="space-y-2">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Channel Sections
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onTogglePinnedOnlyChannels}
                className="h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: pinnedOnlyChannels ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: pinnedOnlyChannels ? 'var(--accent)' : 'var(--border-subtle)',
                  color: pinnedOnlyChannels ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Pin className={`w-3.5 h-3.5 ${pinnedOnlyChannels ? 'fill-current' : ''}`} />
                <span>Pinned Only</span>
              </button>
              <button
                type="button"
                onClick={onToggleCollapseUnpinnedChannels}
                className="h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: collapseUnpinnedChannels
                    ? 'var(--accent-soft)'
                    : 'var(--bg-surface)',
                  borderColor: collapseUnpinnedChannels ? 'var(--accent)' : 'var(--border-subtle)',
                  color: collapseUnpinnedChannels ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Collapse Unpinned</span>
              </button>
            </div>
          </section>
        )}

        {/* SORT & CUSTOM REORDER */}
        {isChannels ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Channel Order
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeChannelSortBy(isCustomChannelSort ? 'count-desc' : 'custom')
                }
                className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: isCustomChannelSort ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isCustomChannelSort ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isCustomChannelSort ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <GripVertical className="w-3 h-3" />
                <span>{isCustomChannelSort ? 'Drag Reorder On' : 'Enable Drag Order'}</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CHANNEL_SORT_OPTIONS.map((opt) => {
                const active = channelSortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeChannelSortBy(opt.id)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {active && <Check className="w-3 h-3" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Streams Inside Channels
              </div>
              <button
                type="button"
                onClick={() => onChangeSortBy(isCustomStreamSort ? 'recent' : 'custom')}
                className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: isCustomStreamSort ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isCustomStreamSort ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isCustomStreamSort ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <GripVertical className="w-3 h-3" />
                <span>{isCustomStreamSort ? 'Drag Reorder On' : 'Enable Drag Order'}</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STREAM_SORT_OPTIONS.filter((o) => o.id !== 'channel').map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeSortBy(opt.id)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {active && <Check className="w-3 h-3" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--text-muted)' }}
              >
                Sort & Reorder
              </div>
              <button
                type="button"
                onClick={() => onChangeSortBy(isCustomStreamSort ? 'recent' : 'custom')}
                className="h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor: isCustomStreamSort ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isCustomStreamSort ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isCustomStreamSort ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <GripVertical className="w-3 h-3" />
                <span>{isCustomStreamSort ? 'Drag Reorder On' : 'Enable Drag Order'}</span>
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STREAM_SORT_OPTIONS.map((opt) => {
                const active = sortBy === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeSortBy(opt.id)}
                    className="h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    {active && <Check className="w-3 h-3" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* FILTERS & TAGS */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Filters & Tags
            </div>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={onResetFilters}
                className="text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                style={{ color: 'var(--accent)' }}
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear all ({activeFilterCount})</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {([0, 4, 5] as const).map((r) => {
              const active = minRating === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeMinRating(r)}
                  className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {r > 0 && <Star className="w-3 h-3 fill-current" />}
                  <span>{r === 0 ? 'Any Rating' : `${r}+ Stars`}</span>
                </button>
              );
            })}

            {scope.kind !== 'in-grid' && (
              <button
                type="button"
                onClick={() =>
                  onChangeGridStatusFilter(
                    gridStatusFilter === 'all'
                      ? 'stacked'
                      : gridStatusFilter === 'stacked'
                        ? 'unstacked'
                        : 'all',
                  )
                }
                className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                style={{
                  backgroundColor:
                    gridStatusFilter !== 'all' ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor:
                    gridStatusFilter !== 'all' ? 'var(--accent)' : 'var(--border-subtle)',
                  color:
                    gridStatusFilter !== 'all' ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>
                  {gridStatusFilter === 'all'
                    ? 'Grid: All'
                    : gridStatusFilter === 'stacked'
                      ? 'In Live Grid'
                      : 'Not In Grid'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleUntaggedOnly}
              className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
              style={{
                backgroundColor: untaggedOnly ? 'var(--accent-soft)' : 'var(--bg-surface)',
                borderColor: untaggedOnly ? 'var(--accent)' : 'var(--border-subtle)',
                color: untaggedOnly ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <Hash className="w-3 h-3" />
              <span>Untagged Only</span>
            </button>
          </div>

          {existingTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {existingTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggleTag(tag)}
                    className="h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    }}
                  >
                    <Hash className="w-3 h-3 opacity-70" />
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </BottomSheet>
  );
};

interface StreamVaultScopeActionsSheetProps {
  open: boolean;
  onClose: () => void;
  scope: VaultScope;
  scopeTitle: string;
  visibleCount: number;
  canBatchLoad: boolean;
  onLoadStack: () => void;
  onLayerStack: () => void;
  // In Live Grid
  activeStreamsCount: number;
  isAllPaused: boolean;
  allActiveMuted: boolean;
  onTogglePauseAll: () => void;
  onToggleViewMute: () => void;
  onClearStack?: () => void;
  // Folder
  onEditFolder?: () => void;
  onStartNewSubfolder?: () => void;
  onOpenAddStreamsToFolder?: () => void;
  // Topic
  onStartRenameTopic?: () => void;
  onOpenTopicIconModal?: () => void;
  // Channel
  channelPinned?: boolean;
  channelFavTopCount?: number;
  onLoadChannelFavTop?: () => void;
  onTogglePinChannel?: () => void;
  onStartRenameChannel?: () => void;
  onBatchEditChannel?: () => void;
  onOpenChannelSettings?: () => void;
  onDeleteChannel?: () => void;
  // Add URL
  onOpenCreateDrawer: () => void;
}

export const StreamVaultScopeActionsSheet: React.FC<StreamVaultScopeActionsSheetProps> = ({
  open,
  onClose,
  scope,
  scopeTitle,
  visibleCount,
  canBatchLoad,
  onLoadStack,
  onLayerStack,
  activeStreamsCount,
  isAllPaused,
  allActiveMuted,
  onTogglePauseAll,
  onToggleViewMute,
  onClearStack,
  onEditFolder,
  onStartNewSubfolder,
  onOpenAddStreamsToFolder,
  onStartRenameTopic,
  onOpenTopicIconModal,
  channelPinned,
  channelFavTopCount = 0,
  onLoadChannelFavTop,
  onTogglePinChannel,
  onStartRenameChannel,
  onBatchEditChannel,
  onOpenChannelSettings,
  onDeleteChannel,
  onOpenCreateDrawer,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!open) setConfirmClear(false);
  }, [open]);

  const rowClass =
    'w-full h-10 px-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer';

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={`${scopeTitle} Actions`}
      ariaLabel={`${scopeTitle} actions`}
    >
      <div className="p-4 space-y-2">
        {canBatchLoad && visibleCount > 0 && (
          <>
            <button
              type="button"
              onClick={() => {
                onLoadStack();
                onClose();
              }}
              className={rowClass}
              style={{
                backgroundColor: 'var(--accent-soft)',
                borderColor: 'var(--accent)',
                color: 'var(--accent)',
              }}
            >
              <span className="inline-flex items-center gap-2 font-semibold">
                <Play className="w-4 h-4 fill-current" />
                <span>Load Stack ({visibleCount})</span>
              </span>
              <ChevronRight className="w-4 h-4 opacity-70" />
            </button>

            <button
              type="button"
              onClick={() => {
                onLayerStack();
                onClose();
              }}
              className={rowClass}
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span>Layer onto Current Live Grid</span>
              </span>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </button>
          </>
        )}

        {scope.kind === 'channel' && channelFavTopCount > 0 && onLoadChannelFavTop && (
          <button
            type="button"
            onClick={() => {
              onLoadChannelFavTop();
              onClose();
            }}
            className={rowClass}
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--warning)',
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Star className="w-4 h-4 fill-current" />
              <span>Load Favorites & Top Rated ({channelFavTopCount})</span>
            </span>
            <ChevronRight className="w-4 h-4 opacity-50" />
          </button>
        )}

        {scope.kind === 'in-grid' && activeStreamsCount > 0 && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onTogglePauseAll}
                className="h-10 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: isAllPaused ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: isAllPaused ? 'var(--accent)' : 'var(--border-subtle)',
                  color: isAllPaused ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                {isAllPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                <span>{isAllPaused ? 'Resume All' : 'Pause All'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleViewMute}
                className="h-10 px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                style={{
                  backgroundColor: allActiveMuted ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
                  borderColor: allActiveMuted ? 'var(--danger)' : 'var(--border-subtle)',
                  color: allActiveMuted ? 'var(--danger)' : 'var(--text-primary)',
                }}
              >
                {allActiveMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{allActiveMuted ? 'Unmute All' : 'Mute All'}</span>
              </button>
            </div>

            {onClearStack && (
              confirmClear ? (
                <div
                  className="p-2.5 rounded-xl border flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderColor: 'var(--danger)',
                  }}
                >
                  <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>
                    Clear all {activeStreamsCount} active streams?
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClearStack();
                        setConfirmClear(false);
                        onClose();
                      }}
                      className="h-8 px-3 rounded-lg text-xs font-semibold text-white cursor-pointer"
                      style={{ backgroundColor: 'var(--danger)' }}
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className={rowClass}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--danger)',
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <Trash2 className="w-4 h-4" />
                    <span>Clear Live Stack</span>
                  </span>
                  <ChevronRight className="w-4 h-4 opacity-50" />
                </button>
              )
            )}
          </div>
        )}

        {scope.kind === 'folder' && (
          <div className="space-y-2 pt-1">
            {onOpenAddStreamsToFolder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAddStreamsToFolder();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>Add Existing Streams to Folder</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onStartNewSubfolder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartNewSubfolder();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <FolderPlus className="w-4 h-4" />
                  <span>New Subfolder</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onEditFolder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditFolder();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <FolderEdit className="w-4 h-4" />
                  <span>Edit Folder Name & Icon</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
          </div>
        )}

        {scope.kind === 'topic' && (
          <div className="space-y-2 pt-1">
            {onStartRenameTopic && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartRenameTopic();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Pencil className="w-4 h-4" />
                  <span>Rename Topic</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onOpenTopicIconModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTopicIconModal();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Smile className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>Change Topic Icon</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
          </div>
        )}

        {scope.kind === 'channel' && (
          <div className="space-y-2 pt-1">
            {onTogglePinChannel && (
              <button
                type="button"
                onClick={() => {
                  onTogglePinChannel();
                  onClose();
                }}
                className={rowClass}
                style={{
                  backgroundColor: channelPinned ? 'var(--accent-soft)' : 'var(--bg-surface)',
                  borderColor: channelPinned ? 'var(--accent)' : 'var(--border-subtle)',
                  color: channelPinned ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Pin className={`w-4 h-4 ${channelPinned ? 'fill-current' : ''}`} />
                  <span>{channelPinned ? 'Unpin Channel' : 'Pin Channel to Top'}</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onStartRenameChannel && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartRenameChannel();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Pencil className="w-4 h-4" />
                  <span>Rename or Merge Channel</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onBatchEditChannel && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onBatchEditChannel();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  <span>Batch Edit Topic & Tags</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onOpenChannelSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenChannelSettings();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  <span>Customize Icon, Color & Default Topic</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
            {onDeleteChannel && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDeleteChannel();
                }}
                className={rowClass}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--danger)',
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Channel & Streams</span>
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onClose();
            onOpenCreateDrawer();
          }}
          className={rowClass}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <span className="inline-flex items-center gap-2">
            <Plus className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span>Add New Stream URL</span>
          </span>
          <ChevronRight className="w-4 h-4 opacity-50" />
        </button>
      </div>
    </BottomSheet>
  );
};
