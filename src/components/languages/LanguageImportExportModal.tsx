import React, { useMemo, useState } from "react";
import { Copy, Download, FileUp, Upload, X } from "lucide-react";
import {
  detectTextDelimiter,
  exportLanguageItemsToText,
  LANGUAGE_CEFR_LEVELS,
  LANGUAGE_TOPIC_PACKS,
  parseDelimitedRows,
  type LanguageTransferFormat,
} from "../../lib/languageUtils";
import type {
  LanguageCefrLevel,
  LanguageItem,
  LanguageItemType,
  LanguageProfile,
  LanguageRegister,
} from "../../types/languages";

interface LanguageImportExportModalProps {
  open: boolean;
  language: LanguageProfile;
  allItems: LanguageItem[];
  filteredItems: LanguageItem[];
  onClose: () => void;
  onImport: (
    drafts: Array<
      Omit<LanguageItem, "id" | "languageId" | "srs" | "createdAt" | "updatedAt">
    >,
  ) => number;
  onNotify: (msg: string, tone?: "neutral" | "success" | "error") => void;
}

const VALID_TYPES = new Set<LanguageItemType>([
  "vocab",
  "grammar",
  "phrase",
  "block",
]);
const VALID_REGISTERS = new Set<LanguageRegister>([
  "neutral",
  "casual",
  "polite",
  "formal",
  "slang",
  "literary",
]);
const VALID_CEFR = new Set<string>(LANGUAGE_CEFR_LEVELS);

export const LanguageImportExportModal: React.FC<
  LanguageImportExportModalProps
