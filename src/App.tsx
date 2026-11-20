import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Calendar,
  FileText,
  GitCommitVertical,
  Grid2x2Check,
  ListTodo,
  MonitorPlay,
  Moon,
  MoreHorizontal,
  Palette,
  Pause,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Target,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { DetailSheet } from './components/DetailSheet';
import { KansoLogo } from './components/KansoLogo';
import { SettingsSyncModal } from './components/SettingsSyncModal';
import { TimestampFieldFocus, TimestampsModal } from './components/TimestampsModal';
import { ContextMenuState, UniversalContextMenu } from './components/UniversalContextMenu';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { ContextMenuRecord, DetailSheetTarget, ViewId } from './types';
import { getEntryDayKey, getTodayKey, isVisibleOnTimeline } from './utils/date';
import { AchievementsView } from './views/AchievementsView';
import { EventsView } from './views/EventsView';
import { FocusView } from './views/FocusView';
import { HabitsView } from './views/HabitsView';
import { LibraryView } from './views/LibraryView';
import { ListsView } from './views/ListsView';
import { NotesView } from './views/NotesView';
import {
  StreamerControllerHandle,
  StreamerPlaybackSummary,
  StreamerView,
} from './views/StreamerView';
import { TimelineView } from './views/TimelineView';

