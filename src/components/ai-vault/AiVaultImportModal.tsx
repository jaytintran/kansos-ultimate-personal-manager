import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  ClipboardPaste,
  FileCode2,
  FileText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  parseConversationTranscript,
  parseVendorJsonExport,
  stripHtmlToPlainText,
  type ImportedVendorConversation,
  type ParsedDraftTurn,
} from "../../lib/aiVaultParser";
import type {
  AiChatFolder,
  AiConversationTurn,
  AiMarginAnnotation,
  AiPlatform,
} from "../../types/aiVault";
import { AI_PLATFORM_LIST } from "./aiVaultUiUtils";

export interface ImportedAiChatPayload {
  title: string;
  platform: AiPlatform;
  model: string;
  topic: string;
  folderId: string | null;
  tags: string[];
  sourceUrl: string;
  chatDate: string | null;
  turns: AiConversationTurn[];
  annotations: AiMarginAnnotation[];
}

interface AiVaultImportModalProps {
  open: boolean;
  folders: AiChatFolder[];
  defaultFolderId?: string | null;
  reimportTarget?: {
    id: string;
    title: string;
    platform: AiPlatform;
    model: string;
    topic?: string;
    folderId?: string | null;
    tags: string[];
    sourceUrl?: string;
    chatDate?: string | null;
  } | null;
  onClose: () => void;
  onSaveConversations: (items: ImportedAiChatPayload[]) => void;
}

type CaptureMode = "paste" | "file" | "blank";

