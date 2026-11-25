import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  Check,
  CheckCircle2,
  Copy,
  FileUp,
  Mail,
  Menu,
  MoreVertical,
  PanelLeftOpen,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ContactAvatar } from "../components/contacts/ContactAvatar";
import { ContactImportExportModal } from "../components/contacts/ContactImportExportModal";
import { ContactInspector } from "../components/contacts/ContactInspector";
import {
  ContactsLeftSidebar,
  type ContactsScope,
} from "../components/contacts/ContactsLeftSidebar";
import { ContactUpcomingStrip } from "../components/contacts/ContactUpcomingStrip";
import { useWorkspace } from "../context/WorkspaceContext";
import {
  buildMailtoHref,
  buildTelHref,
  CLOSENESS_TIER_META,
  getContactDisplayName,
  getContactFreshness,
  getContactPrimaryCopyTarget,
  getNextOccurrenceInfo,
  getPrimaryLabeledValue,
} from "../lib/contactUtils";
import type {
  ContactCheckInLog,
  ContactClosenessTier,
  ContactRecord,
} from "../types/contacts";
import { getTodayKey, stripHtmlToText } from "../utils/date";
import { VIEW_PREFERENCE_SYNC_EVENT } from "../utils/viewPreferences";

const CONTACTS_PREFS_KEY = "kanso_contacts_prefs_v1";

type ContactsSortKey =
  | "name"
  | "closeness"
  | "lastContacted"
  | "birthday"
  | "recent";