interface NavItemDef {
  id: ViewId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

const DESKTOP_NAV_GROUPS: NavItemDef[][] = [
  [
    { id: 'focus', label: 'Focus', description: 'Anchors, X-Active & tabs', icon: Target },
    { id: 'timeline', label: 'Timeline', description: 'Daily chronological spine', icon: GitCommitVertical },
    { id: 'habits', label: 'Habits', description: 'Matrix, cards & streaks', icon: Grid2x2Check },
    { id: 'achievements', label: 'Achievements', description: 'Milestones & completed wins', icon: Trophy },
  ],
  [
    { id: 'notes', label: 'Notes', description: 'Card grid & rich editor', icon: FileText },
    { id: 'events', label: 'Events', description: 'Scheduled calendar items', icon: Calendar },
    { id: 'lists', label: 'Lists', description: 'Collections & backlogs', icon: ListTodo },
  ],
  [
    { id: 'library', label: 'Library', description: 'Offline PDF & EPUB reader', icon: BookOpen },
    { id: 'streamer', label: 'Streamer', description: 'Multi-YouTube stream grid', icon: MonitorPlay },
  ],
];

const ALL_NAV_ITEMS: NavItemDef[] = DESKTOP_NAV_GROUPS.flat();

const MOBILE_PRIMARY_IDS: ViewId[] = ['focus', 'timeline', 'habits', 'achievements'];
const MOBILE_MORE_IDS: ViewId[] = ['notes', 'events', 'lists', 'library', 'streamer'];

const KansoShell: React.FC = () => {
  const { workspace, toasts, dismissToast, updateSettings } = useWorkspace();
  const [activeView, setActiveView] = useState<ViewId>('focus');
  const [hasVisitedStreamer, setHasVisitedStreamer] = useState(false);
  const [streamerPlayback, setStreamerPlayback] = useState<StreamerPlaybackSummary>({
    activeCount: 0,
    playingCount: 0,
    isPlaying: false,
    isViewMuted: false,
    isAllPaused: false,
  });
  const streamerControllerRef = useRef<StreamerControllerHandle | null>(null);

  // Shared Global Systems: Polymorphic DetailSheet, UniversalContextMenu, TimestampsModal
  const [detailTarget, setDetailTarget] = useState<DetailSheetTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [timestampsState, setTimestampsState] = useState<{
    entryId: string;
    focus?: TimestampFieldFocus;
  } | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [libraryZenMode, setLibraryZenMode] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'appearance' | 'sync' | 'workspace'>(
    'appearance'
  );

  const handleOpenContextMenu = useCallback(
    (record: ContextMenuRecord, e: React.MouseEvent) => {
      setContextMenu({
        record,
        x: e.clientX,
        y: e.clientY,
      });
    },
    []
  );

  const handleOpenTimestamps = useCallback(
    (entryId: string, focus?: TimestampFieldFocus) => {
      setTimestampsState({ entryId, focus: focus ?? null });
    },
    []
  );

  const navigateToView = useCallback((view: ViewId) => {
    if (view === 'streamer') {
      setHasVisitedStreamer(true);
    }
    if (view !== 'library') {
      setLibraryZenMode(false);
    }
    setActiveView(view);
  }, []);

  const handleMuteBackgroundStreamer = useCallback(() => {
    if (
      hasVisitedStreamer &&
      streamerPlayback.activeCount > 0 &&
      streamerPlayback.isPlaying &&
      !streamerPlayback.isViewMuted
    ) {
      streamerControllerRef.current?.toggleViewMute();
    }
  }, [hasVisitedStreamer, streamerPlayback]);

  const handleStreamerPlaybackChange = useCallback((summary: StreamerPlaybackSummary) => {
    setStreamerPlayback(summary);
  }, []);

  const showStreamerAudioControls =
    hasVisitedStreamer &&
    streamerPlayback.activeCount > 0 &&
    (streamerPlayback.isPlaying || streamerPlayback.isAllPaused);

  const todayKey = getTodayKey();

  const navCounts = useMemo(() => {
    const activeEntries = workspace.entries.filter((e) => !e.deletedAt);
    const activeListsSet = new Set(workspace.lists.filter((l) => !l.deletedAt).map((l) => l.id));
    const activeListItems = workspace.listItems.filter(
      (i) => !i.deletedAt && activeListsSet.has(i.listId)
    );
    const activeHabits = workspace.habits.filter((h) => !h.deletedAt);

    const activeFocus = activeEntries.filter(
      (e) =>
        (e.source === 'focus-anchor' ||
          e.source === 'focus-active' ||
          e.focusBucket === 'anchor' ||
          e.focusBucket === 'x-active') &&
        !e.completed
    ).length;
    const todayTimeline = activeEntries.filter(
      (e) => isVisibleOnTimeline(e) && getEntryDayKey(e) === todayKey
    ).length;
    const notesCount = activeEntries.filter(
      (e) => e.type === 'note' && !e.trashedAt && !e.archived && e.noteStatus !== 'archived'
    ).length;
    const eventsCount = activeEntries.filter((e) => e.type === 'event').length;
    const habitsTodayLeft = activeHabits.filter((h) => !h.completions[todayKey]).length;
    const achievementsCount =
      activeListItems.filter((i) => i.status === 'done').length +
      activeEntries.filter(
        (e) => e.isAchievement && (e.type !== 'task' || e.completed)
      ).length;
    const listsCount = activeListItems.length;
    const libraryCount = workspace.books.length;
    const streamerCount = workspace.streamerState.activeStreamIds.length;

    return {
      focus: activeFocus,
      timeline: todayTimeline,
      habits: habitsTodayLeft,
      achievements: achievementsCount,
      notes: notesCount,
      events: eventsCount,
      lists: listsCount,
      library: libraryCount,
      streamer: streamerCount,
    };
  }, [
    workspace.entries,
    workspace.habits,
    workspace.lists,
    workspace.listItems,
    workspace.books.length,
    workspace.streamerState.activeStreamIds.length,
    todayKey,
  ]);

  const toggleColorMode = () => {
    updateSettings({
      colorMode: workspace.settings.colorMode === 'dark' ? 'light' : 'dark',
    });
  };

  const openModal = (tab: 'appearance' | 'sync' | 'workspace') => {
    setMoreSheetOpen(false);
    setSettingsInitialTab(tab);
    setSettingsOpen(true);
  };

  const isMoreViewActive = MOBILE_MORE_IDS.includes(activeView);
  const activeViewDef = ALL_NAV_ITEMS.find((item) => item.id === activeView);

  const isEdgeToEdgeView =
    activeView === 'streamer' || activeView === 'library' || activeView === 'lists';

  return (
    <div
      className="min-h-dvh flex flex-col lg:flex-row"
      style={{ backgroundColor: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
    >
      {/* Desktop Sidebar Navigation */}
      {!(activeView === 'library' && libraryZenMode) && (
        <aside
          className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:h-dvh border-r px-3.5 py-5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="px-2.5 pb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <KansoLogo size={24} />
              <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
                Kanso
              </span>
            </div>
            <button
              type="button"
              onClick={toggleColorMode}
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
              title={`Switch to ${workspace.settings.colorMode === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle light or dark mode"
            >
              {workspace.settings.colorMode === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto space-y-3" aria-label="Main workspace navigation">
            {DESKTOP_NAV_GROUPS.map((group, groupIdx) => (
              <div
                key={groupIdx}
                className={groupIdx > 0 ? 'pt-3 border-t space-y-1' : 'space-y-1'}
                style={groupIdx > 0 ? { borderColor: 'var(--border-subtle)' } : undefined}
              >
                {group.map((item) => {
                  const Icon = item.icon;
                  const active = activeView === item.id;
                  const count = navCounts[item.id];
                  const isStreamerRowWithControls =
                    item.id === 'streamer' && showStreamerAudioControls;

                  if (isStreamerRowWithControls) {
                    return (
                      <div
                        key={item.id}
                        className="w-full flex items-center justify-between gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => navigateToView(item.id)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 py-0.5 text-left whitespace-nowrap"
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              streamerControllerRef.current?.togglePauseAll();
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-subtle)]"
                            style={{
                              color: streamerPlayback.isAllPaused
                                ? 'var(--accent)'
                                : 'var(--text-secondary)',
                            }}
                            title={
                              streamerPlayback.isAllPaused
                                ? 'Resume all streams'
                                : 'Pause all streams'
                            }
                            aria-label={
                              streamerPlayback.isAllPaused
                                ? 'Resume all streams'
                                : 'Pause all streams'
                            }
                          >
                            {streamerPlayback.isAllPaused ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              streamerControllerRef.current?.toggleViewMute();
                            }}
                            className="h-6 w-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-surface-subtle)]"
                            style={{
                              color: streamerPlayback.isViewMuted
                                ? 'var(--danger)'
                                : streamerPlayback.isPlaying
                                ? 'var(--accent)'
                                : 'var(--text-secondary)',
                            }}
                            title={
                              streamerPlayback.isViewMuted
                                ? 'Unmute Streamer'
                                : 'Temporarily mute Streamer'
                            }
                            aria-label={
                              streamerPlayback.isViewMuted
                                ? 'Unmute Streamer'
                                : 'Temporarily mute Streamer'
                            }
                          >
                            {streamerPlayback.isViewMuted ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <span
                            className="text-xs font-mono tabular-nums pl-0.5 pr-0.5"
                            style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                          >
                            {count}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateToView(item.id)}
                      className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <span className="flex items-center gap-2.5 whitespace-nowrap">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      <span
                        className="text-xs font-mono tabular-nums"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Bottom Utility Actions */}
          <div
            className="pt-4 mt-4 border-t space-y-1 shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => openModal('appearance')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5" />
                <span>Theme</span>
              </span>
              <span className="capitalize" style={{ color: 'var(--text-muted)' }}>
                {workspace.settings.theme}
              </span>
            </button>

            <button
              type="button"
              onClick={() => openModal('sync')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Gist Sync</span>
              </span>
              <span style={{ color: 'var(--text-muted)' }}>2-Way</span>
            </button>

            <button
              type="button"
              onClick={() => openModal('workspace')}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--bg-surface-subtle)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Workspace</span>
              </span>
              <span className="font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                {workspace.settings.xActiveLimit}-Active
              </span>
            </button>
          </div>
        </aside>
      )}

      {/* Mobile Compact Sticky Top Bar */}
      <header
        className="lg:hidden sticky top-0 z-30 pt-safe border-b backdrop-blur-md"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="h-12 px-4 px-safe flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <KansoLogo size={22} />
            <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">
              Kanso
            </span>
            {isMoreViewActive && activeViewDef && (
              <span
                className="text-xs font-medium truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                · {activeViewDef.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleColorMode}
              className="h-10 w-10 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Toggle color mode"
            >
              {workspace.settings.colorMode === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => openModal('sync')}
              className="h-10 w-10 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="GitHub Gist Sync"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => openModal('appearance')}
              className="h-10 w-10 flex items-center justify-center rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Themes and settings"
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main
        className={`flex-1 min-w-0 ${
          isEdgeToEdgeView ? 'pb-15 lg:pb-0' : 'pb-20 lg:pb-8'
        }`}
      >
        {activeView === 'focus' && (
          <FocusView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === 'timeline' && (
          <TimelineView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
            onOpenTimestamps={handleOpenTimestamps}
          />
        )}
        {activeView === 'habits' && <HabitsView onOpenDetail={setDetailTarget} />}
        {activeView === 'achievements' && (
          <AchievementsView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === 'notes' && (
          <NotesView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === 'events' && (
          <EventsView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === 'lists' && (
          <ListsView
            onOpenDetail={setDetailTarget}
            onOpenContextMenu={handleOpenContextMenu}
          />
        )}
        {activeView === 'library' && (
          <LibraryView
            zenMode={libraryZenMode}
            onToggleZenMode={() => setLibraryZenMode((z) => !z)}
            onExitZenMode={() => setLibraryZenMode(false)}
            onMuteBackgroundStreamer={handleMuteBackgroundStreamer}
          />
        )}
        {hasVisitedStreamer && (
          <div
            className={
              activeView === 'streamer'
                ? 'block'
                : 'fixed -left-[9999px] top-0 w-[1024px] h-[600px] opacity-0 pointer-events-none select-none overflow-hidden'
            }
            aria-hidden={activeView !== 'streamer'}
          >
            <StreamerView
              ref={streamerControllerRef}
              isActiveView={activeView === 'streamer'}
              onPlaybackStateChange={handleStreamerPlaybackChange}
            />
          </div>
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation (Focus, Timeline, Habits, Achievements, More) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t pb-safe"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
        aria-label="Mobile workspace navigation"
      >
        <div className="h-15 grid grid-cols-5 items-center px-1 px-safe">
          {MOBILE_PRIMARY_IDS.map((id) => {
            const item = ALL_NAV_ITEMS.find((n) => n.id === id)!;
            const Icon = item.icon;
            const active = activeView === item.id && !moreSheetOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  navigateToView(item.id);
                }}
                className="flex flex-col items-center justify-center h-full gap-0.5 transition-colors"
                style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreSheetOpen((prev) => !prev)}
            className="flex flex-col items-center justify-center h-full gap-0.5 transition-colors"
            style={{
              color:
                moreSheetOpen ||
                isMoreViewActive ||
                (showStreamerAudioControls && streamerPlayback.isPlaying)
                  ? streamerPlayback.isViewMuted && !moreSheetOpen && !isMoreViewActive
                    ? 'var(--danger)'
                    : 'var(--accent)'
                  : 'var(--text-muted)',
            }}
            aria-expanded={moreSheetOpen}
            aria-label="More views"
          >
            {showStreamerAudioControls && activeView !== 'streamer' ? (
              streamerPlayback.isViewMuted ? (
                <VolumeX className="w-4.5 h-4.5" />
              ) : streamerPlayback.isAllPaused ? (
                <Pause className="w-4.5 h-4.5" />
              ) : (
                <Volume2 className="w-4.5 h-4.5" />
              )
            ) : (
              <MoreHorizontal className="w-4.5 h-4.5" />
            )}
            <span className="text-[10px] font-medium leading-none">
              {isMoreViewActive && activeViewDef ? activeViewDef.label : 'More'}
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Slide-Up Bottom Sheet */}
      {moreSheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 flex items-end"
          role="dialog"
          aria-modal="true"
          aria-label="More Kanso views"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMoreSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-full rounded-t-2xl border-t pb-[calc(5rem+env(safe-area-inset-bottom,0px))] pt-2.5 px-4 space-y-4"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <div className="flex justify-center">
              <span
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: 'var(--border-strong)' }}
                aria-hidden="true"
              />
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="font-display text-sm font-bold">More Views</span>
              <button
                type="button"
                onClick={() => setMoreSheetOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {MOBILE_MORE_IDS.map((id) => {
                const item = ALL_NAV_ITEMS.find((n) => n.id === id)!;
                const Icon = item.icon;
                const active = activeView === item.id;
                const count = navCounts[item.id];
                const isStreamerCardWithControls =
                  item.id === 'streamer' && showStreamerAudioControls;

                if (isStreamerCardWithControls) {
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl border text-left transition-colors flex flex-col justify-between gap-2 min-h-[76px]"
                      style={{
                        backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                        borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <Icon
                          className="w-4.5 h-4.5 shrink-0"
                          style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                        />
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => streamerControllerRef.current?.togglePauseAll()}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                            style={{
                              backgroundColor: 'var(--bg-surface-subtle)',
                              borderColor: 'var(--border-subtle)',
                              color: streamerPlayback.isAllPaused
                                ? 'var(--accent)'
                                : 'var(--text-secondary)',
                            }}
                            aria-label={
                              streamerPlayback.isAllPaused
                                ? 'Resume all streams'
                                : 'Pause all streams'
                            }
                          >
                            {streamerPlayback.isAllPaused ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => streamerControllerRef.current?.toggleViewMute()}
                            className="h-8 w-8 flex items-center justify-center rounded-lg border transition-colors"
                            style={{
                              backgroundColor: 'var(--bg-surface-subtle)',
                              borderColor: streamerPlayback.isViewMuted
                                ? 'var(--danger)'
                                : 'var(--border-subtle)',
                              color: streamerPlayback.isViewMuted
                                ? 'var(--danger)'
                                : 'var(--accent)',
                            }}
                            aria-label={
                              streamerPlayback.isViewMuted
                                ? 'Unmute Streamer'
                                : 'Temporarily mute Streamer'
                            }
                          >
                            {streamerPlayback.isViewMuted ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigateToView(item.id);
                          setMoreSheetOpen(false);
                        }}
                        className="text-left"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className="text-sm font-semibold leading-tight"
                            style={{ color: active ? 'var(--accent)' : 'var(--text-primary)' }}
                          >
                            {item.label}
                          </span>
                          <span
                            className="text-xs font-mono tabular-nums"
                            style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                          >
                            {count}
                          </span>
                        </div>
                        <div
                          className="text-[11px] mt-0.5 line-clamp-1"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {streamerPlayback.isViewMuted
                            ? 'Muted in background'
                            : streamerPlayback.isAllPaused
                            ? 'Paused in background'
                            : 'Playing in background'}
                        </div>
                      </button>
                    </div>
                  );
                }

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      navigateToView(item.id);
                      setMoreSheetOpen(false);
                    }}
                    className="p-3.5 rounded-xl border text-left transition-colors flex flex-col gap-2 min-h-[76px]"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-surface)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <Icon
                        className="w-4.5 h-4.5"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
                      />
                      <span
                        className="text-xs font-mono tabular-nums"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}
                      >
                        {count}
                      </span>
                    </div>
                    <div>
                      <div
                        className="text-sm font-semibold leading-tight"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {item.label}
                      </div>
                      <div
                        className="text-[11px] mt-0.5 line-clamp-1"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              className="pt-3 border-t grid grid-cols-3 gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => openModal('appearance')}
                className="h-11 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Themes</span>
              </button>
              <button
                type="button"
                onClick={() => openModal('sync')}
                className="h-11 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Gist Sync</span>
              </button>
              <button
                type="button"
                onClick={() => openModal('workspace')}
                className="h-11 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Polymorphic DetailSheet (all 6 modes) */}
      <DetailSheet
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onOpenTimestamps={(entryId, focus) => handleOpenTimestamps(entryId, focus ?? null)}
      />

      {/* Universal Context Menu */}
      <UniversalContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onOpenDetail={setDetailTarget}
        onOpenTimestamps={(entryId) => handleOpenTimestamps(entryId, null)}
      />

      {/* Timestamps Modal */}
      <TimestampsModal
        entryId={timestampsState?.entryId ?? null}
        initialFocus={timestampsState?.focus ?? null}
        onClose={() => setTimestampsState(null)}
      />

      {/* Themes, Settings & GitHub Gist Sync Modal */}
      <SettingsSyncModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Non-intrusive Toast Feedback */}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-36 lg:bottom-24 right-4 sm:right-6 z-50 flex flex-col gap-2 max-w-sm"
          aria-live="polite"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor:
                  toast.tone === 'error'
                    ? 'var(--danger)'
                    : toast.tone === 'success'
                    ? 'var(--accent)'
                    : 'var(--border-strong)',
                color: toast.tone === 'error' ? 'var(--danger)' : 'var(--text-primary)',
                boxShadow: 'var(--shadow-popover)',
              }}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="opacity-70 hover:opacity-100 shrink-0"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <WorkspaceProvider>
      <KansoShell />
    </WorkspaceProvider>
  );
}
