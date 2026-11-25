import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Gift,
  Heart,
  Link2,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  Plus,
  Share2,
  Star,
  Tag,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  buildAddressMapsUrl,
  buildMailtoHref,
  buildTelHref,
  CHECKIN_CHANNEL_META,
  CLOSENESS_TIER_META,
  compressContactPhotoFile,
  formatContactAddressOneLine,
  getContactDisplayName,
  getContactFreshness,
  getContactPrimaryCopyTarget,
  getNextOccurrenceInfo,
  getPrimaryLabeledValue,
} from "../../lib/contactUtils";
import { CONTACT_PHOTO_CHANGE_EVENT, contactPhotoDb } from "../../lib/db";
import type {
  ContactAddress,
  ContactCheckInChannel,
  ContactCheckInLog,
  ContactCircle,
  ContactClosenessTier,
  ContactCustomField,
  ContactLabeledValue,
  ContactRecord,
  ContactRelationshipLink,
} from "../../types/contacts";
import { getTodayKey } from "../../utils/date";
import { TiptapEditor } from "../TiptapEditor";
import { ContactAvatar } from "./ContactAvatar";
import { InlineEditableText } from "./InlineEditableText";

export type ContactInspectorTab = "overview" | "contact" | "notes" | "links";

interface ContactInspectorProps {
  contact: ContactRecord;
  allContacts: ContactRecord[];
  circles: ContactCircle[];
  isMobileFullScreen?: boolean;
  onUpdate: (id: string, patch: Partial<ContactRecord>) => void;
  onDelete: (id: string) => void;
  onSelectContact: (id: string) => void;
  onAddCircle: (name: string, color: string) => ContactCircle;
  onClose: () => void;
  onToast: (text: string, tone?: "neutral" | "success" | "error") => void;
}

const QUICK_CIRCLE_COLORS = [
  "#be185d",
  "#b45309",
  "#3b6998",
  "#047857",
  "#4f46e5",
  "#0f766e",
];

const CHECKIN_CHANNELS: ContactCheckInChannel[] = [
  "call",
  "message",
  "email",
  "in-person",
  "video",
  "other",
];

function makeItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const ContactInspector: React.FC<ContactInspectorProps> = ({
  contact,
  allContacts,
  circles,
  isMobileFullScreen = false,
  onUpdate,
  onDelete,
  onSelectContact,
  onAddCircle,
  onClose,
  onToast,
}) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ContactInspectorTab>("overview");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [newCircleName, setNewCircleName] = useState("");
  const [addingCircle, setAddingCircle] = useState(false);

  // Check-In log composer state
  const todayKey = getTodayKey();
  const [checkInDate, setCheckInDate] = useState(todayKey);
  const [checkInChannel, setCheckInChannel] =
    useState<ContactCheckInChannel>("call");
  const [checkInNote, setCheckInNote] = useState("");

  // Relationship quick-add form
  const [addingRel, setAddingRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState("");
  const [relCustomName, setRelCustomName] = useState("");
  const [relRole, setRelRole] = useState("");

  useEffect(() => {
    setConfirmDelete(false);
    setAddingRel(false);
    setTagDraft("");
    setCheckInDate(getTodayKey());
    setCheckInNote("");
  }, [contact.id]);

  useEffect(() => {
    let active = true;
    const check = () => {
      void contactPhotoDb.getPhoto(contact.id).then((url) => {
        if (active) setHasPhoto(Boolean(url));
      });
    };
    check();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ contactId?: string }>).detail;
      if (!detail?.contactId || detail.contactId === contact.id) {
        check();
      }
    };
    window.addEventListener(CONTACT_PHOTO_CHANGE_EVENT, handler);
    return () => {
      active = false;
      window.removeEventListener(CONTACT_PHOTO_CHANGE_EVENT, handler);
    };
  }, [contact.id]);

  const displayName = getContactDisplayName(contact);
  const freshness = useMemo(
    () => getContactFreshness(contact, todayKey),
    [contact, todayKey],
  );
  const nextBday = useMemo(
    () => getNextOccurrenceInfo(contact.birthday, todayKey),
    [contact.birthday, todayKey],
  );
  const nextAnniv = useMemo(
    () => getNextOccurrenceInfo(contact.anniversary, todayKey),
    [contact.anniversary, todayKey],
  );

  const primaryPhone = useMemo(
    () => getPrimaryLabeledValue(contact.phones),
    [contact.phones],
  );
  const primaryEmail = useMemo(
    () => getPrimaryLabeledValue(contact.emails),
    [contact.emails],
  );
  const primaryCopyTarget = useMemo(
    () => getContactPrimaryCopyTarget(contact),
    [contact],
  );

  const checkInLogs = useMemo(() => {
    const logs = contact.checkInLogs ?? [];
    return [...logs].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [contact.checkInLogs]);

  const contactsById = useMemo(
    () => new Map(allContacts.map((c) => [c.id, c])),
    [allContacts],
  );

  const otherContacts = useMemo(
    () =>
      allContacts
        .filter((c) => c.id !== contact.id)
        .sort((a, b) =>
          getContactDisplayName(a).localeCompare(getContactDisplayName(b)),
        ),
    [allContacts, contact.id],
  );

  const handleCopy = async (key: string, text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      onToast(`Copied ${label}`, "success");
      window.setTimeout(
        () => setCopiedId((prev) => (prev === key ? null : prev)),
        1600,
      );
    } catch {
      onToast("Copy failed", "error");
    }
  };

  const handleQuickCheckIn = () => {
    const entry: ContactCheckInLog = {
      id: makeItemId("chk"),
      date: todayKey,
      channel: "call",
      note: "Quick check-in logged",
      createdAt: new Date().toISOString(),
    };
    const nextLast =
      !contact.lastContactedAt || todayKey >= contact.lastContactedAt
        ? todayKey
        : contact.lastContactedAt;
    onUpdate(contact.id, {
      lastContactedAt: nextLast,
      checkInLogs: [entry, ...(contact.checkInLogs ?? [])],
    });
    onToast(`Logged check-in for ${displayName}`, "success");
  };

  const handleSubmitCheckInLog = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = checkInNote.trim();
    const dateVal = checkInDate || todayKey;
    const entry: ContactCheckInLog = {
      id: makeItemId("chk"),
      date: dateVal,
      channel: checkInChannel,
      note:
        trimmed ||
        `${CHECKIN_CHANNEL_META[checkInChannel].label} check-in`,
      createdAt: new Date().toISOString(),
    };
    const nextLast =
      !contact.lastContactedAt || dateVal >= contact.lastContactedAt
        ? dateVal
        : contact.lastContactedAt;
    onUpdate(contact.id, {
      lastContactedAt: nextLast,
      checkInLogs: [entry, ...(contact.checkInLogs ?? [])],
    });
    setCheckInNote("");
    onToast("Check-in saved", "success");
  };

  const handleDeleteCheckInLog = (logId: string) => {
    const nextLogs = (contact.checkInLogs ?? []).filter((l) => l.id !== logId);
    onUpdate(contact.id, { checkInLogs: nextLogs });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressContactPhotoFile(file);
      await contactPhotoDb.savePhoto(contact.id, compressed);
      onUpdate(contact.id, { hasLocalPhoto: true });
      onToast("Saved compressed photo locally", "success");
    } catch {
      onToast("Could not process image file", "error");
    } finally {
      e.target.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    await contactPhotoDb.deletePhoto(contact.id);
    onUpdate(contact.id, { hasLocalPhoto: false });
    onToast("Removed local photo");
  };

  const toggleCircle = (circleId: string) => {
    const exists = contact.circleIds.includes(circleId);
    onUpdate(contact.id, {
      circleIds: exists
        ? contact.circleIds.filter((id) => id !== circleId)
        : [...contact.circleIds, circleId],
    });
  };

  const handleCreateCircle = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCircleName.trim();
    if (!trimmed) return;
    const color =
      QUICK_CIRCLE_COLORS[circles.length % QUICK_CIRCLE_COLORS.length];
    const created = onAddCircle(trimmed, color);
    onUpdate(contact.id, { circleIds: [...contact.circleIds, created.id] });
    setNewCircleName("");
    setAddingCircle(false);
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tagDraft.trim().toLowerCase().replace(/^#/, "");
    if (!clean) return;
    if (!contact.tags.includes(clean)) {
      onUpdate(contact.id, { tags: [...contact.tags, clean] });
    }
    setTagDraft("");
  };

  const updateLabeledList = (
    field: "phones" | "emails" | "socialHandles",
    list: ContactLabeledValue[],
  ) => {
    onUpdate(contact.id, { [field]: list });
  };

  const setPrimaryLabeledItem = (
    field: "phones" | "emails" | "socialHandles",
    targetId: string,
  ) => {
    const list = contact[field].map((item) => ({
      ...item,
      isPrimary: item.id === targetId,
    }));
    onUpdate(contact.id, { [field]: list });
  };

  const handleAddRelationship = (e: React.FormEvent) => {
    e.preventDefault();
    const targetObj = otherContacts.find((c) => c.id === relTargetId);
    const targetName = targetObj
      ? getContactDisplayName(targetObj)
      : relCustomName.trim();
    const relation = relRole.trim() || "Connected";
    if (!targetName) return;

    const newLink: ContactRelationshipLink = {
      id: makeItemId("rel"),
      targetContactId: targetObj?.id,
      targetName,
      relation,
    };
    onUpdate(contact.id, {
      relationships: [...contact.relationships, newLink],
    });
    setRelTargetId("");
    setRelCustomName("");
    setRelRole("");
    setAddingRel(false);
  };

  const handleAddAddress = () => {
    const next: ContactAddress = {
      id: makeItemId("adr"),
      label: contact.addresses.length === 0 ? "Home" : "Work",
      street: "",
      city: "",
      region: "",
      postalCode: "",
      country: "",
      isPrimary: contact.addresses.length === 0,
    };
    onUpdate(contact.id, { addresses: [...contact.addresses, next] });
  };

  const handleAddCustomField = () => {
    const next: ContactCustomField = {
      id: makeItemId("cf"),
      key: "",
      value: "",
    };
    onUpdate(contact.id, { customFields: [...contact.customFields, next] });
  };

  const tabs: { id: ContactInspectorTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    {
      id: "contact",
      label: "Contact",
      count:
        contact.phones.length +
        contact.emails.length +
        contact.socialHandles.length +
        contact.addresses.length,
    },
    {
      id: "notes",
      label: "Notes",
      count: checkInLogs.length > 0 ? checkInLogs.length : undefined,
    },
    {
      id: "links",
      label: "Links",
      count:
        contact.relationships.length > 0
          ? contact.relationships.length
          : undefined,
    },
  ];

  return (
    <div
      className="h-full min-h-0 flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      {/* Top Toolbar */}
      <div
        className="px-3.5 sm:px-4 h-12 border-b flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isMobileFullScreen ? (
            <button
              type="button"
              onClick={onClose}
              className="h-9 pl-1.5 pr-2.5 -ml-1 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium hover:bg-[var(--bg-surface-subtle)] cursor-pointer shrink-0"
              style={{ color: "var(--text-primary)" }}
              aria-label="Back to contacts"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Contacts</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: freshness.dotColor }}
                aria-hidden="true"
              />
              <span
                className="text-xs font-medium truncate"
                style={{ color: "var(--text-secondary)" }}
              >
                {freshness.label}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {confirmDelete ? (
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDelete(contact.id)}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold text-white cursor-pointer"
                style={{ backgroundColor: "var(--danger)" }}
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-8 px-2 rounded-lg text-xs hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              title="Delete contact"
              aria-label="Delete contact"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              onUpdate(contact.id, { favorite: !contact.favorite })
            }
            className="h-9 w-9 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{
              color: contact.favorite ? "var(--warning)" : "var(--text-muted)",
            }}
            title={
              contact.favorite ? "Remove from favorites" : "Favorite contact"
            }
            aria-label="Toggle favorite"
          >
            <Star
              className={`w-4 h-4 ${contact.favorite ? "fill-current" : ""}`}
            />
          </button>

          {!isMobileFullScreen && (
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              style={{ color: "var(--text-muted)" }}
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Body (Hero + Tabs + Active Tab Content) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Centered Hero Header */}
        <header
          className="px-4 sm:px-5 pt-5 pb-4 border-b flex flex-col items-center text-center"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {/* Centered Avatar + Upload Trigger */}
          <div className="relative group">
            <ContactAvatar
              contact={contact}
              size="xl"
              className="w-[72px] h-[72px] text-xl"
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handlePhotoUpload(e)}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border flex items-center justify-center shadow-sm transition-transform hover:scale-105 cursor-pointer"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-strong)",
                color: "var(--text-primary)",
              }}
              title="Upload local photo (auto-compressed)"
              aria-label="Upload local photo"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>
          {hasPhoto && (
            <button
              type="button"
              onClick={() => void handleRemovePhoto()}
              className="mt-1.5 text-[11px] hover:underline cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              Remove photo
            </button>
          )}

          {/* Unified Full Name Heading (First & Last Name edited in Overview tab) */}
          <h2
            className="mt-3 max-w-full px-2 font-display text-lg sm:text-xl font-bold tracking-tight text-balance break-words"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </h2>

          {/* Inline-Editable Role & Company */}
          <div className="mt-0.5 w-full max-w-md flex items-center justify-center gap-1 flex-wrap text-xs">
            <div className="max-w-[190px]">
              <InlineEditableText
                value={contact.jobTitle || ""}
                onCommit={(next) => onUpdate(contact.id, { jobTitle: next })}
                placeholder="Add role"
                align="center"
                className="text-xs font-medium"
                ariaLabel="Role or job title"
              />
            </div>
            <span style={{ color: "var(--text-muted)" }} aria-hidden="true">
              ·
            </span>
            <div className="max-w-[190px]">
              <InlineEditableText
                value={contact.company || ""}
                onCommit={(next) => onUpdate(contact.id, { company: next })}
                placeholder="Add company"
                align="center"
                className="text-xs font-medium"
                ariaLabel="Company or organization"
              />
            </div>
          </div>

          {/* Quiet Unboxed Metadata Line (Zero Pill Clutter) */}
          <div
            className="mt-1.5 flex items-center justify-center flex-wrap gap-x-2 gap-y-0.5 text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: CLOSENESS_TIER_META[contact.closeness].color,
                }}
              />
              <span>{CLOSENESS_TIER_META[contact.closeness].label}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: freshness.dotColor }}
              />
              <span>{freshness.label}</span>
            </span>
            {contact.nickname?.trim() && (
              <>
                <span aria-hidden="true">·</span>
                <span>“{contact.nickname}”</span>
              </>
            )}
          </div>

          {/* Desktop 4-Button Hero Quick Action Bar (Mobile uses sticky thumb-zone bottom bar) */}
          {!isMobileFullScreen && (
            <div className="mt-4 w-full grid grid-cols-4 gap-2">
              {primaryPhone ? (
                <a
                  href={buildTelHref(primaryPhone.value)}
                  className="h-9 px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                  title={`Call ${primaryPhone.value}`}
                >
                  <Phone
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <span>Call</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-9 px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 opacity-45 cursor-not-allowed whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                  title="No phone number added"
                >
                  <Phone className="w-3.5 h-3.5 shrink-0" />
                  <span>Call</span>
                </button>
              )}

              {primaryEmail ? (
                <a
                  href={buildMailtoHref(primaryEmail.value)}
                  className="h-9 px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] transition-colors whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                  title={`Email ${primaryEmail.value}`}
                >
                  <Mail
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--accent)" }}
                  />
                  <span>Email</span>
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-9 px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 opacity-45 cursor-not-allowed whitespace-nowrap"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                  title="No email address added"
                >
                  <Mail className="w-3.5 h-3.5 shrink-0" />
                  <span>Email</span>
                </button>
              )}

              <button
                type="button"
                disabled={!primaryCopyTarget}
                onClick={() => {
                  if (primaryCopyTarget) {
                    void handleCopy(
                      "hero-primary",
                      primaryCopyTarget.value,
                      primaryCopyTarget.label,
                    );
                  }
                }}
                className="h-9 px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-[var(--bg-surface-subtle)] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
                title={
                  primaryCopyTarget
                    ? `Copy ${primaryCopyTarget.value}`
                    : "No phone or email to copy"
                }
              >
                {copiedId === "hero-primary" ? (
                  <Check
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--success)" }}
                  />
                ) : (
                  <Copy
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  />
                )}
                <span>Copy</span>
              </button>

              <button
                type="button"
                onClick={handleQuickCheckIn}
                className="h-9 px-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-fg)",
                }}
                title="Log today as Last Contacted"
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Check-In</span>
              </button>
            </div>
          )}
        </header>

        {/* Sticky Segmented Tab Bar */}
        <div
          className="sticky top-0 z-10 px-4 py-2 border-b"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div
            className="grid grid-cols-4 gap-1 p-1 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-surface-subtle)",
              borderColor: "var(--border-subtle)",
            }}
            role="tablist"
            aria-label="Contact profile sections"
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className="h-8 px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: active
                      ? "var(--bg-surface)"
                      : "transparent",
                    color: active
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    boxShadow: active
                      ? "0 1px 2px rgba(0,0,0,0.06)"
                      : undefined,
                  }}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && tab.count > 0 && (
                    <span
                      className="text-[10px] font-mono tabular-nums"
                      style={{
                        color: active ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Tab Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {activeTab === "overview" && (
            <>
              {/* Identity & Name Panel */}
              <section
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Identity
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div
                      className="text-[11px] font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      First Name
                    </div>
                    <div
                      className="rounded-lg border px-1 py-0.5"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <InlineEditableText
                        value={contact.firstName}
                        onCommit={(next) =>
                          onUpdate(contact.id, { firstName: next })
                        }
                        placeholder="Add first name"
                        className="w-full text-xs font-medium"
                        ariaLabel="First name"
                      />
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-[11px] font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Last Name
                    </div>
                    <div
                      className="rounded-lg border px-1 py-0.5"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <InlineEditableText
                        value={contact.lastName}
                        onCommit={(next) =>
                          onUpdate(contact.id, { lastName: next })
                        }
                        placeholder="Add last name"
                        className="w-full text-xs font-medium"
                        ariaLabel="Last name"
                      />
                    </div>
                  </div>
                </div>

                <div
                  className="pt-2.5 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <span
                    className="text-xs font-medium shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Nickname
                  </span>
                  <div className="min-w-0 flex-1 flex justify-end">
                    <InlineEditableText
                      value={contact.nickname || ""}
                      onCommit={(next) =>
                        onUpdate(contact.id, { nickname: next })
                      }
                      placeholder="Add nickname"
                      className="text-xs"
                      ariaLabel="Nickname"
                    />
                  </div>
                </div>
              </section>

              {/* Relationship & Cadence Panel */}
              <section
                className="p-4 rounded-xl border space-y-4"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Relationship &amp; Freshness
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cadence: {freshness.cadenceDays}d
                  </span>
                </div>

                {/* Closeness 4-way selector */}
                <div
                  className="grid grid-cols-4 gap-1 p-1 rounded-xl border"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  {(
                    [
                      "inner",
                      "close",
                      "regular",
                      "acquaintance",
                    ] as ContactClosenessTier[]
                  ).map((tier) => {
                    const active = contact.closeness === tier;
                    const meta = CLOSENESS_TIER_META[tier];
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() =>
                          onUpdate(contact.id, { closeness: tier })
                        }
                        className="h-7 px-1.5 rounded-lg text-[11px] font-medium transition-colors truncate cursor-pointer"
                        style={{
                          backgroundColor: active
                            ? "var(--bg-surface)"
                            : "transparent",
                          color: active
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                        }}
                      >
                        {tier === "inner"
                          ? "Inner"
                          : tier === "acquaintance"
                            ? "Acquaint."
                            : meta.label}
                      </button>
                    );
                  })}
                </div>

                {/* Last Contacted row */}
                <div
                  className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div>
                    <div
                      className="text-xs font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Last Contacted
                    </div>
                    <div
                      className="text-[11px] font-mono tabular-nums mt-0.5 flex items-center gap-1.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: freshness.dotColor }}
                      />
                      <span>{freshness.label}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={contact.lastContactedAt || ""}
                      onChange={(e) =>
                        onUpdate(contact.id, {
                          lastContactedAt: e.target.value || null,
                        })
                      }
                      className="h-8 px-2 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate(contact.id, { lastContactedAt: todayKey })
                      }
                      className="h-8 px-2.5 rounded-lg border text-xs font-medium hover:bg-[var(--bg-surface-subtle)] whitespace-nowrap cursor-pointer"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      Today
                    </button>
                  </div>
                </div>
              </section>

              {/* Circles & Tags Panel */}
              <section
                className="p-4 rounded-xl border space-y-4"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Circles
                    </span>
                    <button
                      type="button"
                      onClick={() => setAddingCircle((v) => !v)}
                      className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline cursor-pointer"
                      style={{ color: "var(--accent)" }}
                    >
                      <Plus className="w-3 h-3" />
                      <span>New circle</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {circles.map((cir) => {
                      const selected = contact.circleIds.includes(cir.id);
                      return (
                        <button
                          key={cir.id}
                          type="button"
                          onClick={() => toggleCircle(cir.id)}
                          className="h-7 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          style={{
                            backgroundColor: selected
                              ? "var(--accent-soft)"
                              : "var(--bg-elevated)",
                            borderColor: selected
                              ? cir.color
                              : "var(--border-subtle)",
                            color: selected
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cir.color }}
                          />
                          <span>{cir.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {addingCircle && (
                    <form
                      onSubmit={handleCreateCircle}
                      className="mt-2.5 flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={newCircleName}
                        onChange={(e) => setNewCircleName(e.target.value)}
                        placeholder="Circle name..."
                        className="flex-1 h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                      <button
                        type="submit"
                        className="h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer"
                        style={{
                          backgroundColor: "var(--accent)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        Add
                      </button>
                    </form>
                  )}
                </div>

                <div
                  className="pt-3 border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Tags
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {contact.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[11px] font-mono"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() =>
                            onUpdate(contact.id, {
                              tags: contact.tags.filter((x) => x !== t),
                            })
                          }
                          className="hover:text-[var(--danger)] cursor-pointer"
                          aria-label={`Remove tag ${t}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <form
                      onSubmit={handleAddTag}
                      className="inline-flex items-center gap-1"
                    >
                      <Tag
                        className="w-3 h-3"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <input
                        type="text"
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        placeholder="Add tag..."
                        className="h-6 w-24 px-1.5 rounded-md border text-[11px] outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </form>
                  </div>
                </div>
              </section>

              {/* Milestones Panel */}
              <section
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Milestones
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      className="flex items-center gap-1.5 text-xs font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Gift
                        className="w-3.5 h-3.5"
                        style={{ color: "var(--accent)" }}
                      />
                      <span>Birthday</span>
                      {nextBday && (
                        <span
                          className="font-mono text-[11px] tabular-nums"
                          style={{ color: "var(--accent)" }}
                        >
                          ·{" "}
                          {nextBday.daysUntil === 0
                            ? "Today!"
                            : `in ${nextBday.daysUntil}d`}
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={
                        contact.birthday &&
                        /^\d{4}-\d{2}-\d{2}$/.test(contact.birthday)
                          ? contact.birthday
                          : ""
                      }
                      onChange={(e) =>
                        onUpdate(contact.id, {
                          birthday: e.target.value || null,
                        })
                      }
                      className="w-full h-8 px-2 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      className="flex items-center gap-1.5 text-xs font-medium mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Heart className="w-3.5 h-3.5" />
                      <span>Anniversary</span>
                      {nextAnniv && (
                        <span
                          className="font-mono text-[11px] tabular-nums"
                          style={{ color: "var(--text-muted)" }}
                        >
                          ·{" "}
                          {nextAnniv.daysUntil === 0
                            ? "Today!"
                            : `in ${nextAnniv.daysUntil}d`}
                        </span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={
                        contact.anniversary &&
                        /^\d{4}-\d{2}-\d{2}$/.test(contact.anniversary)
                          ? contact.anniversary
                          : ""
                      }
                      onChange={(e) =>
                        onUpdate(contact.id, {
                          anniversary: e.target.value || null,
                        })
                      }
                      className="w-full h-8 px-2 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-elevated)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                  </div>
                </div>

                <label
                  className="pt-2.5 border-t flex items-center justify-between gap-2 cursor-pointer"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <span
                    className="flex items-center gap-2 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Calendar
                      className="w-3.5 h-3.5"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <span>Sync Birthday to Timeline &amp; Events</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(contact.syncBirthdayToTimeline)}
                    disabled={!contact.birthday}
                    onChange={(e) =>
                      onUpdate(contact.id, {
                        syncBirthdayToTimeline: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                </label>
              </section>

              {/* Custom Key-Value Fields */}
              <section
                className="p-4 rounded-xl border space-y-2.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Custom Traits
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCustomField}
                    className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline cursor-pointer"
                    style={{ color: "var(--accent)" }}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add field</span>
                  </button>
                </div>

                {contact.customFields.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Add traits like Coffee Order, Time Zone, or Gift Ideas.
                  </p>
                ) : (
                  <div
                    className="divide-y"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    {contact.customFields.map((cf) => (
                      <div
                        key={cf.id}
                        className="py-1.5 first:pt-0 last:pb-0 flex items-center gap-2"
                      >
                        <div className="w-28 shrink-0">
                          <InlineEditableText
                            value={cf.key}
                            onCommit={(next) =>
                              onUpdate(contact.id, {
                                customFields: contact.customFields.map((f) =>
                                  f.id === cf.id ? { ...f, key: next } : f,
                                ),
                              })
                            }
                            placeholder="Trait"
                            className="text-xs font-medium"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <InlineEditableText
                            value={cf.value}
                            onCommit={(next) =>
                              onUpdate(contact.id, {
                                customFields: contact.customFields.map((f) =>
                                  f.id === cf.id ? { ...f, value: next } : f,
                                ),
                              })
                            }
                            placeholder="Value"
                            className="text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdate(contact.id, {
                              customFields: contact.customFields.filter(
                                (f) => f.id !== cf.id,
                              ),
                            })
                          }
                          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Remove custom field"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "contact" && (
            <>
              {/* Phones, Emails, Socials Panels */}
              {(
                [
                  {
                    key: "phones" as const,
                    title: "Phone Numbers",
                    icon: Phone,
                    defaultLabel: "Mobile",
                    placeholder: "+1 (555) 000-0000",
                    kind: "phone" as const,
                  },
                  {
                    key: "emails" as const,
                    title: "Email Addresses",
                    icon: Mail,
                    defaultLabel: "Personal",
                    placeholder: "name@example.com",
                    kind: "email" as const,
                  },
                  {
                    key: "socialHandles" as const,
                    title: "Social & Web Links",
                    icon: Share2,
                    defaultLabel: "Website",
                    placeholder: "@handle or https://...",
                    kind: "social" as const,
                  },
                ] as const
              ).map((sec) => {
                const Icon = sec.icon;
                const rows = contact[sec.key];
                const primaryId = getPrimaryLabeledValue(rows)?.id;

                return (
                  <section
                    key={sec.key}
                    className="p-4 rounded-xl border space-y-2.5"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{sec.title}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateLabeledList(sec.key, [
                            ...rows,
                            {
                              id: makeItemId(sec.key.slice(0, 3)),
                              label: sec.defaultLabel,
                              value: "",
                              isPrimary: rows.length === 0,
                            },
                          ])
                        }
                        className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline cursor-pointer"
                        style={{ color: "var(--accent)" }}
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    {rows.length === 0 ? (
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        None added yet.
                      </p>
                    ) : (
                      <div
                        className="divide-y"
                        style={{ borderColor: "var(--border-subtle)" }}
                      >
                        {rows.map((row) => {
                          const isPrimary = row.id === primaryId;
                          const launchHref =
                            row.value.trim() && sec.kind === "phone"
                              ? buildTelHref(row.value)
                              : row.value.trim() && sec.kind === "email"
                                ? buildMailtoHref(row.value)
                                : row.value.trim() &&
                                    /^https?:\/\//i.test(row.value.trim())
                                  ? row.value.trim()
                                  : null;

                          return (
                            <div
                              key={row.id}
                              className="py-2 first:pt-0 last:pb-0 flex items-center gap-1.5"
                            >
                              {sec.kind !== "social" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPrimaryLabeledItem(sec.key, row.id)
                                  }
                                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                                  style={{
                                    color: isPrimary
                                      ? "var(--warning)"
                                      : "var(--text-muted)",
                                  }}
                                  title={
                                    isPrimary
                                      ? "Primary"
                                      : "Set as primary"
                                  }
                                  aria-label={`Set ${row.label || sec.title} as primary`}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${isPrimary ? "fill-current" : ""}`}
                                  />
                                </button>
                              )}

                              <div className="w-20 shrink-0">
                                <InlineEditableText
                                  value={row.label}
                                  onCommit={(next) =>
                                    updateLabeledList(
                                      sec.key,
                                      rows.map((r) =>
                                        r.id === row.id
                                          ? { ...r, label: next }
                                          : r,
                                      ),
                                    )
                                  }
                                  placeholder="Label"
                                  className="text-xs font-medium"
                                />
                              </div>

                              <div className="flex-1 min-w-0">
                                <InlineEditableText
                                  value={row.value}
                                  onCommit={(next) =>
                                    updateLabeledList(
                                      sec.key,
                                      rows.map((r) =>
                                        r.id === row.id
                                          ? { ...r, value: next }
                                          : r,
                                      ),
                                    )
                                  }
                                  placeholder={sec.placeholder}
                                  mono
                                  className="text-xs"
                                />
                              </div>

                              {row.value.trim() && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopy(
                                      row.id,
                                      row.value,
                                      row.label || sec.title,
                                    )
                                  }
                                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                                  style={{ color: "var(--text-muted)" }}
                                  title="Copy"
                                >
                                  {copiedId === row.id ? (
                                    <Check
                                      className="w-3.5 h-3.5"
                                      style={{ color: "var(--success)" }}
                                    />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}

                              {launchHref && (
                                <a
                                  href={launchHref}
                                  target={
                                    sec.kind === "social" ? "_blank" : undefined
                                  }
                                  rel={
                                    sec.kind === "social"
                                      ? "noopener noreferrer"
                                      : undefined
                                  }
                                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)]"
                                  style={{ color: "var(--accent)" }}
                                  title={`Open ${row.value}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  updateLabeledList(
                                    sec.key,
                                    rows.filter((r) => r.id !== row.id),
                                  )
                                }
                                className="h-8 w-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                                style={{ color: "var(--text-muted)" }}
                                aria-label="Remove item"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}

              {/* Addresses Panel */}
              <section
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Addresses</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddAddress}
                    className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline cursor-pointer"
                    style={{ color: "var(--accent)" }}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add</span>
                  </button>
                </div>

                {contact.addresses.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No addresses saved.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {contact.addresses.map((addr) => {
                      const oneLine = formatContactAddressOneLine(addr);
                      const updateAddr = (patch: Partial<ContactAddress>) =>
                        onUpdate(contact.id, {
                          addresses: contact.addresses.map((a) =>
                            a.id === addr.id ? { ...a, ...patch } : a,
                          ),
                        });

                      return (
                        <div
                          key={addr.id}
                          className="p-3 rounded-xl border space-y-2"
                          style={{
                            backgroundColor: "var(--bg-elevated)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="w-28">
                              <InlineEditableText
                                value={addr.label}
                                onCommit={(next) =>
                                  updateAddr({ label: next })
                                }
                                placeholder="Home / Work"
                                className="text-xs font-semibold"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              {oneLine && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopy(
                                        addr.id,
                                        oneLine,
                                        "address",
                                      )
                                    }
                                    className="h-7 px-2 rounded-lg border text-[11px] inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                                    style={{
                                      borderColor: "var(--border-subtle)",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    {copiedId === addr.id ? (
                                      <Check
                                        className="w-3 h-3"
                                        style={{ color: "var(--success)" }}
                                      />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                    <span>Copy</span>
                                  </button>
                                  <a
                                    href={buildAddressMapsUrl(addr)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="h-7 px-2 rounded-lg border text-[11px] inline-flex items-center gap-1 hover:bg-[var(--bg-surface-subtle)]"
                                    style={{
                                      borderColor: "var(--border-subtle)",
                                      color: "var(--accent)",
                                    }}
                                  >
                                    <MapPin className="w-3 h-3" />
                                    <span>Maps</span>
                                  </a>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdate(contact.id, {
                                    addresses: contact.addresses.filter(
                                      (a) => a.id !== addr.id,
                                    ),
                                  })
                                }
                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                                style={{ color: "var(--text-muted)" }}
                                aria-label="Delete address"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <InlineEditableText
                              value={addr.street}
                              onCommit={(next) => updateAddr({ street: next })}
                              placeholder="Street address"
                              className="w-full text-xs"
                            />
                            <div className="grid grid-cols-2 gap-1.5">
                              <InlineEditableText
                                value={addr.city || ""}
                                onCommit={(next) => updateAddr({ city: next })}
                                placeholder="City"
                                className="text-xs"
                              />
                              <InlineEditableText
                                value={addr.country || ""}
                                onCommit={(next) =>
                                  updateAddr({ country: next })
                                }
                                placeholder="Country"
                                className="text-xs"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <InlineEditableText
                                value={addr.region || ""}
                                onCommit={(next) =>
                                  updateAddr({ region: next })
                                }
                                placeholder="State / Region"
                                className="text-xs"
                              />
                              <InlineEditableText
                                value={addr.postalCode || ""}
                                onCommit={(next) =>
                                  updateAddr({ postalCode: next })
                                }
                                placeholder="Postal code"
                                mono
                                className="text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "notes" && (
            <>
              {/* Dated Check-In Log Panel */}
              <section
                className="p-4 rounded-xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Check-In Log</span>
                  </div>
                  <span
                    className="text-[11px] font-mono tabular-nums"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {checkInLogs.length}{" "}
                    {checkInLogs.length === 1 ? "entry" : "entries"}
                  </span>
                </div>

                {/* Quick Log Form */}
                <form
                  onSubmit={handleSubmitCheckInLog}
                  className="p-2.5 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="h-8 px-2 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                    <select
                      value={checkInChannel}
                      onChange={(e) =>
                        setCheckInChannel(
                          e.target.value as ContactCheckInChannel,
                        )
                      }
                      className="h-8 px-2 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      {CHECKIN_CHANNELS.map((ch) => (
                        <option key={ch} value={ch}>
                          {CHECKIN_CHANNEL_META[ch].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={checkInNote}
                      onChange={(e) => setCheckInNote(e.target.value)}
                      placeholder="What did you catch up on?"
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                    <button
                      type="submit"
                      className="h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      Log
                    </button>
                  </div>
                </form>

                {/* Log Timeline */}
                {checkInLogs.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No check-ins logged yet. Record a call, coffee, or message
                    above to keep your touchpoint history fresh.
                  </p>
                ) : (
                  <div
                    className="divide-y"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    {checkInLogs.map((log) => (
                      <div
                        key={log.id}
                        className="py-2.5 first:pt-1 last:pb-0 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div
                            className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums"
                            style={{ color: "var(--text-muted)" }}
                          >
                            <span>{log.date}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className="font-sans font-medium"
                              style={{ color: "var(--accent)" }}
                            >
                              {CHECKIN_CHANNEL_META[log.channel]?.label ||
                                log.channel}
                            </span>
                          </div>
                          <p
                            className="text-xs mt-0.5 leading-relaxed"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {log.note}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCheckInLog(log.id)}
                          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Delete check-in entry"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Rich Bio & Memories Editor */}
              <section
                className="p-4 rounded-xl border space-y-2.5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  Bio, Context &amp; Memories
                </div>
                <TiptapEditor
                  docId={`contact-bio-${contact.id}`}
                  content={contact.bioHtml}
                  onChange={(html) => onUpdate(contact.id, { bioHtml: html })}
                  placeholder="Write how you met, shared interests, context, or key memories..."
                  minHeight={180}
                />
              </section>
            </>
          )}

          {activeTab === "links" && (
            <section
              className="p-4 rounded-xl border space-y-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Connected People</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingRel((v) => !v)}
                  className="text-[11px] font-medium inline-flex items-center gap-1 hover:underline cursor-pointer"
                  style={{ color: "var(--accent)" }}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Link person</span>
                </button>
              </div>

              {addingRel && (
                <form
                  onSubmit={handleAddRelationship}
                  className="p-3 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: "var(--bg-surface-subtle)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={relTargetId}
                      onChange={(e) => {
                        setRelTargetId(e.target.value);
                        if (e.target.value) setRelCustomName("");
                      }}
                      className="h-8 px-2 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      <option value="">Custom name...</option>
                      {otherContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {getContactDisplayName(c)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={relRole}
                      onChange={(e) => setRelRole(e.target.value)}
                      placeholder="Relation (Spouse, Mentor...)"
                      className="h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                  </div>
                  {!relTargetId && (
                    <input
                      type="text"
                      value={relCustomName}
                      onChange={(e) => setRelCustomName(e.target.value)}
                      placeholder="Person's name"
                      className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAddingRel(false)}
                      className="h-7 px-2.5 rounded-lg text-xs cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="h-7 px-3 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-fg)",
                      }}
                    >
                      Save link
                    </button>
                  </div>
                </form>
              )}

              {contact.relationships.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  No linked relationships yet. Connect partners, coworkers,
                  mentors, or family members to jump between profiles.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {contact.relationships.map((rel) => {
                    const targetContact = rel.targetContactId
                      ? contactsById.get(rel.targetContactId)
                      : undefined;
                    const subtitle = targetContact
                      ? [targetContact.jobTitle, targetContact.company]
                          .filter(Boolean)
                          .join(" · ")
                      : "External connection";

                    return (
                      <div
                        key={rel.id}
                        className="p-2.5 rounded-xl border flex items-center justify-between gap-2.5 transition-colors"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                        }}
                      >
                        {targetContact ? (
                          <button
                            type="button"
                            onClick={() => onSelectContact(targetContact.id)}
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left group cursor-pointer"
                          >
                            <ContactAvatar contact={targetContact} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold truncate group-hover:underline">
                                  {getContactDisplayName(targetContact)}
                                </span>
                                <ArrowUpRight
                                  className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                                  style={{ color: "var(--accent)" }}
                                />
                              </div>
                              <div
                                className="text-[11px] truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {rel.relation}
                                {subtitle ? ` · ${subtitle}` : ""}
                              </div>
                            </div>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-display font-bold shrink-0"
                              style={{
                                backgroundColor: "var(--bg-surface-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {rel.targetName.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold truncate">
                                {rel.targetName}
                              </div>
                              <div
                                className="text-[11px] truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {rel.relation} · External
                              </div>
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            onUpdate(contact.id, {
                              relationships: contact.relationships.filter(
                                (r) => r.id !== rel.id,
                              ),
                            })
                          }
                          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                          style={{ color: "var(--text-muted)" }}
                          aria-label="Remove relationship link"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Mobile Sticky Bottom Quick-Action Bar (Thumb Zone) */}
      {isMobileFullScreen && (
        <div
          className="px-3 py-2 border-t pb-safe grid grid-cols-4 gap-2 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          {primaryPhone ? (
            <a
              href={buildTelHref(primaryPhone.value)}
              className="min-h-[44px] px-2 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-transform"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <Phone
                className="w-4 h-4"
                style={{ color: "var(--accent)" }}
              />
              <span className="text-[10px]">Call</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="min-h-[44px] px-2 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-0.5 opacity-40"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <Phone className="w-4 h-4" />
              <span className="text-[10px]">Call</span>
            </button>
          )}

          {primaryEmail ? (
            <a
              href={buildMailtoHref(primaryEmail.value)}
              className="min-h-[44px] px-2 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-transform"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
            >
              <Mail
                className="w-4 h-4"
                style={{ color: "var(--accent)" }}
              />
              <span className="text-[10px]">Email</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="min-h-[44px] px-2 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-0.5 opacity-40"
              style={{
                backgroundColor: "var(--bg-elevated)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <Mail className="w-4 h-4" />
              <span className="text-[10px]">Email</span>
            </button>
          )}

          <button
            type="button"
            disabled={!primaryCopyTarget}
            onClick={() => {
              if (primaryCopyTarget) {
                void handleCopy(
                  "mobile-primary",
                  primaryCopyTarget.value,
                  primaryCopyTarget.label,
                );
              }
            }}
            className="min-h-[44px] px-2 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-0.5 disabled:opacity-40 active:scale-[0.98] transition-transform cursor-pointer"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          >
            {copiedId === "mobile-primary" ? (
              <Check
                className="w-4 h-4"
                style={{ color: "var(--success)" }}
              />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <span className="text-[10px]">Copy</span>
          </button>

          <button
            type="button"
            onClick={handleQuickCheckIn}
            className="min-h-[44px] px-2 rounded-xl text-xs font-semibold flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-transform cursor-pointer"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-[10px]">Check-In</span>
          </button>
        </div>
      )}
    </div>
  );
};
