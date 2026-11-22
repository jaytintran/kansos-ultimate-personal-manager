import React, { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileUser, Upload, X } from "lucide-react";
import {
  exportContactsToCsv,
  exportContactsToVCard,
  getContactDisplayName,
  parseContactsCsv,
  parseVCardFile,
} from "../../lib/contactUtils";
import type { ContactCircle, ContactRecord } from "../../types/contacts";

interface ContactImportExportModalProps {
  open: boolean;
  onClose: () => void;
  contacts: ContactRecord[];
  circles: ContactCircle[];
  onImport: (incoming: Partial<ContactRecord>[]) => number;
  onToast: (text: string, tone?: "neutral" | "success" | "error") => void;
}

export const ContactImportExportModal: React.FC<
  ContactImportExportModalProps
> = ({ open, onClose, contacts, circles, onImport, onToast }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState("");
  const [detectedFormat, setDetectedFormat] = useState<"vcf" | "csv" | null>(
    null,
  );

  const parsedPreview = useMemo(() => {
    const trimmed = rawText.trim();
    if (!trimmed) return [];
    if (
      detectedFormat === "vcf" ||
      /BEGIN:VCARD/i.test(trimmed)
    ) {
      return parseVCardFile(trimmed);
    }
    return parseContactsCsv(trimmed);
  }, [rawText, detectedFormat]);

  if (!open) return null;

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportVcf = () => {
    if (contacts.length === 0) {
      onToast("No contacts to export", "neutral");
      return;
    }
    const vcf = exportContactsToVCard(contacts);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(vcf, `kanso-contacts-${stamp}.vcf`, "text/vcard;charset=utf-8");
    onToast(`Exported ${contacts.length} contacts as vCard (.vcf)`, "success");
  };

  const handleExportCsv = () => {
    if (contacts.length === 0) {
      onToast("No contacts to export", "neutral");
      return;
    }
    const csv = exportContactsToCsv(contacts, circles);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(csv, `kanso-contacts-${stamp}.csv`, "text/csv;charset=utf-8");
    onToast(`Exported ${contacts.length} contacts as CSV`, "success");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setDetectedFormat(
        file.name.toLowerCase().endsWith(".vcf") || /BEGIN:VCARD/i.test(text)
          ? "vcf"
          : "csv",
      );
      setRawText(text);
    } catch {
      onToast("Could not read selected file", "error");
    } finally {
      e.target.value = "";
    }
  };

  const handleConfirmImport = () => {
    if (parsedPreview.length === 0) return;
    const added = onImport(parsedPreview);
    onToast(
      added > 0
        ? `Imported ${added} ${added === 1 ? "contact" : "contacts"}`
        : "All parsed contacts already exist in your directory",
      added > 0 ? "success" : "neutral",
    );
    setRawText("");
    setDetectedFormat(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overscroll-none"
      role="dialog"
      aria-modal="true"
      aria-label="Import and export contacts"
    >
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full sm:max-w-xl max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border overflow-hidden flex flex-col pb-safe sm:pb-0"
        style={{
          backgroundColor: "var(--bg-elevated)",
          borderColor: "var(--border-subtle)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div>
            <h2 className="font-display text-base font-bold">
              Import &amp; Export Contacts
            </h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Supports standard vCard (.vcf) and CSV contact sheets
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
          {/* Export section */}
          <section className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Export Directory ({contacts.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleExportVcf}
                className="h-11 px-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <span className="flex items-center gap-2">
                  <FileUser className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  <span>Export vCard (.vcf)</span>
                </span>
                <Download className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="h-11 px-3.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium transition-colors hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  <span>Export CSV (.csv)</span>
                </span>
                <Download className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
          </section>

          {/* Import section */}
          <section className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Import vCard or CSV
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".vcf,.vcard,.csv,text/vcard,text/csv"
                className="hidden"
                onChange={(e) => void handleFileChange(e)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose .vcf / .csv file</span>
              </button>
            </div>

            <textarea
              value={rawText}
              onChange={(e) => {
                setDetectedFormat(null);
                setRawText(e.target.value);
              }}
              rows={5}
              placeholder={"Paste vCard (BEGIN:VCARD...) or CSV rows (First Name,Last Name,Email,Phone,Birthday...) here, or pick a file above."}
              className="w-full rounded-xl border p-3 text-xs font-mono resize-y outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            />

            {rawText.trim() && (
              <div
                className="p-3 rounded-xl border space-y-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    Preview ({parsedPreview.length}{" "}
                    {parsedPreview.length === 1 ? "contact" : "contacts"} detected)
                  </span>
                  {parsedPreview.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRawText("")}
                      className="text-[11px] hover:underline"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {parsedPreview.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {parsedPreview.slice(0, 12).map((c, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 truncate">
                        <span className="font-medium truncate">
                          {getContactDisplayName({
                            firstName: c.firstName || "",
                            lastName: c.lastName || "",
                            nickname: c.nickname,
                            company: c.company,
                          })}
                        </span>
                        <span className="text-[11px] font-mono truncate" style={{ color: "var(--text-muted)" }}>
                          {c.emails?.[0]?.value || c.phones?.[0]?.value || c.company || ""}
                        </span>
                      </div>
                    ))}
                    {parsedPreview.length > 12 && (
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        +{parsedPreview.length - 12} more...
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No valid vCard or CSV contact rows detected yet.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>

        <div
          className="px-4 sm:px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-xl text-xs font-medium hover:bg-[var(--bg-surface-subtle)]"
            style={{ color: "var(--text-secondary)" }}
          >
            Close
          </button>
          <button
            type="button"
            disabled={parsedPreview.length === 0}
            onClick={handleConfirmImport}
            className="h-9 px-4 rounded-xl text-xs font-semibold disabled:opacity-40 cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            Import {parsedPreview.length > 0 ? parsedPreview.length : ""} Contacts
          </button>
        </div>
      </div>
    </div>
  );
};
