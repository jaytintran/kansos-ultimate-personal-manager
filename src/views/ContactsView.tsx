import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  FileUp,
  Gift,
  LayoutGrid,
  Mail,
  MapPin,
  MoreVertical,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Table2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ContactAvatar } from "../components/contacts/ContactAvatar";
import { ContactImportExportModal } from "../components/contacts/ContactImportExportModal";
import { ContactInspector } from "../components/contacts/ContactInspector";
import { ContactUpcomingStrip } from "../components/contacts/ContactUpcomingStrip";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  CLOSENESS_TIER_META,
  daysSinceDateKey,
  formatMonthDayLabel,
  getContactDisplayName,
  getNextOccurrenceInfo,
} from "../lib/contactUtils";
import type { ContactClosenessTier, ContactRecord } from "../types/contacts";
import { getTodayKey, stripHtmlToText } from "../utils/date";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

const CONTACTS_PREFS_KEY = "kanso_contacts_prefs_v1";

type ContactsLayoutMode = "grid" | "table";
type ContactsSortKey =
  | "name"
  | "closeness"
  | "lastContacted"
  | "birthday"
  | "recent";

interface ContactsPrefs {
  layoutMode: ContactsLayoutMode;
  sortBy: ContactsSortKey;
}

const CIRCLE_SWATCHES = [
  "#be185d",
  "#b45309",
  "#3b6998",
  "#047857",
  "#4f46e5",
  "#0f766e",
  "#7c3aed",
  "#475569",
];

function loadContactsPrefs(): ContactsPrefs {
  try {
    const raw = localStorage.getItem(CONTACTS_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ContactsPrefs>;
      return {
        layoutMode: parsed.layoutMode === "table" ? "table" : "grid",
        sortBy: parsed.sortBy || "name",
      };
    }
  } catch {
    // Ignore
  }
  return { layoutMode: "grid", sortBy: "name" };
}

