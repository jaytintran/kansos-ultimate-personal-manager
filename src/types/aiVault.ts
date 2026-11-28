export type AiPlatform =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "perplexity"
  | "deepseek"
  | "grok"
  | "other";

export type AiTurnRole = "user" | "assistant" | "note";

export type AiMarginAnnotationColor = "amber" | "sage" | "sky" | "rose";

export type AiReadingWidth = "normal" | "wide";

export type AiReadingFont = "sans" | "serif" | "mono";

export interface AiTurnSource {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
}

export interface AiConversationTurn {
  id: string;
  role: AiTurnRole;
  contentHtml: string;
  thinkingText?: string;
  sources?: AiTurnSource[];
  collapsed?: boolean;
  createdAt: string;
}

export interface AiMarginAnnotation {
  id: string;
  turnId: string;
  quoteText: string;
  comment: string;
  color: AiMarginAnnotationColor;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatFolder {
  id: string;
  name: string;
  parentId: string | null;
  icon?: string;
  sortOrder?: number;
  createdAt: string;
}

/**
 * Synced lightweight metadata stored in KansoWorkspace.
 * Heavy turn content, thinking blocks, sources, and margin annotations stay local-first in IndexedDB.
 */
export interface AiChatRecord {
  id: string;
  title: string;
  platform: AiPlatform;
  model: string;
  topic: string;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  chatDate: string | null; // YYYY-MM-DD or ISO timestamp
  sourceUrl: string;
  turnCount: number;
  previewPrompt: string;
  hasCode: boolean;
  annotationCount: number;
  linkedNoteIds: string[];
  linkedBookIds: string[];
  readingWidth?: AiReadingWidth;
  readingFont?: AiReadingFont;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Local-first full conversation payload stored in IndexedDB (`ai_vault_conversations`).
 */
export interface AiChatBodyRecord {
  chatId: string;
  turns: AiConversationTurn[];
  annotations: AiMarginAnnotation[];
  searchText: string;
  searchPromptText?: string;
  searchReplyText?: string;
  updatedAt: string;
}

export interface AiVaultJumpRequest {
  chatId: string;
  turnId?: string;
  nonce: number;
}
