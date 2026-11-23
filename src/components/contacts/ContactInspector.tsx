import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Check,
  Copy,
  ExternalLink,
  Gift,
  Heart,
  Link2,
  Mail,
  MapPin,
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
  CLOSENESS_TIER_META,
  compressContactPhotoFile,
  daysSinceDateKey,
  formatContactAddressOneLine,
  getContactDisplayName,
  getNextOccurrenceInfo,
} from "../../lib/contactUtils";
import { CONTACT_PHOTO_CHANGE_EVENT, contactPhotoDb } from "../../lib/db";
import type {
  ContactAddress,
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

interface ContactInspectorProps {
  contact: ContactRecord;
  allContacts: ContactRecord[];
  circles: ContactCircle[];
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

function makeItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const ContactInspector: React.FC<ContactInspectorProps> = ({
  contact,
  allContacts,
  circles,
  onUpdate,
  onDelete,
  onSelectContact,
  onAddCircle,
  onClose,
  onToast,
}) => {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [newCircleName, setNewCircleName] = useState("");
  const [addingCircle, setAddingCircle] = useState(false);

  // Relationship quick-add form
  const [addingRel, setAddingRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState("");
  const [relCustomName, setRelCustomName] = useState("");
  const [relRole, setRelRole] = useState("");

  useEffect(() => {
    setConfirmDelete(false);
    setAddingRel(false);
    setTagDraft("");
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

  const todayKey = getTodayKey();
  const nextBday = useMemo(
    () => getNextOccurrenceInfo(contact.birthday, todayKey),
    [contact.birthday, todayKey],
  );
  const daysSinceContact = useMemo(
    () => daysSinceDateKey(contact.lastContactedAt, todayKey),
    [contact.lastContactedAt, todayKey],
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

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "var(--bg-elevated)" }}
    >
      {/* Top Toolbar */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-semibold uppercase tracking-wider truncate"
            style={{ color: "var(--text-muted)" }}
          >
            Profile Inspector
          </span>
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
                className="h-8 px-2 rounded-lg text-xs hover:bg-[var(--bg-surface-subtle)]"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
        {/* Identity & Local Photo */}
        <section className="flex items-start gap-3.5">
          <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="relative group">
              <ContactAvatar contact={contact} size="xl" />
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
                  backgroundColor: "var(--bg-surface)",
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
                className="text-[10px] hover:underline cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                Remove photo
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={contact.firstName}
                onChange={(e) =>
                  onUpdate(contact.id, { firstName: e.target.value })
                }
                placeholder="First name"
                className="h-9 px-2.5 rounded-xl border text-sm font-semibold outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
              <input
                type="text"
                value={contact.lastName}
                onChange={(e) =>
                  onUpdate(contact.id, { lastName: e.target.value })
                }
                placeholder="Last name"
                className="h-9 px-2.5 rounded-xl border text-sm font-semibold outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={contact.nickname || ""}
                onChange={(e) =>
                  onUpdate(contact.id, { nickname: e.target.value })
                }
                placeholder="Nickname"
                className="h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
              <div className="col-span-2 relative flex items-center">
                <Briefcase
                  className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                />
                <input
                  type="text"
                  value={contact.jobTitle || ""}
                  onChange={(e) =>
                    onUpdate(contact.id, { jobTitle: e.target.value })
                  }
                  placeholder="Role / Title"
                  className="w-full h-8 pl-7 pr-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                  }}
                />
              </div>
            </div>

            <div className="relative flex items-center">
              <Building2
                className="w-3.5 h-3.5 absolute left-2.5 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                type="text"
                value={contact.company || ""}
                onChange={(e) =>
                  onUpdate(contact.id, { company: e.target.value })
                }
                placeholder="Company / Organization"
                className="w-full h-8 pl-7 pr-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Photos stay local to this device · Text records sync via Gist
            </p>
          </div>
        </section>

        {/* Closeness, Circles & Tags */}
        <section
          className="p-3.5 rounded-2xl border space-y-3.5"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "var(--text-muted)" }}
            >
              Closeness Tier
            </div>
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
                    onClick={() => onUpdate(contact.id, { closeness: tier })}
                    className="h-7 px-1.5 rounded-lg text-[11px] font-medium transition-colors truncate cursor-pointer"
                    style={{
                      backgroundColor: active
                        ? "var(--bg-elevated)"
                        : "transparent",
                      color: active
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                      boxShadow: active ? "var(--shadow-sm)" : undefined,
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
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Relationship Circles
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
                className="mt-2 flex items-center gap-1.5"
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

          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
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

        {/* Simple Last Contacted + Birthdays / Anniversaries */}
        <section
          className="p-3.5 rounded-2xl border space-y-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-muted)" }}
              >
                Last Contacted
              </div>
              <div
                className="text-xs font-mono tabular-nums mt-0.5"
                style={{ color: "var(--text-secondary)" }}
              >
                {daysSinceContact === null
                  ? "Not logged yet"
                  : daysSinceContact === 0
                    ? "Today"
                    : daysSinceContact === 1
                      ? "Yesterday"
                      : `${daysSinceContact} days ago`}
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

          <div
            className="pt-2.5 border-t grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div>
              <label
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                <Gift
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--accent)" }}
                />
                <span>Birthday</span>
                {nextBday && (
                  <span
                    className="font-mono normal-case text-[10px]"
                    style={{ color: "var(--accent)" }}
                  >
                    (
                    {nextBday.daysUntil === 0
                      ? "Today!"
                      : `in ${nextBday.daysUntil}d`}
                    )
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
                  onUpdate(contact.id, { birthday: e.target.value || null })
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
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "var(--text-muted)" }}
              >
                <Heart className="w-3.5 h-3.5" />
                <span>Anniversary</span>
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
                  onUpdate(contact.id, { anniversary: e.target.value || null })
                }
                className="w-full h-8 px-2 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderColor: "var(--border-subtle)",
                }}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
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

        {/* Phones, Emails & Social Handles */}
        {(
          [
            {
              key: "phones" as const,
              title: "Phone Numbers",
              icon: Phone,
              defaultLabel: "Mobile",
              placeholder: "+1 (555) 000-0000",
              hrefPrefix: "tel:",
            },
            {
              key: "emails" as const,
              title: "Email Addresses",
              icon: Mail,
              defaultLabel: "Personal",
              placeholder: "name@example.com",
              hrefPrefix: "mailto:",
            },
            {
              key: "socialHandles" as const,
              title: "Social & Links",
              icon: Share2,
              defaultLabel: "Instagram",
              placeholder: "@handle or https://...",
              hrefPrefix: "",
            },
          ] as const
        ).map((sec) => {
          const Icon = sec.icon;
          const rows = contact[sec.key];
          return (
            <section
              key={sec.key}
              className="p-3.5 rounded-2xl border space-y-2.5"
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
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  None added yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={row.label}
                        onChange={(e) =>
                          updateLabeledList(
                            sec.key,
                            rows.map((r) =>
                              r.id === row.id
                                ? { ...r, label: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder="Label"
                        className="w-20 shrink-0 h-8 px-2 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) =>
                          updateLabeledList(
                            sec.key,
                            rows.map((r) =>
                              r.id === row.id
                                ? { ...r, value: e.target.value }
                                : r,
                            ),
                          )
                        }
                        placeholder={sec.placeholder}
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-elevated)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                      {row.value && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(
                              row.id,
                              row.value,
                              row.label || sec.title,
                            )
                          }
                          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
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
                      {row.value && sec.hrefPrefix && (
                        <a
                          href={`${sec.hrefPrefix}${row.value}`}
                          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-subtle)]"
                          style={{
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                          title={`Open ${row.value}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {row.value &&
                        !sec.hrefPrefix &&
                        /^https?:\/\//i.test(row.value) && (
                          <a
                            href={row.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg border hover:bg-[var(--bg-surface-subtle)]"
                            style={{
                              borderColor: "var(--border-subtle)",
                              color: "var(--text-muted)",
                            }}
                            title="Open link"
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
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* Multiple Addresses with Copy & Map Link */}
        <section
          className="p-3.5 rounded-2xl border space-y-2.5"
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
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              No addresses saved.
            </div>
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
                    className="p-2.5 rounded-xl border space-y-2"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={addr.label}
                        onChange={(e) => updateAddr({ label: e.target.value })}
                        placeholder="Label (Home, Work)"
                        className="w-28 h-7 px-2 rounded-lg border text-xs font-medium outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                      <div className="flex items-center gap-1">
                        {oneLine && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopy(addr.id, oneLine, "address")
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

                    <input
                      type="text"
                      value={addr.street}
                      onChange={(e) => updateAddr({ street: e.target.value })}
                      placeholder="Street address"
                      className="w-full h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-subtle)",
                      }}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={addr.city || ""}
                        onChange={(e) => updateAddr({ city: e.target.value })}
                        placeholder="City"
                        className="h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                      <input
                        type="text"
                        value={addr.country || ""}
                        onChange={(e) =>
                          updateAddr({ country: e.target.value })
                        }
                        placeholder="Country"
                        className="h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={addr.region || ""}
                        onChange={(e) => updateAddr({ region: e.target.value })}
                        placeholder="State / Region"
                        className="h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                      <input
                        type="text"
                        value={addr.postalCode || ""}
                        onChange={(e) =>
                          updateAddr({ postalCode: e.target.value })
                        }
                        placeholder="Postal code"
                        className="h-8 px-2.5 rounded-lg border text-xs font-mono outline-none focus:border-[var(--accent)]"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-subtle)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Relationship Links */}
        <section
          className="p-3.5 rounded-2xl border space-y-2.5"
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
              <span>Relationship Links</span>
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

          {contact.relationships.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {contact.relationships.map((rel) => {
                const targetExists =
                  rel.targetContactId &&
                  allContacts.some((c) => c.id === rel.targetContactId);
                return (
                  <div
                    key={rel.id}
                    className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-lg border text-xs"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  >
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {rel.relation}:
                    </span>
                    {targetExists ? (
                      <button
                        type="button"
                        onClick={() => onSelectContact(rel.targetContactId!)}
                        className="font-medium hover:underline cursor-pointer"
                        style={{ color: "var(--accent)" }}
                      >
                        {rel.targetName}
                      </button>
                    ) : (
                      <span className="font-medium">{rel.targetName}</span>
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
                      className="p-0.5 hover:text-[var(--danger)] cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                      aria-label="Remove relationship link"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {addingRel && (
            <form onSubmit={handleAddRelationship} className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={relTargetId}
                  onChange={(e) => {
                    setRelTargetId(e.target.value);
                    if (e.target.value) setRelCustomName("");
                  }}
                  className="h-8 px-2 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
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
                  placeholder="Relation (Spouse, Sibling...)"
                  className="h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
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
                    backgroundColor: "var(--bg-elevated)",
                    borderColor: "var(--border-subtle)",
                  }}
                />
              )}
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setAddingRel(false)}
                  className="h-7 px-2.5 rounded-lg text-xs"
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

          {!addingRel && contact.relationships.length === 0 && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              No relationship links yet.
            </div>
          )}
        </section>

        {/* Custom Key-Value Fields */}
        <section
          className="p-3.5 rounded-2xl border space-y-2.5"
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
              Custom Fields
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
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Add custom traits like Coffee Order, Time Zone, or Gift Ideas.
            </div>
          ) : (
            <div className="space-y-1.5">
              {contact.customFields.map((cf) => (
                <div key={cf.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={cf.key}
                    onChange={(e) =>
                      onUpdate(contact.id, {
                        customFields: contact.customFields.map((f) =>
                          f.id === cf.id ? { ...f, key: e.target.value } : f,
                        ),
                      })
                    }
                    placeholder="Field name"
                    className="w-28 shrink-0 h-8 px-2 rounded-lg border text-xs font-medium outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                  <input
                    type="text"
                    value={cf.value}
                    onChange={(e) =>
                      onUpdate(contact.id, {
                        customFields: contact.customFields.map((f) =>
                          f.id === cf.id ? { ...f, value: e.target.value } : f,
                        ),
                      })
                    }
                    placeholder="Value"
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border text-xs outline-none focus:border-[var(--accent)]"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      borderColor: "var(--border-subtle)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate(contact.id, {
                        customFields: contact.customFields.filter(
                          (f) => f.id !== cf.id,
                        ),
                      })
                    }
                    className="h-8 w-7 shrink-0 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
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

        {/* Rich Bio & Description Editor */}
        <section className="space-y-2">
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
            minHeight={150}
          />
        </section>
      </div>
    </div>
  );
};