interface ContactsPrefs {
  sortBy: ContactsSortKey;
  sidebarCollapsed: boolean;
  milestonesCollapsed: boolean;
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
        sortBy: parsed.sortBy || "name",
        sidebarCollapsed: Boolean(parsed.sidebarCollapsed),
        milestonesCollapsed:
          typeof parsed.milestonesCollapsed === "boolean"
            ? parsed.milestonesCollapsed
            : false,
      };
    }
  } catch {
    // Ignore
  }
  return {
    sortBy: "name",
    sidebarCollapsed: false,
    milestonesCollapsed: false,
  };
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
  const [scope, setScope] = useState<ContactsScope>({ kind: "all" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    () => contacts[0]?.id ?? null,
  );
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [circlesModalOpen, setCirclesModalOpen] = useState(false);
  const [newCircleName, setNewCircleName] = useState("");
  const [newCircleColor, setNewCircleColor] = useState(CIRCLE_SWATCHES[0]);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

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

  const todayKey = getTodayKey();

  const circleMap = useMemo(
    () => new Map(circles.map((c) => [c.id, c])),
    [circles],
  );

  // Sidebar live counts
  const sidebarMetrics = useMemo(() => {
    let favoritesCount = 0;
    let catchUpCount = 0;
    let milestonesCount = 0;
    const tierCounts: Record<ContactClosenessTier, number> = {
      inner: 0,
      close: 0,
      regular: 0,
      acquaintance: 0,
    };
    const circleCounts = new Map<string, number>();
    const tagMap = new Map<string, number>();

    for (const c of contacts) {
      if (c.favorite) favoritesCount++;
      const fresh = getContactFreshness(c, todayKey);
      if (fresh.status === "overdue" || fresh.status === "due-soon") {
        catchUpCount++;
      }
      const bday = getNextOccurrenceInfo(c.birthday, todayKey);
      const anniv = getNextOccurrenceInfo(c.anniversary, todayKey);
      if (
        (bday && bday.daysUntil <= 45) ||
        (anniv && anniv.daysUntil <= 45)
      ) {
        milestonesCount++;
      }
      tierCounts[c.closeness] = (tierCounts[c.closeness] ?? 0) + 1;
      for (const cid of c.circleIds) {
        circleCounts.set(cid, (circleCounts.get(cid) ?? 0) + 1);
      }
      for (const t of c.tags) {
        tagMap.set(t, (tagMap.get(t) ?? 0) + 1);
      }
    }

    const tags = Array.from(tagMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      favoritesCount,
      catchUpCount,
      milestonesCount,
      tierCounts,
      circleCounts,
      tags,
    };
  }, [contacts, todayKey]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = contacts.filter((c) => {
      if (scope.kind === "favorites" && !c.favorite) return false;
      if (scope.kind === "catchup") {
        const fresh = getContactFreshness(c, todayKey);
        if (fresh.status !== "overdue" && fresh.status !== "due-soon") {
          return false;
        }
      }
      if (scope.kind === "milestones") {
        const bday = getNextOccurrenceInfo(c.birthday, todayKey);
        const anniv = getNextOccurrenceInfo(c.anniversary, todayKey);
        if (
          !(bday && bday.daysUntil <= 45) &&
          !(anniv && anniv.daysUntil <= 45)
        ) {
          return false;
        }
      }
      if (
        scope.kind === "circle" &&
        !c.circleIds.includes(scope.circleId)
      ) {
        return false;
      }
      if (scope.kind === "tier" && c.closeness !== scope.tier) {
        return false;
      }
      if (scope.kind === "tag" && !c.tags.includes(scope.tag)) {
        return false;
      }

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
  }, [contacts, scope, searchQuery, prefs.sortBy, todayKey]);

  const activeScopeTitle = useMemo(() => {
    if (scope.kind === "all") return "All Contacts";
    if (scope.kind === "favorites") return "Favorites";
    if (scope.kind === "catchup") return "Needs Catch-Up";
    if (scope.kind === "milestones") return "Upcoming Milestones";
    if (scope.kind === "circle") {
      return circleMap.get(scope.circleId)?.name ?? "Circle";
    }
    if (scope.kind === "tier") {
      return CLOSENESS_TIER_META[scope.tier].label;
    }
    return `#${scope.tag}`;
  }, [scope, circleMap]);

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
      favorite: scope.kind === "favorites",
      circleIds: scope.kind === "circle" ? [scope.circleId] : [],
      closeness: scope.kind === "tier" ? scope.tier : "regular",
      tags: scope.kind === "tag" ? [scope.tag] : [],
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

  const handleCopyPrimaryFromRow = async (
    e: React.MouseEvent,
    contact: ContactRecord,
  ) => {
    e.stopPropagation();
    const target = getContactPrimaryCopyTarget(contact);
    if (!target) {
      pushToast("No phone or email saved", "neutral");
      return;
    }
    try {
      await navigator.clipboard.writeText(target.value);
      setCopiedRowId(contact.id);
      pushToast(`Copied ${target.label}: ${target.value}`, "success");
      window.setTimeout(
        () => setCopiedRowId((prev) => (prev === contact.id ? null : prev)),
        1500,
      );
    } catch {
      pushToast("Copy failed", "error");
    }
  };

  const handleRowCheckIn = (e: React.MouseEvent, contact: ContactRecord) => {
    e.stopPropagation();
    const logEntry: ContactCheckInLog = {
      id: `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      date: todayKey,
      channel: "call",
      note: "Quick check-in logged",
      createdAt: new Date().toISOString(),
    };
    const nextLast =
      !contact.lastContactedAt || todayKey >= contact.lastContactedAt
        ? todayKey
        : contact.lastContactedAt;
    updateContact(contact.id, {
      lastContactedAt: nextLast,
      checkInLogs: [logEntry, ...(contact.checkInLogs ?? [])],
    });
    pushToast(`Checked in with ${getContactDisplayName(contact)}`, "success");
  };

  return (
    <div className="h-full flex-1 min-h-0 lg:h-dvh flex overflow-hidden overscroll-none">
      {/* Pane 1: Left Circles & Smart Views Rail */}
      <ContactsLeftSidebar
        scope={scope}
        onSelectScope={setScope}
        totalCount={contacts.length}
        favoritesCount={sidebarMetrics.favoritesCount}
        catchUpCount={sidebarMetrics.catchUpCount}
        milestonesCount={sidebarMetrics.milestonesCount}
        tierCounts={sidebarMetrics.tierCounts}
        circles={circles}
        circleCounts={sidebarMetrics.circleCounts}
        tags={sidebarMetrics.tags}
        isCollapsedDesktop={prefs.sidebarCollapsed}
        onCollapseDesktop={() =>
          setPrefs((p) => ({ ...p, sidebarCollapsed: true }))
        }
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onCreateCircle={(name, color) => addContactCircle(name, color)}
        onOpenManageCircles={() => setCirclesModalOpen(true)}
      />

      {/* Pane 2: Center Directory Column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {/* Sticky Top Directory Header + Search */}
        <div
          className="px-4 sm:px-5 pt-3.5 pb-3 border-b space-y-2.5 shrink-0"
          style={{
            backgroundColor: "var(--bg-canvas)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile Sidebar Drawer Button */}
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden h-9 w-9 -ml-1 rounded-xl border flex items-center justify-center shrink-0 cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
                aria-label="Open circles and filters"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Desktop Sidebar Expand Button (when collapsed) */}
              {prefs.sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() =>
                    setPrefs((p) => ({ ...p, sidebarCollapsed: false }))
                  }
                  className="hidden lg:flex h-9 w-9 rounded-xl border items-center justify-center shrink-0 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-secondary)",
                  }}
                  title="Expand circles sidebar"
                  aria-label="Expand circles sidebar"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}

              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <h1 className="font-display text-lg sm:text-2xl font-bold tracking-tight truncate">
                    {activeScopeTitle}
                  </h1>
                  <span
                    className="text-xs font-mono tabular-nums shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {filteredContacts.length}
                    {filteredContacts.length !== contacts.length
                      ? ` / ${contacts.length}`
                      : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Compact Header Actions */}
            <div className="flex sm:hidden items-center gap-1.5 relative shrink-0">
              <button
                type="button"
                onClick={handleNewContact}
                className="h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
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
                className="h-9 w-9 rounded-xl border flex items-center justify-center cursor-pointer"
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
                    className="absolute right-0 top-11 z-40 w-48 rounded-xl border p-1.5 space-y-0.5"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-strong)",
                      boxShadow: "var(--shadow-popover)",
                    }}
                  >
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

            {/* Desktop Header Actions */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
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

          {/* Search & Sort Row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, role, company, phone, email, tag..."
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
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl border shrink-0"
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

          {/* Collapsible Subtle Upcoming Milestones Banner */}
          <ContactUpcomingStrip
            contacts={contacts}
            selectedId={selectedContactId}
            collapsed={prefs.milestonesCollapsed}
            onToggleCollapsed={() =>
              setPrefs((p) => ({
                ...p,
                milestonesCollapsed: !p.milestonesCollapsed,
              }))
            }
            onSelectContact={handleSelectContact}
          />
        </div>

        {/* Scrollable Compact Directory List */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-3 pb-10">
          {filteredContacts.length === 0 ? (
            <div
              className="mt-4 p-8 rounded-2xl border text-center space-y-3"
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
                    : "No contacts match this view"}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {contacts.length === 0
                    ? "Add people manually or import a vCard (.vcf) / CSV file."
                    : "Try clearing search or switching back to All Contacts."}
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
                      setScope({ kind: "all" });
                    }}
                    className="h-9 px-4 rounded-xl border text-xs font-medium cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    Show All Contacts
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border overflow-hidden divide-y"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {filteredContacts.map((c) => {
                const isSelected = c.id === selectedContactId;
                const displayName = getContactDisplayName(c);
                const roleCompany = [c.jobTitle, c.company]
                  .filter(Boolean)
                  .join(" · ");
                const primaryPhone = getPrimaryLabeledValue(c.phones);
                const primaryEmail = getPrimaryLabeledValue(c.emails);
                const primaryCopy = getContactPrimaryCopyTarget(c);
                const freshness = getContactFreshness(c, todayKey);
                const contactCircles = c.circleIds
                  .map((id) => circleMap.get(id))
                  .filter(Boolean);

                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectContact(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectContact(c.id);
                      }
                    }}
                    className="group relative min-h-[56px] px-3.5 py-2.5 flex items-center justify-between gap-3 transition-colors hover:bg-[var(--bg-surface-hover)] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--accent)] cursor-pointer"
                    style={{
                      backgroundColor: isSelected
                        ? "var(--accent-soft)"
                        : undefined,
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    {/* Left: Avatar + Identity */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ContactAvatar contact={c} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-semibold text-sm truncate">
                            {displayName}
                          </span>
                          {c.favorite && (
                            <Star
                              className="w-3.5 h-3.5 shrink-0 fill-current"
                              style={{ color: "var(--warning)" }}
                            />
                          )}
                        </div>
                        <div
                          className="text-xs truncate mt-0.5 flex items-center gap-1.5"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {roleCompany ? (
                            <span className="truncate">{roleCompany}</span>
                          ) : primaryPhone || primaryEmail ? (
                            <span className="font-mono truncate">
                              {primaryPhone?.value || primaryEmail?.value}
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>
                              {CLOSENESS_TIER_META[c.closeness].label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle: Secondary Reach & Circle Metadata (Desktop/Tablet) */}
                    <div className="hidden md:flex flex-col items-end justify-center min-w-0 max-w-[200px] text-right shrink-0">
                      {(primaryPhone || primaryEmail) && (
                        <span
                          className="text-xs font-mono truncate max-w-full"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {primaryPhone?.value || primaryEmail?.value}
                        </span>
                      )}
                      <div
                        className="text-[11px] truncate max-w-full flex items-center justify-end gap-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {contactCircles.slice(0, 2).map((cir, idx) => (
                          <React.Fragment key={cir!.id}>
                            {idx > 0 && <span aria-hidden="true">·</span>}
                            <span className="inline-flex items-center gap-1 truncate">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: cir!.color }}
                              />
                              <span className="truncate">{cir!.name}</span>
                            </span>
                          </React.Fragment>
                        ))}
                        {contactCircles.length === 0 && (
                          <span>{CLOSENESS_TIER_META[c.closeness].label}</span>
                        )}
                      </div>
                    </div>

                    {/* Right: Freshness Indicator + Desktop Hover Quick Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Hover Quick Actions (Desktop) */}
                      <div
                        className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {primaryPhone && (
                          <a
                            href={buildTelHref(primaryPhone.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface)]"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--accent)",
                            }}
                            title={`Call ${primaryPhone.value}`}
                            aria-label={`Call ${displayName}`}
                          >
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {primaryEmail && (
                          <a
                            href={buildMailtoHref(primaryEmail.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface)]"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--accent)",
                            }}
                            title={`Email ${primaryEmail.value}`}
                            aria-label={`Email ${displayName}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {primaryCopy && (
                          <button
                            type="button"
                            onClick={(e) => void handleCopyPrimaryFromRow(e, c)}
                            className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface)] cursor-pointer"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-secondary)",
                            }}
                            title={`Copy ${primaryCopy.value}`}
                            aria-label={`Copy primary contact for ${displayName}`}
                          >
                            {copiedRowId === c.id ? (
                              <Check
                                className="w-3.5 h-3.5"
                                style={{ color: "var(--success)" }}
                              />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleRowCheckIn(e, c)}
                          className="h-7 w-7 rounded-lg border flex items-center justify-center hover:bg-[var(--bg-surface)] cursor-pointer"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-secondary)",
                          }}
                          title="Log check-in today"
                          aria-label={`Log check-in for ${displayName}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Freshness Status (Dot + Explicit Text) */}
                      <div
                        className="inline-flex items-center gap-1.5 min-w-[54px] justify-end text-[11px] font-mono tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                        title={freshness.label}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: freshness.dotColor }}
                        />
                        <span>{freshness.shortLabel}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pane 3 (Desktop): Docked Right Profile Inspector */}
      {selectedContact && (
        <aside
          className="hidden lg:block w-[420px] xl:w-[460px] shrink-0 border-l h-full min-h-0 overflow-hidden"
          style={{ borderColor: "var(--border-subtle)" }}
          aria-label="Contact profile inspector"
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

      {/* Pane 3 (Mobile): Full-Screen Push-Page Profile View */}
      {selectedContact && mobileInspectorOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 w-full h-dvh pt-safe flex flex-col overflow-hidden overscroll-none"
          style={{ backgroundColor: "var(--bg-canvas)" }}
          role="dialog"
          aria-modal="true"
          aria-label="Contact Profile"
        >
          <ContactInspector
            contact={selectedContact}
            allContacts={contacts}
            circles={circles}
            isMobileFullScreen
            onUpdate={updateContact}
            onDelete={deleteContact}
            onSelectContact={handleSelectContact}
            onAddCircle={(name, color) => addContactCircle(name, color)}
            onClose={() => setMobileInspectorOpen(false)}
            onToast={pushToast}
          />
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
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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
    </div>
  );
};
