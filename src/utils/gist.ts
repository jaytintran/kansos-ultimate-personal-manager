import { GistSyncConfig, KansoWorkspace } from '../types';

export interface GistPushResult {
  gistId: string;
  htmlUrl: string;
  updatedAt: string;
  createdNew: boolean;
}

export interface GistPullPreview {
  gistId: string;
  htmlUrl: string;
  remoteUpdatedAt: string;
  workspace: KansoWorkspace;
  summary: {
    entries: number;
    habits: number;
    lists: number;
    listItems: number;
    scratchpads: number;
    customTabs: number;
    books: number;
    streams: number;
  };
}

export function validateWorkspacePayload(data: unknown): data is KansoWorkspace {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.entries) &&
    Array.isArray(obj.habits) &&
    Array.isArray(obj.lists) &&
    Array.isArray(obj.listItems) &&
    typeof obj.settings === 'object' &&
    obj.settings !== null
  );
}

function getRecordTimestamp(record: {
  updatedAt?: string | number | null;
  deletedAt?: string | null;
  createdAt?: string | number | null;
  addedAt?: string | number | null;
}): number {
  const candidates = [record.deletedAt, record.updatedAt, record.createdAt, record.addedAt];
  let best = 0;
  for (const c of candidates) {
    if (typeof c === 'number' && !Number.isNaN(c)) {
      if (c > best) best = c;
    } else if (typeof c === 'string' && c) {
      const ms = Date.parse(c);
      if (!Number.isNaN(ms) && ms > best) best = ms;
    }
  }
  return best;
}

/**
 * Merges two arrays of records by `id`:
 * - Remote newer than local -> overwrite with remote
 * - Local newer than or equal to remote -> keep local
 */
export function mergeById<
  T extends {
    id: string;
    updatedAt?: string | number | null;
    deletedAt?: string | null;
    createdAt?: string | number | null;
    addedAt?: string | number | null;
  }