export const ContactsView: React.FC = () => {
  const {
    workspace,
    addContact,
    updateContact,
    deleteContact,
    importContacts,
    addContactCircle,
    updateContactCircle,
    deleteContactCircle,
    pushToast,
  } = useWorkspace();

  const contacts = workspace.contacts ?? [];
  const circles = workspace.contactCircles ?? [];

  const [prefs, setPrefs] = useState<ContactsPrefs>(loadContactsPrefs);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [selectedCircleId, setSelectedCircleId] = useState<string>("all");
  const [selectedTier, setSelectedTier] = useState<
    ContactClosenessTier | "all"
  >("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    () => contacts[0]?.id ?? null,
  );
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [circlesModalOpen, setCirclesModalOpen] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [newCircleColor, setNewCircleColor] = useState(CIRCLE_SWATCHES[0]);

  const activeFilterCount =
    (onlyFavorites ? 1 : 0) +
    (selectedCircleId !== "all" ? 1 : 0) +
    (selectedTier !== "all" ? 1 : 0) +
    (selectedTag !== "all" ? 1 : 0) +
    (prefs.sortBy !== "name" ? 1 : 0);

  useEffect(() => {
    try {
      localStorage.setItem(CONTACTS_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore
    }
  }, [prefs]);

  useEffect(() => {
    const handleSynced = () => setPrefs(loadContactsPrefs());
    window.addEventListener(VIEW_PREFERENCE_SYNC_EVENT, handleSynced);
    return () =>
      window.removeEventListener(VIEW_PREFERENCE_SYNC_EVENT, handleSynced);
  }, []);

  useEffect(() => {
    if (
      selectedContactId &&
      !contacts.some((c) => c.id === selectedContactId)
    ) {
      setSelectedContactId(contacts[0]?.id ?? null);
      setMobileInspectorOpen(false);
    }
  }, [contacts, selectedContactId]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) {
      for (const t of c.tags) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contacts]);

  const circleMap = useMemo(
    () => new Map(circles.map((c) => [c.id, c])),
    [circles],
  );

  const todayKey = getTodayKey();

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = contacts.filter((c) => {
      if (onlyFavorites && !c.favorite) return false;
      if (
        selectedCircleId !== "all" &&
        !c.circleIds.includes(selectedCircleId)
      ) {
        return false;
      }
      if (selectedTier !== "all" && c.closeness !== selectedTier) return false;
      if (selectedTag !== "all" && !c.tags.includes(selectedTag)) return false;

      if (q) {
        const hay = [
          getContactDisplayName(c),
          c.nickname || "",
          c.company || "",
          c.jobTitle || "",
          ...c.phones.map((p) => p.value),
          ...c.emails.map((e) => e.value),
          ...c.socialHandles.map((s) => s.value),
          ...c.addresses.map(
            (a) => `${a.street} ${a.city || ""} ${a.country || ""}`,
          ),
          ...c.tags,
          ...c.customFields.map((f) => `${f.key} ${f.value}`),
          stripHtmlToText(c.bioHtml),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (prefs.sortBy === "closeness") {
        const diff =
          CLOSENESS_TIER_META[b.closeness].rank -
          CLOSENESS_TIER_META[a.closeness].rank;
        if (diff !== 0) return diff;
      } else if (prefs.sortBy === "lastContacted") {
        const da = a.lastContactedAt || "";
        const db = b.lastContactedAt || "";
        if (da !== db) return db.localeCompare(da);
      } else if (prefs.sortBy === "birthday") {
        const ba =
          getNextOccurrenceInfo(a.birthday, todayKey)?.daysUntil ?? 9999;
        const bb =
          getNextOccurrenceInfo(b.birthday, todayKey)?.daysUntil ?? 9999;
        if (ba !== bb) return ba - bb;
      } else if (prefs.sortBy === "recent") {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return getContactDisplayName(a).localeCompare(getContactDisplayName(b));
    });
    return sorted;
  }, [
    contacts,
    searchQuery,
    onlyFavorites,
    selectedCircleId,
    selectedTier,
    selectedTag,
    prefs.sortBy,
    todayKey,
  ]);

  const selectedContact: ContactRecord | null = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) ?? null,
    [contacts, selectedContactId],
  );

  const handleSelectContact = (id: string) => {
    setSelectedContactId(id);
    setMobileInspectorOpen(true);
  };

  const handleNewContact = () => {
    const created = addContact({
      firstName: "",
      lastName: "",
      circleIds: selectedCircleId !== "all" ? [selectedCircleId] : [],
      closeness: selectedTier !== "all" ? selectedTier : "regular",
    });
    setSelectedContactId(created.id);
    setMobileInspectorOpen(true);
    pushToast("Created new contact profile", "success");
  };

  const handleCreateCircleInModal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCircleName.trim();
    if (!trimmed) return;
    addContactCircle(trimmed, newCircleColor);
    setNewCircleName("");
    pushToast(`Added "${trimmed}" circle`, "success");
  };

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row overflow-hidden">
      {/* Main Directory Column: Single vertical scroll on mobile so header/filters scroll cleanly; split fixed header on desktop */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
        <div className="px-4 pt-3 pb-2.5 sm:p-6 sm:pb-3 space-y-2.5 sm:space-y-3.5 shrink-0">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="font-display text-xl sm:text-3xl font-bold tracking-tight">
                  Contacts
                </h1>
                <span
                  className="text-xs font-mono tabular-nums"
                  style={{ color: "var(--text-muted)" }}
                >
                  {filteredContacts.length}
                  {filteredContacts.length !== contacts.length
                    ? ` / ${contacts.length}`
                    : ""}
                </span>
              </div>
              <p
                className="hidden sm:block text-xs mt-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Personal CRM · Relationships, addresses, milestones &amp; rich
                context
              </p>
            </div>

            {/* Mobile Compact Header Actions (+ Add + Overflow Menu) */}
            <div className="flex sm:hidden items-center gap-1.5 relative shrink-0">
              <button
                type="button"
                onClick={handleNewContact}
                className="h-8 px-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileHeaderMenuOpen((v) => !v)}
                className="h-8 w-8 rounded-xl border flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="More contact actions"
                aria-expanded={mobileHeaderMenuOpen}
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {mobileHeaderMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setMobileHeaderMenuOpen(false)}
                    aria-hidden="true"
                  />
                  <div
                    className="absolute right-0 top-10 z-40 w-48 rounded-xl border p-1.5 space-y-0.5"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-strong)",
                      boxShadow: "var(--shadow-popover)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPrefs((p) => ({
                          ...p,
                          layoutMode:
                            p.layoutMode === "grid" ? "table" : "grid",
                        }));
                        setMobileHeaderMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-[var(--bg-surface-subtle)] text-left"
                    >
                      <span className="flex items-center gap-2">
                        {prefs.layoutMode === "grid" ? (
                          <Table2 className="w-3.5 h-3.5" />
                        ) : (
                          <LayoutGrid className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {prefs.layoutMode === "grid"
                            ? "Switch to Table"
                            : "Switch to Grid"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileHeaderMenuOpen(false);
                        setCirclesModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-[var(--bg-surface-subtle)] text-left"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Manage Circles</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileHeaderMenuOpen(false);
                        setImportExportOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium hover:bg-[var(--bg-surface-subtle)] text-left"
                    >
                      <FileUp className="w-3.5 h-3.5" />
                      <span>Import / Export</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Desktop Full Header Controls */}
            <div className="hidden sm:flex items-center gap-2 flex-wrap">
              <div
                className="inline-flex items-center p-0.5 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, layoutMode: "grid" }))
                  }
                  className="h-8 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor:
                      prefs.layoutMode === "grid"
                        ? "var(--accent-soft)"
                        : "transparent",
                    color:
                      prefs.layoutMode === "grid"
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                  }}
                  aria-label="Card grid view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, layoutMode: "table" }))
                  }
                  className="h-8 px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor:
                      prefs.layoutMode === "table"
                        ? "var(--accent-soft)"
                        : "transparent",
                    color:
                      prefs.layoutMode === "table"
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                  }}
                  aria-label="Table view"
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Table</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCirclesModalOpen(true)}
                className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Circles</span>
              </button>

              <button
                type="button"
                onClick={() => setImportExportOpen(true)}
                className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Import / Export</span>
              </button>

              <button
                type="button"
                onClick={handleNewContact}
                className="h-9 px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                <Plus className="w-4 h-4" />
                <span>New Contact</span>
              </button>
            </div>
          </div>

          {/* Upcoming Birthdays & Anniversaries Strip */}
          <ContactUpcomingStrip
            contacts={contacts}
            selectedId={selectedContactId}
            onSelectContact={handleSelectContact}
          />

          {/* Mobile Search + Filter Bottom Sheet Trigger */}
          <div className="flex sm:hidden items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="w-full h-9 pl-8 pr-8 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--bg-surface-subtle)]"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileFilterSheetOpen(true)}
              className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              style={{
                backgroundColor:
                  activeFilterCount > 0
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                borderColor:
                  activeFilterCount > 0
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                color:
                  activeFilterCount > 0
                    ? "var(--accent)"
                    : "var(--text-secondary)",
              }}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span
                  className="min-w-[16px] h-4 px-1 rounded-full text-[10px] font-mono font-bold inline-flex items-center justify-center"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-fg)",
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Desktop Search & Inline Filters Bar */}
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search people, companies, phones, tags, notes..."
                className="w-full h-9 pl-8 pr-8 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--bg-surface-subtle)]"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOnlyFavorites((v) => !v)}
              className="h-9 px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: onlyFavorites
                  ? "var(--accent-soft)"
                  : "var(--bg-surface)",
                borderColor: onlyFavorites
                  ? "var(--accent)"
                  : "var(--border-subtle)",
                color: onlyFavorites
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              }}
            >
              <Star
                className={`w-3.5 h-3.5 ${onlyFavorites ? "fill-current" : ""}`}
              />
              <span>Favorites</span>
            </button>

            <select
              value={selectedCircleId}
              onChange={(e) => setSelectedCircleId(e.target.value)}
              className="h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
              aria-label="Filter by circle"
            >
              <option value="all">All Circles</option>
              {circles.map((cir) => (
                <option key={cir.id} value={cir.id}>
                  {cir.name}
                </option>
              ))}
            </select>

            <select
              value={selectedTier}
              onChange={(e) =>
                setSelectedTier(e.target.value as ContactClosenessTier | "all")
              }
              className="h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
              aria-label="Filter by closeness"
            >
              <option value="all">All Closeness</option>
              <option value="inner">Inner Circle</option>
              <option value="close">Close</option>
              <option value="regular">Regular</option>
              <option value="acquaintance">Acquaintance</option>
            </select>

            {allTags.length > 0 && (
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="h-9 px-2.5 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
                aria-label="Filter by tag"
              >
                <option value="all">All Tags</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>
                    #{t}
                  </option>
                ))}
              </select>
            )}

            <div
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl border"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <ArrowUpDown
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <select
                value={prefs.sortBy}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...p,
                    sortBy: e.target.value as ContactsSortKey,
                  }))
                }
                className="bg-transparent text-xs outline-none cursor-pointer"
                aria-label="Sort contacts"
              >
                <option value="name">Name (A–Z)</option>
                <option value="closeness">Closeness</option>
                <option value="lastContacted">Last Contacted</option>
                <option value="birthday">Upcoming Birthday</option>
                <option value="recent">Recently Added</option>
              </select>
            </div>
          </div>
        </div>

        {/* Directory Content (scrolls cleanly with header on mobile; independently scrollable on desktop) */}
        <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto px-4 sm:px-6 pb-8">
          {filteredContacts.length === 0 ? (
            <div
              className="mt-6 p-8 rounded-2xl border text-center space-y-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <Users
                className="w-8 h-8 mx-auto"
                style={{ color: "var(--text-muted)" }}
              />
              <div>
                <p className="text-sm font-semibold">
                  {contacts.length === 0
                    ? "Your personal CRM is ready"
                    : "No contacts match these filters"}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {contacts.length === 0
                    ? "Add people manually or import a vCard (.vcf) / CSV file."
                    : "Try clearing search or switching filters."}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                {contacts.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={handleNewContact}
                      className="h-9 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      Add First Contact
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportExportOpen(true)}
                      className="h-9 px-3.5 rounded-xl border text-xs font-medium cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      Import .vcf / .csv
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setOnlyFavorites(false);
                      setSelectedCircleId("all");
                      setSelectedTier("all");
                      setSelectedTag("all");
                    }}
                    className="h-9 px-4 rounded-xl border text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          ) : prefs.layoutMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredContacts.map((c) => {
                const isSelected = c.id === selectedContactId;
                const displayName = getContactDisplayName(c);
                const roleCompany = [c.jobTitle, c.company]
                  .filter(Boolean)
                  .join(" · ");
                const primaryPhone = c.phones[0]?.value;
                const primaryEmail = c.emails[0]?.value;
                const primaryCity = c.addresses[0]
                  ? [c.addresses[0].city, c.addresses[0].country]
                      .filter(Boolean)
                      .join(", ") || c.addresses[0].street
                  : "";
                const daysSince = daysSinceDateKey(c.lastContactedAt, todayKey);
                const nextBday = getNextOccurrenceInfo(c.birthday, todayKey);
                const contactCircles = c.circleIds
                  .map((id) => circleMap.get(id))
                  .filter(Boolean);

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectContact(c.id)}
                    className="p-3 sm:p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2 sm:gap-3 hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                    style={{
                      backgroundColor: isSelected
                        ? "var(--accent-soft)"
                        : "var(--bg-surface)",
                      borderColor: isSelected
                        ? "var(--accent)"
                        : "var(--border-subtle)",
                    }}
                  >
                    <div className="space-y-1.5 sm:space-y-2.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                          <ContactAvatar contact={c} size="md" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-display font-bold text-sm truncate">
                                {displayName}
                              </span>
                              {c.favorite && (
                                <Star
                                  className="w-3.5 h-3.5 shrink-0 fill-current"
                                  style={{ color: "var(--warning)" }}
                                />
                              )}
                            </div>
                            {roleCompany && (
                              <div
                                className="text-xs truncate mt-0.5"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {roleCompany}
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                          style={{
                            backgroundColor:
                              CLOSENESS_TIER_META[c.closeness].color,
                          }}
                          title={CLOSENESS_TIER_META[c.closeness].label}
                        />
                      </div>

                      <div
                        className="space-y-0.5 sm:space-y-1 text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {primaryPhone && (
                          <div className="flex items-center gap-2 truncate font-mono">
                            <Phone
                              className="w-3 h-3 shrink-0"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <span className="truncate">{primaryPhone}</span>
                          </div>
                        )}
                        {primaryEmail && (
                          <div className="flex items-center gap-2 truncate">
                            <Mail
                              className="w-3 h-3 shrink-0"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <span className="truncate">{primaryEmail}</span>
                          </div>
                        )}
                        {primaryCity && (
                          <div className="flex items-center gap-2 truncate">
                            <MapPin
                              className="w-3 h-3 shrink-0"
                              style={{ color: "var(--text-muted)" }}
                            />
                            <span className="truncate">{primaryCity}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div
                      className="pt-2 sm:pt-2.5 border-t flex items-center justify-between gap-2 text-[11px]"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        {contactCircles.slice(0, 2).map((cir) => (
                          <span
                            key={cir!.id}
                            className="inline-flex items-center gap-1 truncate"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: cir!.color }}
                            />
                            <span className="truncate">{cir!.name}</span>
                          </span>
                        ))}
                        {contactCircles.length === 0 && (
                          <span>{CLOSENESS_TIER_META[c.closeness].label}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                        {nextBday && nextBday.daysUntil <= 30 && (
                          <span
                            className="inline-flex items-center gap-1"
                            style={{ color: "var(--accent)" }}
                          >
                            <Gift className="w-3 h-3" />
                            {nextBday.daysUntil === 0
                              ? "Today"
                              : `${nextBday.daysUntil}d`}
                          </span>
                        )}
                        {daysSince !== null && (
                          <span>
                            {daysSince === 0 ? "Today" : `${daysSince}d ago`}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="rounded-2xl border overflow-x-auto"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <table className="w-full text-left border-collapse min-w-[680px]">
                <thead>
                  <tr
                    className="border-b text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    <th className="py-2.5 px-3.5">Person</th>
                    <th className="py-2.5 px-3">Role &amp; Company</th>
                    <th className="py-2.5 px-3">Circles &amp; Tier</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3">Birthday</th>
                    <th className="py-2.5 px-3.5 text-right">Last Contacted</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {filteredContacts.map((c) => {
                    const isSelected = c.id === selectedContactId;
                    const daysSince = daysSinceDateKey(
                      c.lastContactedAt,
                      todayKey,
                    );
                    const contactCircles = c.circleIds
                      .map((id) => circleMap.get(id))
                      .filter(Boolean);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => handleSelectContact(c.id)}
                        className="transition-colors hover:bg-[var(--bg-surface-hover)] cursor-pointer"
                        style={{
                          backgroundColor: isSelected
                            ? "var(--accent-soft)"
                            : undefined,
                        }}
                      >
                        <td className="py-2.5 px-3.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ContactAvatar contact={c} size="xs" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 text-xs font-semibold truncate">
                                <span>{getContactDisplayName(c)}</span>
                                {c.favorite && (
                                  <Star
                                    className="w-3 h-3 fill-current shrink-0"
                                    style={{ color: "var(--warning)" }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3 text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {[c.jobTitle, c.company]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  CLOSENESS_TIER_META[c.closeness].color,
                              }}
                            />
                            <span>
                              {contactCircles
                                .map((cir) => cir!.name)
                                .join(", ") ||
                                CLOSENESS_TIER_META[c.closeness].label}
                            </span>
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3 text-xs font-mono"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {c.phones[0]?.value || c.emails[0]?.value || "—"}
                        </td>
                        <td
                          className="py-2.5 px-3 text-xs font-mono tabular-nums"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {c.birthday ? formatMonthDayLabel(c.birthday) : "—"}
                        </td>
                        <td
                          className="py-2.5 px-3.5 text-xs font-mono tabular-nums text-right"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {daysSince === null
                            ? "—"
                            : daysSince === 0
                              ? "Today"
                              : `${daysSince}d ago`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Docked Side Inspector */}
      {selectedContact && (
        <aside
          className="hidden lg:block w-[420px] xl:w-[460px] shrink-0 border-l h-full min-h-0 overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <ContactInspector
            contact={selectedContact}
            allContacts={contacts}
            circles={circles}
            onUpdate={updateContact}
            onDelete={deleteContact}
            onSelectContact={handleSelectContact}
            onAddCircle={(name, color) => addContactCircle(name, color)}
            onClose={() => setSelectedContactId(null)}
            onToast={pushToast}
          />
        </aside>
      )}

      {/* Mobile Slide-Over Inspector */}
      {selectedContact && mobileInspectorOpen && (
        <div
          className="lg:hidden w-full fixed inset-0 z-40 flex justify-end overscroll-none"
          role="dialog"
          aria-modal="true"
          aria-label="Contact Inspector"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMobileInspectorOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-full h-dvh pt-safe pb-safe">
            <ContactInspector
              contact={selectedContact}
              allContacts={contacts}
              circles={circles}
              onUpdate={updateContact}
              onDelete={deleteContact}
              onSelectContact={handleSelectContact}
              onAddCircle={(name, color) => addContactCircle(name, color)}
              onClose={() => setMobileInspectorOpen(false)}
              onToast={pushToast}
            />
          </div>
        </div>
      )}

      {/* Import / Export Modal */}
      <ContactImportExportModal
        open={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        contacts={contacts}
        circles={circles}
        onImport={importContacts}
        onToast={pushToast}
      />

      {/* Circles Manager Modal */}
      {circlesModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 overscroll-none"
          role="dialog"
          aria-modal="true"
          aria-label="Manage relationship circles"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setCirclesModalOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border overflow-hidden pb-safe sm:pb-0"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3.5 border-b"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <h2 className="font-display text-base font-bold">
                Relationship Circles
              </h2>
              <button
                type="button"
                onClick={() => setCirclesModalOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)]"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 max-h-[70dvh] overflow-y-auto">
              <form
                onSubmit={handleCreateCircleInModal}
                className="space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCircleName}
                    onChange={(e) => setNewCircleName(e.target.value)}
                    placeholder="New circle name (e.g. Mentors, Clients)..."
                    className="flex-1 h-9 px-3 rounded-xl border text-xs outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                  <button
                    type="submit"
                    className="h-9 px-3.5 rounded-xl text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-fg)",
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {CIRCLE_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setNewCircleColor(hex)}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                        newCircleColor === hex ? "scale-110" : "opacity-75"
                      }`}
                      style={{
                        backgroundColor: hex,
                        borderColor:
                          newCircleColor === hex
                            ? "var(--text-primary)"
                            : "transparent",
                      }}
                      aria-label={`Color ${hex}`}
                    />
                  ))}
                </div>
              </form>

              <div className="space-y-2">
                {circles.map((cir) => {
                  const memberCount = contacts.filter((c) =>
                    c.circleIds.includes(cir.id),
                  ).length;
                  return (
                    <div
                      key={cir.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          type="color"
                          value={cir.color}
                          onChange={(e) =>
                            updateContactCircle(cir.id, {
                              color: e.target.value,
                            })
                          }
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent shrink-0"
                          aria-label={`Color for ${cir.name}`}
                        />
                        <input
                          type="text"
                          value={cir.name}
                          onChange={(e) =>
                            updateContactCircle(cir.id, {
                              name: e.target.value,
                            })
                          }
                          className="flex-1 min-w-0 h-7 px-2 rounded-lg border text-xs font-medium outline-none focus:border-[var(--accent)]"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border-subtle)",
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] font-mono tabular-nums shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {memberCount}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteContactCircle(cir.id)}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        title="Delete circle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Filters Bottom Sheet */}
      {mobileFilterSheetOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 flex items-end overscroll-none"
          role="dialog"
          aria-modal="true"
          aria-label="Filter and sort contacts"
        >
          <div
            className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setMobileFilterSheetOpen(false)}
            aria-hidden="true"
          />
          <div
            className="relative z-10 w-full rounded-t-2xl border-t pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-2.5 px-4 space-y-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-strong)",
              boxShadow: "var(--shadow-popover)",
            }}
          >
            <div className="flex justify-center">
              <span
                className="w-10 h-1 rounded-full"
                style={{ backgroundColor: "var(--border-strong)" }}
                aria-hidden="true"
              />
            </div>

            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold">
                Filter &amp; Sort Contacts
              </h2>
              <button
                type="button"
                onClick={() => setMobileFilterSheetOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg"
                style={{ color: "var(--text-muted)" }}
                aria-label="Close filters"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-[65dvh] overflow-y-auto">
              <button
                type="button"
                onClick={() => setOnlyFavorites((v) => !v)}
                className="w-full h-10 px-3 rounded-xl border text-xs font-medium flex items-center justify-between cursor-pointer"
                style={{
                  backgroundColor: onlyFavorites
                    ? "var(--accent-soft)"
                    : "var(--bg-surface)",
                  borderColor: onlyFavorites
                    ? "var(--accent)"
                    : "var(--border-subtle)",
                  color: onlyFavorites
                    ? "var(--accent)"
                    : "var(--text-primary)",
                }}
              >
                <span className="flex items-center gap-2">
                  <Star
                    className={`w-3.5 h-3.5 ${onlyFavorites ? "fill-current" : ""}`}
                  />
                  <span>Favorites Only</span>
                </span>
                <span className="text-[11px] font-mono">
                  {onlyFavorites ? "ON" : "OFF"}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Circle
                  </label>
                  <select
                    value={selectedCircleId}
                    onChange={(e) => setSelectedCircleId(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <option value="all">All Circles</option>
                    {circles.map((cir) => (
                      <option key={cir.id} value={cir.id}>
                        {cir.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Closeness
                  </label>
                  <select
                    value={selectedTier}
                    onChange={(e) =>
                      setSelectedTier(
                        e.target.value as ContactClosenessTier | "all",
                      )
                    }
                    className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <option value="all">All Closeness</option>
                    <option value="inner">Inner Circle</option>
                    <option value="close">Close</option>
                    <option value="regular">Regular</option>
                    <option value="acquaintance">Acquaintance</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {allTags.length > 0 && (
                  <div className="space-y-1">
                    <label
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Tag
                    </label>
                    <select
                      value={selectedTag}
                      onChange={(e) => setSelectedTag(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <option value="all">All Tags</option>
                      {allTags.map((t) => (
                        <option key={t} value={t}>
                          #{t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div
                  className={`space-y-1 ${allTags.length === 0 ? "col-span-2" : ""}`}
                >
                  <label
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Sort By
                  </label>
                  <select
                    value={prefs.sortBy}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        sortBy: e.target.value as ContactsSortKey,
                      }))
                    }
                    className="w-full h-9 px-2.5 rounded-xl border text-xs outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <option value="name">Name (A–Z)</option>
                    <option value="closeness">Closeness</option>
                    <option value="lastContacted">Last Contacted</option>
                    <option value="birthday">Upcoming Birthday</option>
                    <option value="recent">Recently Added</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setOnlyFavorites(false);
                  setSelectedCircleId("all");
                  setSelectedTier("all");
                  setSelectedTag("all");
                  setPrefs((p) => ({ ...p, sortBy: "name" }));
                }}
                className="h-10 px-4 rounded-xl border text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterSheetOpen(false)}
                className="flex-1 h-10 rounded-xl text-xs font-semibold cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
              >
                Apply ({filteredContacts.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