function todayDateInput(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toConversationTurns(drafts: ParsedDraftTurn[], swapRoles = false): AiConversationTurn[] {
  const now = new Date().toISOString();
  return drafts.map((d) => ({
    id: d.id,
    role:
      swapRoles && d.role !== "note"
        ? d.role === "user"
          ? "assistant"
          : "user"
        : d.role,
    contentHtml: d.contentHtml,
    thinkingText: d.thinkingText,
    sources: d.sources?.length ? d.sources : undefined,
    collapsed: d.collapsed,
    createdAt: now,
  }));
}

export const AiVaultImportModal: React.FC<AiVaultImportModalProps> = ({
  open,
  folders,
  defaultFolderId = null,
  reimportTarget = null,
  onClose,
  onSaveConversations,
}) => {
  const [mode, setMode] = useState<CaptureMode>("paste");
  const [rawText, setRawText] = useState("");
  const [delimiterMode, setDelimiterMode] = useState<"auto" | "custom">("auto");
  const [customDelimiter, setCustomDelimiter] = useState("---");
  const [autoCollapseLongPrompts, setAutoCollapseLongPrompts] = useState(false);
  const [swapRoles, setSwapRoles] = useState(false);

  // Editable metadata fields
  const [title, setTitle] = useState(reimportTarget?.title || "");
  const [platform, setPlatform] = useState<AiPlatform>(
    reimportTarget?.platform || "chatgpt",
  );
  const [model, setModel] = useState(reimportTarget?.model || "");
  const [topic, setTopic] = useState(reimportTarget?.topic || "");
  const [folderId, setFolderId] = useState<string>(
    reimportTarget?.folderId ?? defaultFolderId ?? "",
  );
  const [sourceUrl, setSourceUrl] = useState(reimportTarget?.sourceUrl || "");
  const [chatDate, setChatDate] = useState(
    reimportTarget?.chatDate || todayDateInput(),
  );
  const [tagsInput, setTagsInput] = useState(
    reimportTarget?.tags?.join(", ") || "",
  );

  // File importer state
  const [fileError, setFileError] = useState("");
  const [fileName, setFileName] = useState("");
  const [jsonBundleDrafts, setJsonBundleDrafts] = useState<
    ImportedVendorConversation[]
  >([]);
  const [selectedDraftIndices, setSelectedDraftIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedPaste = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseConversationTranscript(rawText, {
      customDelimiter:
        delimiterMode === "custom" ? customDelimiter : undefined,
      autoCollapseLongPrompts,
    });
  }, [rawText, delimiterMode, customDelimiter, autoCollapseLongPrompts]);

  if (!open) return null;

  const parseTags = (raw: string): string[] =>
    Array.from(
      new Set(
        raw
          .split(",")
          .map((t) => t.trim().replace(/^#/, ""))
          .filter(Boolean),
      ),
    );

  const handleFileSelected = async (file: File) => {
    setFileError("");
    setFileName(file.name);
    setJsonBundleDrafts([]);
    setSelectedDraftIndices(new Set());

    try {
      const content = await file.text();
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".json")) {
        const drafts = parseVendorJsonExport(content);
        if (drafts.length === 0) {
          setFileError(
            "No valid conversation turns were found in this JSON file.",
          );
          return;
        }
        if (drafts.length === 1) {
          const d = drafts[0];
          setRawText("");
          if (!title.trim()) setTitle(d.title);
          if (d.platform) setPlatform(d.platform);
          if (d.model) setModel(d.model);
          if (d.chatDate) setChatDate(d.chatDate);
          if (d.sourceUrl) setSourceUrl(d.sourceUrl);
          if (d.tags?.length && !tagsInput.trim()) {
            setTagsInput(d.tags.join(", "));
          }
          setJsonBundleDrafts(drafts);
          setSelectedDraftIndices(new Set([0]));
        } else {
          setJsonBundleDrafts(drafts);
          setSelectedDraftIndices(new Set(drafts.map((_, i) => i)));
        }
        return;
      }

      // Markdown or Plain Text -> load into live parser preview
      setRawText(content);
      const parsed = parseConversationTranscript(content, {
        autoCollapseLongPrompts,
      });
      if (!title.trim()) {
        const fallbackName = file.name.replace(/\.(md|markdown|txt)$/i, "");
        setTitle(parsed.suggestedTitle || fallbackName);
      }
      if (parsed.detectedPlatform && parsed.detectedPlatform !== "other") {
        setPlatform(parsed.detectedPlatform);
      }
      if (parsed.suggestedModel && !model.trim()) {
        setModel(parsed.suggestedModel);
      }
      if (parsed.sourceUrl && !sourceUrl.trim()) {
        setSourceUrl(parsed.sourceUrl);
      }
      setMode("paste");
    } catch {
      setFileError("Failed to read file. Make sure it is valid UTF-8 text.");
    }
  };

  const handleSave = () => {
    const parsedTags = parseTags(tagsInput);

    if (mode === "file" && jsonBundleDrafts.length > 0) {
      const chosen = jsonBundleDrafts.filter((_, idx) =>
        selectedDraftIndices.has(idx),
      );
      if (chosen.length === 0) return;
      if (chosen.length === 1) {
        const d = chosen[0];
        onSaveConversations([
          {
            title: title.trim() || d.title || "Imported AI Chat",
            platform: platform || d.platform,
            model: model.trim() || d.model || "",
            topic: topic.trim(),
            folderId: folderId || null,
            tags: parsedTags.length > 0 ? parsedTags : d.tags || [],
            sourceUrl: sourceUrl.trim() || d.sourceUrl || "",
            chatDate: chatDate || d.chatDate || todayDateInput(),
            turns: toConversationTurns(d.turns, swapRoles),
            annotations: d.annotations || [],
          },
        ]);
      } else {
        onSaveConversations(
          chosen.map((d) => ({
            title: d.title || "Imported AI Chat",
            platform: d.platform || platform,
            model: d.model || model.trim() || "",
            topic: d.topic || topic.trim(),
            folderId: folderId || null,
            tags: Array.from(new Set([...parsedTags, ...(d.tags || [])])),
            sourceUrl: d.sourceUrl || "",
            chatDate: d.chatDate || chatDate || todayDateInput(),
            turns: toConversationTurns(d.turns, swapRoles),
            annotations: d.annotations || [],
          })),
        );
      }
      onClose();
      return;
    }

    if (mode === "blank") {
      const uid = () =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const blankTurns: AiConversationTurn[] = [
        {
          id: uid(),
          role: "user",
          contentHtml: "<p></p>",
          createdAt: now,
        },
        {
          id: uid(),
          role: "assistant",
          contentHtml: "<p></p>",
          createdAt: now,
        },
      ];
      onSaveConversations([
        {
          title: title.trim() || "Untitled AI Chat",
          platform,
          model: model.trim(),
          topic: topic.trim(),
          folderId: folderId || null,
          tags: parsedTags,
          sourceUrl: sourceUrl.trim(),
          chatDate: chatDate || todayDateInput(),
          turns: blankTurns,
          annotations: [],
        },
      ]);
      onClose();
      return;
    }

    if (!parsedPaste || parsedPaste.turns.length === 0) return;

    onSaveConversations([
      {
        title: title.trim() || parsedPaste.suggestedTitle || "Saved AI Chat",
        platform:
          !reimportTarget && parsedPaste.detectedPlatform !== "other" && platform === "chatgpt"
            ? parsedPaste.detectedPlatform
            : platform,
        model: model.trim() || parsedPaste.suggestedModel || "",
        topic: topic.trim(),
        folderId: folderId || null,
        tags: parsedTags,
        sourceUrl: sourceUrl.trim() || parsedPaste.sourceUrl || "",
        chatDate: chatDate || todayDateInput(),
        turns: toConversationTurns(parsedPaste.turns, swapRoles),
        annotations: [],
      },
    ]);
    onClose();
  };

  const canSave =
    mode === "blank" ||
    (mode === "file" &&
      jsonBundleDrafts.length > 0 &&
      selectedDraftIndices.size > 0) ||
    (mode === "paste" && Boolean(parsedPaste && parsedPaste.turns.length > 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={reimportTarget ? "Populate AI chat transcript" : "New AI Chat"}
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-5xl max-h-[92dvh] rounded-2xl border flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-strong)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        {/* Header */}
        <div
          className="px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <h2 className="font-display text-base font-semibold tracking-tight">
              {reimportTarget
                ? `Populate Transcript · ${reimportTarget.title}`
                : "Save AI Conversation"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center p-0.5 rounded-xl border"
              style={{
                backgroundColor: "var(--bg-surface-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {(
                [
                  { id: "paste", label: "Paste Transcript", icon: ClipboardPaste },
                  { id: "file", label: "Import File", icon: Upload },
                  ...(!reimportTarget
                    ? [{ id: "blank", label: "Blank Thread", icon: FileText }]
                    : []),
                ] as Array<{
                  id: CaptureMode;
                  label: string;
                  icon: React.ComponentType<{ className?: string }>;
                }>
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  style={{
                    backgroundColor:
                      mode === id ? "var(--bg-surface)" : "transparent",
                    color:
                      mode === id ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Metadata Grid */}
          <div
            className="rounded-xl border p-3.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="sm:col-span-2">
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Conversation Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  parsedPaste?.suggestedTitle || "Auto-detected from first prompt..."
                }
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as AiPlatform)}
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                {AI_PLATFORM_LIST.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Model Name
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  parsedPaste?.suggestedModel ||
                  "e.g. o3, Claude 3.7 Sonnet, Gemini 2.5"
                }
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Distributed Systems, UI Architecture"
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Folder
              </label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <option value="">Unfiled</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Chat Date
              </label>
              <input
                type="date"
                value={chatDate}
                onChange={(e) => setChatDate(e.target.value)}
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div>
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="typescript, debugging, architecture"
                className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label
                className="block text-[11px] font-medium mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                Source URL (optional)
              </label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder={
                  parsedPaste?.sourceUrl ||
                  "https://chatgpt.com/c/... or https://claude.ai/chat/..."
                }
                className="w-full h-8 px-2.5 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-canvas)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>
          </div>

          {/* PASTE TRANSCRIPT MODE */}
          {mode === "paste" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="inline-flex items-center p-0.5 rounded-lg border"
                    style={{
                      backgroundColor: "var(--bg-surface-subtle)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setDelimiterMode("auto")}
                      className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
                      style={{
                        backgroundColor:
                          delimiterMode === "auto"
                            ? "var(--bg-surface)"
                            : "transparent",
                        color:
                          delimiterMode === "auto"
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      Auto-detect Turns
                    </button>
                    <button
                      type="button"
                      onClick={() => setDelimiterMode("custom")}
                      className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer"
                      style={{
                        backgroundColor:
                          delimiterMode === "custom"
                            ? "var(--bg-surface)"
                            : "transparent",
                        color:
                          delimiterMode === "custom"
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      Custom Delimiter
                    </button>
                  </div>

                  {delimiterMode === "custom" && (
                    <input
                      type="text"
                      value={customDelimiter}
                      onChange={(e) => setCustomDelimiter(e.target.value)}
                      placeholder="Delimiter line (e.g. --- or ===)"
                      className="h-7 w-40 px-2 rounded-md border text-[11px] font-mono outline-none"
                      style={{
                        backgroundColor: "var(--bg-canvas)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoCollapseLongPrompts}
                      onChange={(e) =>
                        setAutoCollapseLongPrompts(e.target.checked)
                      }
                      className="accent-[var(--accent)]"
                    />
                    <span>Collapse long prompts</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSwapRoles((v) => !v)}
                    className="h-7 px-2 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: swapRoles
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      borderColor: swapRoles
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                      color: swapRoles
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    }}
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>Flip Roles</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "var(--text-muted)" }}>
                      Paste full multi-turn thread (ChatGPT, Claude, Gemini, Perplexity, Markdown...)
                    </span>
                    <button
                      type="button"
                      onClick={() => setRawText("")}
                      className="hover:underline cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Clear
                    </button>
                  </div>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={`You said:\nHow do I structure an indexed local-first queue?\n\nChatGPT said:\nHere is a clean architecture with IndexedDB...\n\nYou said:\nWhat about conflict resolution?`}
                    rows={14}
                    className="w-full p-3 rounded-xl border text-xs font-mono leading-relaxed outline-none focus:border-[var(--accent)] resize-y min-h-[260px]"
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                </div>

                {/* Live Parsed Turns Preview */}
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className="font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Live Turn Preview
                    </span>
                    <span
                      className="font-mono tabular-nums"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {parsedPaste
                        ? `${parsedPaste.turns.length} turns · ${
                            delimiterMode === "custom"
                              ? "Custom delimiter"
                              : `Detected ${parsedPaste.detectedPlatform}`
                          }`
                        : "Waiting for paste"}
                    </span>
                  </div>

                  <div
                    className="flex-1 rounded-xl border p-3 overflow-y-auto space-y-2.5 min-h-[260px] max-h-[360px]"
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {!parsedPaste || parsedPaste.turns.length === 0 ? (
                      <div
                        className="h-full flex flex-col items-center justify-center text-center px-4 py-10 space-y-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <ClipboardPaste className="w-6 h-6 opacity-45" />
                        <p className="text-xs">
                          Paste any copied AI chat on the left to preview parsed Prompts, Replies, Thinking blocks, and Sources.
                        </p>
                      </div>
                    ) : (
                      parsedPaste.turns.map((turn, idx) => {
                        const plain = stripHtmlToPlainText(turn.contentHtml);
                        const effectiveRole =
                          swapRoles && turn.role !== "note"
                            ? turn.role === "user"
                              ? "assistant"
                              : "user"
                            : turn.role;
                        const isUser = effectiveRole === "user";
                        return (
                          <div
                            key={turn.id}
                            className="rounded-lg border p-2.5 space-y-1"
                            style={{
                              backgroundColor: isUser
                                ? "var(--bg-surface-subtle)"
                                : "var(--bg-surface)",
                              borderColor: "var(--border-subtle)",
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span
                                className="font-semibold"
                                style={{
                                  color: isUser
                                    ? "var(--accent)"
                                    : "var(--text-primary)",
                                }}
                              >
                                {isUser ? "You" : "AI Reply"} · #{idx + 1}
                              </span>
                              <span
                                className="font-mono tabular-nums text-[10px]"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {turn.thinkingText ? "Thinking · " : ""}
                                {turn.sources?.length
                                  ? `${turn.sources.length} sources · `
                                  : ""}
                                {plain.length} chars
                              </span>
                            </div>
                            <p
                              className="text-xs line-clamp-3 leading-relaxed"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {plain || "(Empty turn)"}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FILE IMPORT MODE */}
          {mode === "file" && (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFileSelected(file);
                }}
                className="rounded-xl border border-dashed p-8 flex flex-col items-center justify-center text-center gap-2 cursor-pointer hover:border-[var(--accent)] transition-colors"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-strong)",
                }}
              >
                <FileCode2 className="w-7 h-7" style={{ color: "var(--accent)" }} />
                <p className="text-sm font-medium">
                  Drop or click to choose `.md`, `.json`, or `.txt`
                </p>
                <p className="text-xs max-w-md" style={{ color: "var(--text-muted)" }}>
                  Supports ChatGPT `conversations.json`, Claude exports, Gemini JSON, Kanso AI Vault JSON backups, Markdown transcripts, and plain text.
                </p>
                {fileName && (
                  <span
                    className="text-xs font-mono mt-1"
                    style={{ color: "var(--accent)" }}
                  >
                    Loaded: {fileName}
                  </span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileSelected(file);
                    e.target.value = "";
                  }}
                />
              </div>

              {fileError && (
                <div
                  className="rounded-xl border px-3 py-2 flex items-center gap-2 text-xs"
                  style={{
                    borderColor: "var(--danger)",
                    color: "var(--danger)",
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {jsonBundleDrafts.length > 0 && (
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div
                    className="px-3 py-2 border-b flex items-center justify-between text-xs"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <span className="font-semibold">
                      Detected {jsonBundleDrafts.length} conversation
                      {jsonBundleDrafts.length === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedDraftIndices(
                            new Set(jsonBundleDrafts.map((_, i) => i)),
                          )
                        }
                        className="text-[11px] hover:underline cursor-pointer"
                        style={{ color: "var(--accent)" }}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDraftIndices(new Set())}
                        className="text-[11px] hover:underline cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                    {jsonBundleDrafts.map((d, idx) => {
                      const checked = selectedDraftIndices.has(idx);
                      return (
                        <label
                          key={`${d.tempId}-${idx}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setSelectedDraftIndices((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(idx)) next.delete(idx);
                                  else next.add(idx);
                                  return next;
                                });
                              }}
                              className="accent-[var(--accent)]"
                            />
                            <span className="font-medium truncate">{d.title}</span>
                          </div>
                          <span
                            className="text-[11px] font-mono tabular-nums shrink-0"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {d.model || d.platform} · {d.turns.length} turns
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BLANK THREAD MODE */}
          {mode === "blank" && (
            <div
              className="rounded-xl border p-6 text-center space-y-2"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <FileText
                className="w-7 h-7 mx-auto opacity-75"
                style={{ color: "var(--accent)" }}
              />
              <p className="text-sm font-medium">Start a structured Q&A thread</p>
              <p className="text-xs max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
                Creates an empty prompt and reply turn ready for rich Tiptap editing, code blocks, comparison tables, and margin notes.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-4 sm:px-5 py-3 border-t flex items-center justify-between gap-3 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Full transcript stays local on this device · metadata syncs cleanly
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-lg border text-xs font-medium hover:bg-[var(--bg-surface-hover)] cursor-pointer"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-secondary)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={handleSave}
              className="h-8 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              style={{
                backgroundColor: "var(--accent)",
                color: "var(--accent-fg)",
              }}
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {mode === "file" && selectedDraftIndices.size > 1
                  ? `Import ${selectedDraftIndices.size} Chats`
                  : reimportTarget
                    ? "Save Transcript"
                    : "Save to AI Vault"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