>(localList: T[] | undefined, remoteList: T[] | undefined): T[] {
  const map = new Map<string, T>();
  for (const item of localList ?? []) {
    map.set(item.id, item);
  }
  for (const remoteItem of remoteList ?? []) {
    const existing = map.get(remoteItem.id);
    if (!existing) {
      map.set(remoteItem.id, remoteItem);
    } else {
      const localTs = getRecordTimestamp(existing);
      const remoteTs = getRecordTimestamp(remoteItem);
      if (remoteTs > localTs) {
        map.set(remoteItem.id, remoteItem);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Two-way workspace merge by record ID + timestamp (newest wins).
 * Respects soft-delete tombstones (`deletedAt`) so deletions sync cleanly across devices.
 */
export function mergeWorkspaces(local: KansoWorkspace, remote: KansoWorkspace): KansoWorkspace {
  const localTs = Date.parse(local.updatedAt || '') || 0;
  const remoteTs = Date.parse(remote.updatedAt || '') || 0;

  return {
    ...local,
    version: Math.max(local.version || 2, remote.version || 2),
    updatedAt: new Date().toISOString(),
    entries: mergeById(local.entries, remote.entries),
    scratchpads: mergeById(local.scratchpads, remote.scratchpads),
    customTabs: mergeById(local.customTabs, remote.customTabs),
    noteNotebooks: mergeById(local.noteNotebooks, remote.noteNotebooks),
    habits: mergeById(local.habits, remote.habits),
    habitLogs: mergeById(local.habitLogs, remote.habitLogs),
    lists: mergeById(local.lists, remote.lists),
    listItems: mergeById(local.listItems, remote.listItems),
    books: mergeById(local.books, remote.books),
    libraryFolders: mergeById(local.libraryFolders, remote.libraryFolders),
    libraryCategories: mergeById(local.libraryCategories, remote.libraryCategories),
    libraryViewFolders: mergeById(local.libraryViewFolders, remote.libraryViewFolders),
    bookBookmarks: mergeById(local.bookBookmarks, remote.bookBookmarks),
    bookHighlights: mergeById(local.bookHighlights, remote.bookHighlights),
    streams: mergeById(local.streams, remote.streams),
    streamFolders: mergeById(local.streamFolders, remote.streamFolders),
    streamPresets: mergeById(local.streamPresets, remote.streamPresets),
    streamerState: remoteTs > localTs ? remote.streamerState || local.streamerState : local.streamerState,
    settings:
      remoteTs > localTs
        ? { ...local.settings, ...remote.settings }
        : { ...remote.settings, ...local.settings },
  };
}

export async function pushWorkspaceToGist(
  workspace: KansoWorkspace,
  config: GistSyncConfig
): Promise<GistPushResult> {
  if (!navigator.onLine) {
    throw new Error('You appear to be offline. Reconnect to push to GitHub Gist.');
  }
  const token = config.token.trim();
  if (!token) {
    throw new Error('Add a GitHub Personal Access Token (gist scope) before pushing.');
  }

  const filename = (config.filename || 'kanso-workspace.json').trim();
  const payload: KansoWorkspace = {
    ...workspace,
    updatedAt: new Date().toISOString(),
  };

  const body = {
    description: 'Kanso — Personal Productivity Workspace Backup',
    public: false,
    files: {
      [filename]: {
        content: JSON.stringify(payload, null, 2),
      },
    },
  };

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const gistId = config.gistId.trim();
  const url = gistId
    ? `https://api.github.com/gists/${encodeURIComponent(gistId)}`
    : 'https://api.github.com/gists';

  const response = await fetch(url, {
    method: gistId ? 'PATCH' : 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GitHub rejected the token (401). Verify your PAT has the gist scope.');
    }
    if (response.status === 404) {
      throw new Error('Gist ID not found (404). Clear the Gist ID to create a new private Gist.');
    }
    const errText = await response.text().catch(() => '');
    throw new Error(`GitHub Gist push failed (${response.status}). ${errText.slice(0, 120)}`);
  }

  const json = await response.json();
  return {
    gistId: json.id,
    htmlUrl: json.html_url,
    updatedAt: json.updated_at || payload.updatedAt,
    createdNew: !gistId,
  };
}

export async function pullWorkspaceFromGist(config: GistSyncConfig): Promise<GistPullPreview> {
  if (!navigator.onLine) {
    throw new Error('You appear to be offline. Reconnect to pull from GitHub Gist.');
  }
  const gistId = config.gistId.trim();
  if (!gistId) {
    throw new Error('Enter a Gist ID to pull from GitHub Gist.');
  }

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (config.token.trim()) {
    headers.Authorization = `Bearer ${config.token.trim()}`;
  }

  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Unauthorized (401). Check your GitHub Personal Access Token.');
    }
    if (response.status === 404) {
      throw new Error('Gist not found (404). Verify the Gist ID and token permissions.');
    }
    throw new Error(`GitHub Gist pull failed (${response.status}).`);
  }

  const json = await response.json();
  const filename = (config.filename || 'kanso-workspace.json').trim();
  const files: Record<string, { content?: string; raw_url?: string; truncated?: boolean }> = json.files || {};
  const targetFile = files[filename] || Object.values(files)[0];

  if (!targetFile) {
    throw new Error('The target Gist does not contain any files.');
  }

  let content = targetFile.content || '';
  if (targetFile.truncated && targetFile.raw_url) {
    const rawRes = await fetch(targetFile.raw_url);
    content = await rawRes.text();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Could not parse JSON inside "${filename}".`);
  }

  if (!validateWorkspacePayload(parsed)) {
    throw new Error('Gist file does not match a valid Kanso workspace schema.');
  }

  return {
    gistId: json.id,
    htmlUrl: json.html_url,
    remoteUpdatedAt: json.updated_at || parsed.updatedAt || new Date().toISOString(),
    workspace: parsed,
    summary: {
      entries: parsed.entries.filter((e) => !e.deletedAt).length,
      habits: parsed.habits.filter((h) => !h.deletedAt).length,
      lists: parsed.lists.filter((l) => !l.deletedAt).length,
      listItems: parsed.listItems.filter((i) => !i.deletedAt).length,
      scratchpads: Array.isArray(parsed.scratchpads) ? parsed.scratchpads.filter((s) => !s.deletedAt).length : 0,
      customTabs: Array.isArray(parsed.customTabs) ? parsed.customTabs.filter((t) => !t.deletedAt).length : 0,
      books: Array.isArray(parsed.books) ? parsed.books.length : 0,
      streams: Array.isArray(parsed.streams) ? parsed.streams.length : 0,
    },
  };
}

export function downloadWorkspaceJson(workspace: KansoWorkspace): void {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `kanso-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