> = ({
  open,
  language,
  allItems,
  filteredItems,
  onClose,
  onImport,
  onNotify,
}) => {
  const [tab, setTab] = useState<"import" | "export">("import");
  const [rawText, setRawText] = useState("");
  const [defaultType, setDefaultType] = useState<LanguageItemType>("vocab");
  const [defaultTopic, setDefaultTopic] = useState<string>(
    LANGUAGE_TOPIC_PACKS[0],
  );
  const [hasHeaderRow, setHasHeaderRow] = useState(true);
  const [colTerm, setColTerm] = useState(0);
  const [colReading, setColReading] = useState(1);
  const [colMeaning, setColMeaning] = useState(2);
  const [colExample, setColExample] = useState(3);
  const [colTags, setColTags] = useState(4);

  const [exportFormat, setExportFormat] =
    useState<LanguageTransferFormat>("anki");
  const [exportScope, setExportScope] = useState<"all" | "filtered">("all");

  const parsedGrid = useMemo(() => {
    const trimmed = rawText.trim();
    if (!trimmed) return { headers: [] as string[], rows: [] as string[][] };

    // Strip Anki directive comments (#separator:tab, etc.)
    const cleanedLines = trimmed
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");

    const delimiter = detectTextDelimiter(trimmed);
    const allRows = parseDelimitedRows(cleanedLines, delimiter);
    if (allRows.length === 0) return { headers: [], rows: [] };

    if (hasHeaderRow && allRows.length > 1) {
      return {
        headers: allRows[0],
        rows: allRows.slice(1),
      };
    }
    return {
      headers: allRows[0].map((_, idx) => `Column ${idx + 1}`),
      rows: allRows,
    };
  }, [rawText, hasHeaderRow]);

  const exportText = useMemo(() => {
    const target = exportScope === "filtered" ? filteredItems : allItems;
    return exportLanguageItemsToText(target, exportFormat);
  }, [exportScope, filteredItems, allItems, exportFormat]);

  if (!open) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      setRawText(content);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleAutoDetectColumns = (rows: string[][], headers: string[]) => {
    if (headers.length === 0) return;
    const findIdx = (patterns: RegExp[], fallback: number) => {
      const idx = headers.findIndex((h) => patterns.some((p) => p.test(h)));
      return idx >= 0 ? idx : fallback;
    };
    setColTerm(findIdx([/term|word|front|pattern|expr/i], 0));
    setColReading(findIdx([/read|kana|pinyin|phon|ipa/i], headers.length > 2 ? 1 : -1));
    setColMeaning(findIdx([/mean|def|back|trans|gloss/i], headers.length > 2 ? 2 : 1));
    setColExample(findIdx([/exam|sent|context/i], headers.length > 3 ? 3 : -1));
    setColTags(findIdx([/tag|deck|label/i], headers.length > 4 ? 4 : -1));
    if (rows.length === 0) return;
  };

  const handleConfirmImport = () => {
    if (parsedGrid.rows.length === 0) {
      onNotify("Paste or upload CSV, TSV, or Anki rows first.", "error");
      return;
    }

    const headerLower = parsedGrid.headers.map((h) => h.toLowerCase());
    const findNamedCol = (name: string) =>
      hasHeaderRow ? headerLower.indexOf(name) : -1;

    const typeCol = findNamedCol("type");
    const formulaCol = findNamedCol("formula");
    const posCol = findNamedCol("partofspeech");
    const regCol = findNamedCol("register");
    const topicCol = findNamedCol("topic");
    const cefrCol = findNamedCol("cefr");
    const exTransCol = findNamedCol("exampletranslation");
    const glossCol = findNamedCol("interlineargloss");
    const notesCol = findNamedCol("nuancenotes");

    const drafts: Array<
      Omit<LanguageItem, "id" | "languageId" | "srs" | "createdAt" | "updatedAt">
    > = [];

    for (const row of parsedGrid.rows) {
      const term = (row[colTerm] || "").trim();
      const meaning = colMeaning >= 0 ? (row[colMeaning] || "").trim() : "";
      if (!term) continue;

      const reading = colReading >= 0 ? (row[colReading] || "").trim() : "";
      const exSentence = colExample >= 0 ? (row[colExample] || "").trim() : "";
      const exTrans = exTransCol >= 0 ? (row[exTransCol] || "").trim() : "";
      const exGloss = glossCol >= 0 ? (row[glossCol] || "").trim() : "";
      const rawTags = colTags >= 0 ? (row[colTags] || "").trim() : "";
      const rawType = typeCol >= 0 ? (row[typeCol] || "").trim().toLowerCase() : "";
      const rawReg = regCol >= 0 ? (row[regCol] || "").trim().toLowerCase() : "";
      const rawCefr = cefrCol >= 0 ? (row[cefrCol] || "").trim().toUpperCase() : "";

      const resolvedType: LanguageItemType = VALID_TYPES.has(
        rawType as LanguageItemType,
      )
        ? (rawType as LanguageItemType)
        : defaultType;
      const resolvedReg: LanguageRegister = VALID_REGISTERS.has(
        rawReg as LanguageRegister,
      )
        ? (rawReg as LanguageRegister)
        : "neutral";
      const resolvedCefr: LanguageCefrLevel = VALID_CEFR.has(rawCefr)
        ? (rawCefr as LanguageCefrLevel)
        : "";

      const tags = rawTags
        ? rawTags
            .split(/[;,\s]+/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : [];

      const formula =
        formulaCol >= 0
          ? (row[formulaCol] || "").trim()
          : /\[[^\]]+\]/.test(term)
            ? term
            : "";

      drafts.push({
        type: resolvedType,
        term,
        reading: reading || undefined,
        meaning: meaning || "(Imported)",
        patternFormula: formula || undefined,
        partOfSpeech:
          posCol >= 0 ? (row[posCol] || "").trim() || undefined : undefined,
        register: resolvedReg,
        nuanceNotes:
          notesCol >= 0 ? (row[notesCol] || "").trim() || undefined : undefined,
        examples: exSentence
          ? [
              {
                id: `lex-imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                sentence: exSentence,
                translation: exTrans,
                interlinearGloss: exGloss || undefined,
              },
            ]
          : [],
        topic:
          topicCol >= 0 && row[topicCol]?.trim()
            ? row[topicCol].trim()
            : defaultTopic,
        cefrLevel: resolvedCefr,
        deckIds: [],
        tags,
        favorite: false,
      });
    }

    if (drafts.length === 0) {
      onNotify("No valid rows found with a term column.", "error");
      return;
    }

    const added = onImport(drafts);
    onNotify(`Imported ${added} items into ${language.name}`, "success");
    onClose();
  };

  const handleDownloadExport = () => {
    const ext = exportFormat === "csv" ? "csv" : exportFormat === "tsv" ? "tsv" : "txt";
    const mime =
      exportFormat === "csv"
        ? "text/csv;charset=utf-8"
        : "text/tab-separated-values;charset=utf-8";
    const blob = new Blob([exportText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `kanso-${language.code.toLowerCase()}-${exportFormat}-${stamp}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify(`Exported ${exportFormat.toUpperCase()} deck`, "success");
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      onNotify("Copied deck to clipboard", "success");
    } catch {
      onNotify("Clipboard copy failed — use Download instead.", "error");
    }
  };

  const colOptions = parsedGrid.headers.map((h, i) => ({
    index: i,
    label: `${i + 1}: ${h}`,
  }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.45)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Import and Export Languages Deck"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border overflow-hidden shadow-xl max-h-[90dvh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-primary)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">
              {language.name} · Import &amp; Export
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Supports CSV, TSV, and Anki-compatible tab-delimited text decks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex items-center gap-1 px-5 py-2.5 border-b"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--bg-surface-subtle)",
          }}
        >
          <button
            type="button"
            onClick={() => setTab("import")}
            className="h-8 px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{
              backgroundColor:
                tab === "import" ? "var(--bg-surface)" : "transparent",
              color:
                tab === "import"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              boxShadow:
                tab === "import" ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            <Upload className="w-3.5 h-3.5" />
            Import CSV / TSV / Anki
          </button>
          <button
            type="button"
            onClick={() => setTab("export")}
            className="h-8 px-3.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0"
            style={{
              backgroundColor:
                tab === "export" ? "var(--bg-surface)" : "transparent",
              color:
                tab === "export"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              boxShadow:
                tab === "export" ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export Deck
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          {tab === "import" ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  style={{
                    borderColor: "var(--border-subtle)",
                    backgroundColor: "var(--bg-surface-subtle)",
                  }}
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Upload .csv / .tsv / .txt
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasHeaderRow}
                    onChange={(e) => setHasHeaderRow(e.target.checked)}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  First row is header
                </label>
              </div>

              <textarea
                rows={6}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  "Paste CSV, TSV, or Anki export here…\nterm\treading\tmeaning\texample\ttags\n電車\tでんしゃ\ttrain\t{{電車}}で会社に行きます。\ttravel A1"
                }
                className="w-full p-3 rounded-xl border text-xs font-mono leading-relaxed"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                <label className="space-y-1 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>Default Type</span>
                  <select
                    value={defaultType}
                    onChange={(e) =>
                      setDefaultType(e.target.value as LanguageItemType)
                    }
                    className="w-full h-9 px-2 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <option value="vocab">Vocab / Noun</option>
                    <option value="grammar">Grammar</option>
                    <option value="phrase">Phrase</option>
                    <option value="block">Building Block</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>Default Topic</span>
                  <select
                    value={defaultTopic}
                    onChange={(e) => setDefaultTopic(e.target.value)}
                    className="w-full h-9 px-2 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    {LANGUAGE_TOPIC_PACKS.map((topic) => (
                      <option key={topic} value={topic}>
                        {topic}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>Term Col</span>
                  <select
                    value={colTerm}
                    onChange={(e) => setColTerm(Number(e.target.value))}
                    className="w-full h-9 px-2 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    {colOptions.length === 0 ? (
                      <option value={0}>Column 1</option>
                    ) : (
                      colOptions.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.label}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>Reading Col</span>
                  <select
                    value={colReading}
                    onChange={(e) => setColReading(Number(e.target.value))}
                    className="w-full h-9 px-2 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <option value={-1}>None</option>
                    {colOptions.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>Meaning Col</span>
                  <select
                    value={colMeaning}
                    onChange={(e) => setColMeaning(Number(e.target.value))}
                    className="w-full h-9 px-2 rounded-lg border text-xs"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <option value={-1}>None</option>
                    {colOptions.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {parsedGrid.headers.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 items-end">
                  <label className="space-y-1 text-xs">
                    <span style={{ color: "var(--text-muted)" }}>Example Col</span>
                    <select
                      value={colExample}
                      onChange={(e) => setColExample(Number(e.target.value))}
                      className="w-full h-9 px-2 rounded-lg border text-xs"
                      style={{
                        borderColor: "var(--border-subtle)",
                        backgroundColor: "var(--bg-surface-subtle)",
                      }}
                    >
                      <option value={-1}>None</option>
                      {colOptions.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-xs">
                    <span style={{ color: "var(--text-muted)" }}>Tags Col</span>
                    <select
                      value={colTags}
                      onChange={(e) => setColTags(Number(e.target.value))}
                      className="w-full h-9 px-2 rounded-lg border text-xs"
                      style={{
                        borderColor: "var(--border-subtle)",
                        backgroundColor: "var(--bg-surface-subtle)",
                      }}
                    >
                      <option value={-1}>None</option>
                      {colOptions.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      handleAutoDetectColumns(parsedGrid.rows, parsedGrid.headers)
                    }
                    className="h-9 px-3 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Auto-map Headers
                  </button>
                </div>
              )}

              {parsedGrid.rows.length > 0 && (
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div
                    className="px-3 py-2 text-xs font-medium border-b flex items-center justify-between"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <span>Preview</span>
                    <span className="font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {parsedGrid.rows.length} rows ready
                    </span>
                  </div>
                  <div className="max-h-36 overflow-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {parsedGrid.rows.slice(0, 5).map((r, idx) => (
                          <tr
                            key={idx}
                            className="border-b last:border-b-0"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            <td className="px-3 py-1.5 font-medium">
                              {r[colTerm] || "—"}
                            </td>
                            <td
                              className="px-3 py-1.5 font-mono"
                              style={{ color: "var(--text-muted)" }}
                            >
                              {colReading >= 0 ? r[colReading] || "" : ""}
                            </td>
                            <td className="px-3 py-1.5">
                              {colMeaning >= 0 ? r[colMeaning] || "" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg border text-xs font-medium"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  className="h-9 px-4 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Import {parsedGrid.rows.length || 0} Rows
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Export Format
                  </div>
                  <div
                    className="flex items-center gap-1 p-1 rounded-lg border"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    {(
                      [
                        { id: "anki", label: "Anki .txt" },
                        { id: "csv", label: "CSV" },
                        { id: "tsv", label: "TSV" },
                      ] as const
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setExportFormat(fmt.id)}
                        className="flex-1 h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap"
                        style={{
                          backgroundColor:
                            exportFormat === fmt.id
                              ? "var(--bg-surface)"
                              : "transparent",
                          color:
                            exportFormat === fmt.id
                              ? "var(--text-primary)"
                              : "var(--text-muted)",
                        }}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Scope
                  </div>
                  <div
                    className="flex items-center gap-1 p-1 rounded-lg border"
                    style={{
                      borderColor: "var(--border-subtle)",
                      backgroundColor: "var(--bg-surface-subtle)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setExportScope("all")}
                      className="flex-1 h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap tabular-nums"
                      style={{
                        backgroundColor:
                          exportScope === "all"
                            ? "var(--bg-surface)"
                            : "transparent",
                        color:
                          exportScope === "all"
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      All ({allItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportScope("filtered")}
                      className="flex-1 h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap tabular-nums"
                      style={{
                        backgroundColor:
                          exportScope === "filtered"
                            ? "var(--bg-surface)"
                            : "transparent",
                        color:
                          exportScope === "filtered"
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                      }}
                    >
                      Filtered ({filteredItems.length})
                    </button>
                  </div>
                </div>
              </div>

              <textarea
                readOnly
                rows={9}
                value={exportText}
                className="w-full p-3 rounded-xl border text-xs font-mono leading-relaxed"
                style={{
                  borderColor: "var(--border-subtle)",
                  backgroundColor: "var(--bg-surface-subtle)",
                }}
              />

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyExport()}
                  className="h-9 px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Text
                </button>
                <button
                  type="button"
                  onClick={handleDownloadExport}
                  className="h-9 px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
