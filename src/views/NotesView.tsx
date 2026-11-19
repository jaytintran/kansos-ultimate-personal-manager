import React, { useCallback, useMemo, useState } from 'react';
import { NotesDatabaseHome } from '../components/notes/NotesDatabaseHome';
import { NotesPageEditor } from '../components/notes/NotesPageEditor';
import { NotesScope, NotesSidebarTree } from '../components/notes/NotesSidebarTree';
import { useWorkspace } from '../context/WorkspaceContext';
import { Entry } from '../types';
import { NoteTemplateDef } from '../utils/noteTemplates';

export const NotesView: React.FC = () => {
  const {
    workspace,
    pushToast,
    updateEntry,
    addNotePage,
    duplicateNotePage,
    archiveNotePage,
    trashNotePage,
    restoreNotePage,
    permanentlyDeleteNotePage,
    emptyNoteTrash,
    addNoteNotebook,
    updateNoteNotebook,
    deleteNoteNotebook,
  } = useWorkspace();

  const [scope, setScope] = useState<NotesScope>({ type: 'all' });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);

  const allNotes = useMemo(
    () => workspace.entries.filter((e) => e.type === 'note'),
    [workspace.entries]
  );

  const notebooks = useMemo(
    () => workspace.noteNotebooks ?? [],
    [workspace.noteNotebooks]
  );

  const activeNote = useMemo(() => {
    if (!activeNoteId) return null;
    const found = allNotes.find((n) => n.id === activeNoteId);
    if (!found || found.trashedAt) return null;
    return found;
  }, [allNotes, activeNoteId]);

  const handleSelectScope = useCallback((nextScope: NotesScope) => {
    setScope(nextScope);
    setActiveNoteId(null);
  }, []);

  const handleOpenNote = useCallback(
    (noteId: string, fallbackTitle?: string) => {
      const byId = allNotes.find((n) => n.id === noteId && !n.trashedAt);
      if (byId) {
        setActiveNoteId(byId.id);
        return;
      }
      if (fallbackTitle) {
        const cleanTitle = fallbackTitle.trim().toLowerCase();
        const byTitle = allNotes.find(
          (n) => !n.trashedAt && n.title.trim().toLowerCase() === cleanTitle
        );
        if (byTitle) {
          setActiveNoteId(byTitle.id);
          return;
        }
        const created = addNotePage({
          title: fallbackTitle.trim(),
          notebookId: scope.type === 'notebook' ? scope.notebookId : null,
          syncToTimeline: false,
        });
        setActiveNoteId(created.id);
        pushToast(`Created linked note "${created.title}"`, 'success');
      }
    },
    [allNotes, addNotePage, scope, pushToast]
  );

  const handleCreateLinkedNote = useCallback(
    (title: string): Entry => {
      return addNotePage({
        title: title.trim() || 'Untitled Note',
        notebookId: activeNote?.notebookId ?? (scope.type === 'notebook' ? scope.notebookId : null),
        syncToTimeline: false,
      });
    },
    [addNotePage, activeNote?.notebookId, scope]
  );

  const handleCreateNoteFromSidebar = useCallback(
    (opts?: { notebookId?: string | null; parentId?: string | null }) => {
      const created = addNotePage({
        title: 'Untitled Note',
        notebookId: opts?.notebookId ?? null,
        parentId: opts?.parentId ?? null,
        syncToTimeline: false,
      });
      setActiveNoteId(created.id);
    },
    [addNotePage]
  );

  const handleQuickCapture = useCallback(
    (title: string) => {
      const created = addNotePage({
        title,
        notebookId: scope.type === 'notebook' ? scope.notebookId : null,
        favorite: scope.type === 'favorites',
        noteStatus: 'inbox',
        syncToTimeline: false,
      });
      setActiveNoteId(created.id);
    },
    [addNotePage, scope]
  );

  const handleCreateBlank = useCallback(() => {
    const created = addNotePage({
      title: 'Untitled Note',
      notebookId: scope.type === 'notebook' ? scope.notebookId : null,
      favorite: scope.type === 'favorites',
      noteStatus: 'draft',
      syncToTimeline: false,
    });
    setActiveNoteId(created.id);
  }, [addNotePage, scope]);

  const handleCreateFromTemplate = useCallback(
    (template: NoteTemplateDef) => {
      const created = addNotePage({
        title: template.defaultTitle,
        content: template.content,
        icon: template.icon,
        coverPreset: template.coverPreset,
        noteStatus: template.noteStatus,
        tags: [...template.tags],
        notebookId: scope.type === 'notebook' ? scope.notebookId : null,
        favorite: scope.type === 'favorites',
        syncToTimeline: false,
      });
      setActiveNoteId(created.id);
    },
    [addNotePage, scope]
  );

  const handleCreateSubpage = useCallback(
    (parentId: string, notebookId?: string | null) => {
      const created = addNotePage({
        title: 'Untitled Subpage',
        parentId,
        notebookId: notebookId ?? null,
        noteStatus: 'draft',
        syncToTimeline: false,
      });
      setActiveNoteId(created.id);
    },
    [addNotePage]
  );

  const handleDuplicateNote = useCallback(
    (id: string) => {
      const copy = duplicateNotePage(id);
      if (copy) setActiveNoteId(copy.id);
    },
    [duplicateNotePage]
  );

  const handleTrashNote = useCallback(
    (id: string) => {
      trashNotePage(id);
      if (activeNoteId === id) {
        setActiveNoteId(null);
      }
    },
    [trashNotePage, activeNoteId]
  );

  return (
    <div className="h-[calc(100dvh-3rem-3.75rem)] lg:h-dvh flex overflow-hidden">
      <NotesSidebarTree
        notes={allNotes}
        notebooks={notebooks}
        activeNoteId={activeNote?.id ?? null}
        activeScope={scope}
        sidebarCollapsed={sidebarCollapsed}
        mobileOpen={mobileTreeOpen}
        onCloseMobile={() => setMobileTreeOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onSelectScope={handleSelectScope}
        onOpenNote={(id) => handleOpenNote(id)}
        onCreateNote={handleCreateNoteFromSidebar}
        onCreateNotebook={(name) => addNoteNotebook(name)}
        onRenameNotebook={(id, name) => updateNoteNotebook(id, { name })}
        onDeleteNotebook={(id) => {
          deleteNoteNotebook(id);
          if (scope.type === 'notebook' && scope.notebookId === id) {
            setScope({ type: 'all' });
          }
        }}
      />

      {activeNote ? (
        <NotesPageEditor
          note={activeNote}
          allNotes={allNotes}
          notebooks={notebooks}
          timeFormat={workspace.settings.timeFormat}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onOpenMobileTree={() => setMobileTreeOpen(true)}
          onBackToHome={() => setActiveNoteId(null)}
          onOpenNote={handleOpenNote}
          onCreateLinkedNote={handleCreateLinkedNote}
          onCreateSubpage={handleCreateSubpage}
          onUpdateNote={(id, patch) => updateEntry(id, patch)}
          onDuplicateNote={handleDuplicateNote}
          onArchiveNote={archiveNotePage}
          onTrashNote={handleTrashNote}
          onNotify={pushToast}
        />
      ) : (
        <NotesDatabaseHome
          notes={allNotes}
          notebooks={notebooks}
          scope={scope}
          sidebarCollapsed={sidebarCollapsed}
          onExpandSidebar={() => setSidebarCollapsed(false)}
          onOpenMobileTree={() => setMobileTreeOpen(true)}
          onOpenNote={(id) => handleOpenNote(id)}
          onQuickCapture={handleQuickCapture}
          onCreateBlank={handleCreateBlank}
          onCreateFromTemplate={handleCreateFromTemplate}
          onUpdateNote={(id, patch) => updateEntry(id, patch)}
          onArchiveNote={archiveNotePage}
          onTrashNote={handleTrashNote}
          onRestoreNote={(id) => {
            restoreNotePage(id);
          }}
          onPermanentDelete={permanentlyDeleteNotePage}
          onEmptyTrash={emptyNoteTrash}
        />
      )}
    </div>
  );
};
