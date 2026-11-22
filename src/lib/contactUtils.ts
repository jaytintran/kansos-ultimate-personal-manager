import type {
  ContactAddress,
  ContactCircle,
  ContactClosenessTier,
  ContactLabeledValue,
  ContactRecord,
} from "../types/contacts";
import { getTodayKey, pad2, parseLocalDateKey } from "../utils/date";

export const CONTACT_AVATAR_PALETTE = [
  "#b45309",
  "#047857",
  "#3b6998",
  "#4f46e5",
  "#be185d",
  "#0f766e",
  "#7c3aed",
  "#c2410c",
  "#1d4ed8",
  "#475569",
] as const;

export const CLOSENESS_TIER_META: Record<
  ContactClosenessTier,
  { label: string; rank: number; color: string }
> = {
  inner: { label: "Inner Circle", rank: 4, color: "#be185d" },
  close: { label: "Close", rank: 3, color: "#b45309" },
  regular: { label: "Regular", rank: 2, color: "#3b6998" },
  acquaintance: { label: "Acquaintance", rank: 1, color: "#64748b" },
};

export function getContactDisplayName(
  c: Pick<ContactRecord, "firstName" | "lastName" | "nickname" | "company">,
): string {
  const full = `${c.firstName || ""} ${c.lastName || ""}`.trim();
  if (full) return full;
  if (c.nickname?.trim()) return c.nickname.trim();
  if (c.company?.trim()) return c.company.trim();
  return "Unnamed Contact";
}

export function getContactInitials(
  c: Pick<ContactRecord, "firstName" | "lastName" | "nickname" | "company">,
): string {
  const first = (c.firstName || "").trim();
  const last = (c.lastName || "").trim();
  if (first && last) {
    return `${first[0]}${last[0]}`.toUpperCase();
  }
  const single = first || last || c.nickname?.trim() || c.company?.trim() || "?";
  const parts = single.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return single.slice(0, 2).toUpperCase();
}

export function getDeterministicAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return CONTACT_AVATAR_PALETTE[hash % CONTACT_AVATAR_PALETTE.length];
}

export function formatContactAddressOneLine(addr: ContactAddress): string {
  return [addr.street, addr.city, addr.region, addr.postalCode, addr.country]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
}

export function buildAddressMapsUrl(addr: ContactAddress): string {
  const query = formatContactAddressOneLine(addr);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export interface ParsedMonthDay {
  year: number | null;
  month: number; // 1..12
  day: number; // 1..31
}

export function parseMonthDay(dateStr?: string | null): ParsedMonthDay | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const fullMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (fullMatch) {
    const year = Number(fullMatch[1]);
    const month = Number(fullMatch[2]);
    const day = Number(fullMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }
  const noYearMatch = trimmed.match(/^--(\d{2})-(\d{2})$/);
  if (noYearMatch) {
    const month = Number(noYearMatch[1]);
    const day = Number(noYearMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year: null, month, day };
    }
  }
  return null;
}

export interface UpcomingMilestoneInfo {
  nextDateKey: string;
  daysUntil: number;
  turningAge: number | null;
}

export function getNextOccurrenceInfo(
  dateStr?: string | null,
  todayKey = getTodayKey(),
): UpcomingMilestoneInfo | null {
  const parsed = parseMonthDay(dateStr);
  if (!parsed) return null;
  const today = parseLocalDateKey(todayKey);
  const currentYear = today.getFullYear();

  const buildForYear = (yr: number): Date => {
    // Handle Feb 29 gracefully on non-leap years as Feb 28
    const maxDay = new Date(yr, parsed.month, 0).getDate();
    return new Date(yr, parsed.month - 1, Math.min(parsed.day, maxDay), 0, 0, 0, 0);
  };

  let target = buildForYear(currentYear);
  if (target.getTime() < today.getTime()) {
    target = buildForYear(currentYear + 1);
  }

  const diffMs = target.getTime() - today.getTime();
  const daysUntil = Math.round(diffMs / 86_400_000);
  const nextDateKey = `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`;
  const turningAge =
    parsed.year !== null && parsed.year > 1900 && parsed.year <= target.getFullYear()
      ? target.getFullYear() - parsed.year
      : null;

  return { nextDateKey, daysUntil, turningAge };
}

export function formatMonthDayLabel(dateStr?: string | null): string {
  const parsed = parseMonthDay(dateStr);
  if (!parsed) return "";
  const ref = new Date(parsed.year || 2024, parsed.month - 1, parsed.day);
  if (parsed.year) {
    return ref.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return ref.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function daysSinceDateKey(
  dateKey?: string | null,
  todayKey = getTodayKey(),
): number | null {
  if (!dateKey) return null;
  const d = parseLocalDateKey(dateKey);
  const t = parseLocalDateKey(todayKey);
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return null;
  return Math.round((t.getTime() - d.getTime()) / 86_400_000);
}

/**
 * Compresses an uploaded image file client-side to a crisp square-bounded WebP/JPEG data URL
 * (max 256px) suitable for storing locally in IndexedDB.
 */
export async function compressContactPhotoFile(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read photo file"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Unsupported image format"));
    el.src = dataUrl;
  });

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Center-crop square for clean avatar framing
  const srcMin = Math.min(img.width, img.height);
  const sx = Math.max(0, (img.width - srcMin) / 2);
  const sy = Math.max(0, (img.height - srcMin) / 2);
  ctx.drawImage(img, sx, sy, srcMin, srcMin, 0, 0, size, size);

  const webp = canvas.toDataURL("image/webp", 0.84);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/jpeg", 0.85);
}

// ============================================================================
// vCard (.vcf) Import & Export
// ============================================================================

function unescapeVCardValue(val: string): string {
  return val
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeVCardValue(val: string): string {
  return val
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function extractVCardTypeLabel(params: string[], fallback: string): string {
  for (const p of params) {
    const upper = p.toUpperCase();
    if (upper.startsWith("TYPE=")) {
      const raw = p.slice(5).replace(/"/g, "").split(",")[0]?.trim();
      if (raw) {
        return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
      }
    } else if (
      ["CELL", "MOBILE", "HOME", "WORK", "MAIN", "OTHER"].includes(upper)
    ) {
      return upper === "CELL"
        ? "Mobile"
        : upper.charAt(0) + upper.slice(1).toLowerCase();
    }
  }
  return fallback;
}

function normalizeVCardDate(raw: string): string | null {
  const cleaned = raw.trim().replace(/^--/, "");
  const full = raw.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;
  const noYr = raw.trim().match(/^--(\d{2})-?(\d{2})$/) || cleaned.match(/^(\d{2})-?(\d{2})$/);
  if (raw.trim().startsWith("--") && noYr) {
    return `--${noYr[1]}-${noYr[2]}`;
  }
  return null;
}

function newTmpId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseVCardFile(text: string): Partial<ContactRecord>[] {
  // Unfold RFC 6350 / RFC 2426 folded lines
  const unfolded = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "");

  const lines = unfolded.split("\n");
  const results: Partial<ContactRecord>[] = [];
  let current: Partial<ContactRecord> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^BEGIN:VCARD$/i.test(trimmed)) {
      current = {
        firstName: "",
        lastName: "",
        phones: [],
        emails: [],
        socialHandles: [],
        addresses: [],
        customFields: [],
        relationships: [],
        tags: [],
        circleIds: [],
        closeness: "regular",
        bioHtml: "",
      };
      continue;
    }
    if (/^END:VCARD$/i.test(trimmed)) {
      if (current) {
        if (!current.firstName && !current.lastName && current.nickname) {
          current.firstName = current.nickname;
        }
        results.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rawProp = line.slice(0, colonIdx);
    const rawValue = line.slice(colonIdx + 1).trim();
    const [propNameWithGroup, ...params] = rawProp.split(";");
    const propName = propNameWithGroup.split(".").pop()!.toUpperCase();

    switch (propName) {
      case "FN": {
        const fn = unescapeVCardValue(rawValue).trim();
        if (fn && !current.firstName && !current.lastName) {
          const parts = fn.split(/\s+/);
          current.firstName = parts[0] || "";
          current.lastName = parts.slice(1).join(" ");
        }
        break;
      }
      case "N": {
        const parts = rawValue.split(";").map(unescapeVCardValue);
        const last = (parts[0] || "").trim();
        const first = (parts[1] || "").trim();
        const mid = (parts[2] || "").trim();
        if (first || last) {
          current.firstName = [first, mid].filter(Boolean).join(" ");
          current.lastName = last;
        }
        break;
      }
      case "NICKNAME":
        current.nickname = unescapeVCardValue(rawValue).trim();
        break;
      case "ORG":
        current.company = unescapeVCardValue(rawValue.split(";")[0] || "").trim();
        break;
      case "TITLE":
      case "ROLE":
        if (!current.jobTitle) {
          current.jobTitle = unescapeVCardValue(rawValue).trim();
        }
        break;
      case "TEL": {
        const val = unescapeVCardValue(rawValue).trim();
        if (val) {
          current.phones!.push({
            id: newTmpId("tel"),
            label: extractVCardTypeLabel(params, "Mobile"),
            value: val,
            isPrimary: current.phones!.length === 0,
          });
        }
        break;
      }
      case "EMAIL": {
        const val = unescapeVCardValue(rawValue).trim();
        if (val) {
          current.emails!.push({
            id: newTmpId("mail"),
            label: extractVCardTypeLabel(params, "Personal"),
            value: val,
            isPrimary: current.emails!.length === 0,
          });
        }
        break;
      }
      case "ADR": {
        // ADR: ;;street;city;region;postal;country
        const parts = rawValue.split(";").map(unescapeVCardValue);
        const street = [parts[0], parts[1], parts[2]].filter(Boolean).join(", ").trim();
        const city = (parts[3] || "").trim();
        const region = (parts[4] || "").trim();
        const postalCode = (parts[5] || "").trim();
        const country = (parts[6] || "").trim();
        if (street || city || region || postalCode || country) {
          current.addresses!.push({
            id: newTmpId("adr"),
            label: extractVCardTypeLabel(params, "Home"),
            street: street || city,
            city,
            region,
            postalCode,
            country,
            isPrimary: current.addresses!.length === 0,
          });
        }
        break;
      }
      case "BDAY": {
        const bday = normalizeVCardDate(rawValue);
        if (bday) current.birthday = bday;
        break;
      }
      case "ANNIVERSARY":
      case "X-ANNIVERSARY": {
        const ann = normalizeVCardDate(rawValue);
        if (ann) current.anniversary = ann;
        break;
      }
      case "URL": {
        const val = unescapeVCardValue(rawValue).trim();
        if (val) {
          current.socialHandles!.push({
            id: newTmpId("soc"),
            label: extractVCardTypeLabel(params, "Website"),
            value: val,
          });
        }
        break;
      }
      case "X-SOCIALPROFILE": {
        const val = unescapeVCardValue(rawValue).trim();
        if (val) {
          current.socialHandles!.push({
            id: newTmpId("soc"),
            label: extractVCardTypeLabel(params, "Social"),
            value: val,
          });
        }
        break;
      }
      case "CATEGORIES": {
        const tags = rawValue
          .split(",")
          .map((t) => unescapeVCardValue(t).trim().toLowerCase())
          .filter(Boolean);
        current.tags = Array.from(new Set([...(current.tags || []), ...tags]));
        break;
      }
      case "NOTE": {
        const note = unescapeVCardValue(rawValue).trim();
        if (note) {
          const escaped = note
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>");
          current.bioHtml = `<p>${escaped}</p>`;
        }
        break;
      }
    }
  }

  return results;
}

export function exportContactsToVCard(contacts: ContactRecord[]): string {
  const blocks: string[] = [];
  for (const c of contacts) {
    const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
    const fn = getContactDisplayName(c);
    lines.push(`FN:${escapeVCardValue(fn)}`);
    lines.push(
      `N:${escapeVCardValue(c.lastName || "")};${escapeVCardValue(c.firstName || "")};;;`,
    );
    if (c.nickname?.trim()) {
      lines.push(`NICKNAME:${escapeVCardValue(c.nickname.trim())}`);
    }
    if (c.company?.trim()) {
      lines.push(`ORG:${escapeVCardValue(c.company.trim())}`);
    }
    if (c.jobTitle?.trim()) {
      lines.push(`TITLE:${escapeVCardValue(c.jobTitle.trim())}`);
    }
    for (const p of c.phones) {
      const t = (p.label || "CELL").toUpperCase();
      lines.push(`TEL;TYPE=${t}:${p.value}`);
    }
    for (const e of c.emails) {
      const t = (e.label || "INTERNET").toUpperCase();
      lines.push(`EMAIL;TYPE=${t}:${e.value}`);
    }
    for (const a of c.addresses) {
      const t = (a.label || "HOME").toUpperCase();
      lines.push(
        `ADR;TYPE=${t}:;;${escapeVCardValue(a.street || "")};${escapeVCardValue(a.city || "")};${escapeVCardValue(a.region || "")};${escapeVCardValue(a.postalCode || "")};${escapeVCardValue(a.country || "")}`,
      );
    }
    if (c.birthday) {
      lines.push(`BDAY:${c.birthday}`);
    }
    if (c.anniversary) {
      lines.push(`X-ANNIVERSARY:${c.anniversary}`);
    }
    for (const s of c.socialHandles) {
      if (/^https?:\/\//i.test(s.value)) {
        lines.push(`URL;TYPE=${s.label || "WORK"}:${s.value}`);
      } else {
        lines.push(`X-SOCIALPROFILE;TYPE=${s.label || "social"}:${escapeVCardValue(s.value)}`);
      }
    }
    if (c.tags.length > 0) {
      lines.push(`CATEGORIES:${c.tags.map(escapeVCardValue).join(",")}`);
    }
    const plainBio = c.bioHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (plainBio) {
      lines.push(`NOTE:${escapeVCardValue(plainBio)}`);
    }
    lines.push("END:VCARD");
    blocks.push(lines.join("\r\n"));
  }
  return blocks.join("\r\n");
}

// ============================================================================
// CSV Import & Export
// ============================================================================

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function escapeCsvCell(val: string): string {
  if (/[",\n\r]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function parseContactsCsv(text: string): Partial<ContactRecord>[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const findCol = (...candidates: string[]) =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const idxFirst = findCol("first name", "firstname", "given name");
  const idxLast = findCol("last name", "lastname", "family name", "surname");
  const idxName = findCol("name", "full name");
  const idxNickname = findCol("nickname");
  const idxCompany = findCol("company", "organization", "org");
  const idxTitle = findCol("job title", "title", "role");
  const idxPhone = findCol("phone", "mobile", "tel");
  const idxEmail = findCol("email", "e-mail");
  const idxAddress = findCol("address", "street");
  const idxCity = findCol("city");
  const idxCountry = findCol("country");
  const idxBday = findCol("birthday", "bday", "birth");
  const idxLastContacted = findCol("last contacted");
  const idxTags = findCol("tags", "labels", "categories");
  const idxNotes = findCol("notes", "bio", "description");

  const contacts: Partial<ContactRecord>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (idx: number) => (idx >= 0 ? (r[idx] || "").trim() : "");
    let firstName = get(idxFirst);
    let lastName = get(idxLast);
    if (!firstName && !lastName && idxName >= 0) {
      const full = get(idxName);
      const parts = full.split(/\s+/);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ");
    }
    const email = get(idxEmail);
    const phone = get(idxPhone);
    const company = get(idxCompany);
    if (!firstName && !lastName && !email && !phone && !company) continue;

    const phones: ContactLabeledValue[] = phone
      ? phone
          .split(/[;|]/)
          .map((v, idx) => ({
            id: newTmpId("tel"),
            label: idx === 0 ? "Mobile" : "Other",
            value: v.trim(),
            isPrimary: idx === 0,
          }))
          .filter((x) => x.value)
      : [];

    const emails: ContactLabeledValue[] = email
      ? email
          .split(/[;|]/)
          .map((v, idx) => ({
            id: newTmpId("mail"),
            label: idx === 0 ? "Personal" : "Other",
            value: v.trim(),
            isPrimary: idx === 0,
          }))
          .filter((x) => x.value)
      : [];

    const street = get(idxAddress);
    const city = get(idxCity);
    const country = get(idxCountry);
    const addresses: ContactAddress[] =
      street || city || country
        ? [
            {
              id: newTmpId("adr"),
              label: "Home",
              street: street || city,
              city,
              country,
              isPrimary: true,
            },
          ]
        : [];

    const noteRaw = get(idxNotes);
    const tagsRaw = get(idxTags);
    const bday = normalizeVCardDate(get(idxBday));

    contacts.push({
      firstName,
      lastName,
      nickname: get(idxNickname) || undefined,
      company: company || undefined,
      jobTitle: get(idxTitle) || undefined,
      phones,
      emails,
      addresses,
      socialHandles: [],
      customFields: [],
      relationships: [],
      circleIds: [],
      closeness: "regular",
      birthday: bday,
      lastContactedAt: normalizeVCardDate(get(idxLastContacted)),
      tags: tagsRaw
        ? tagsRaw
            .split(/[;|,]/)
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
        : [],
      bioHtml: noteRaw
        ? `<p>${noteRaw.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
        : "",
    });
  }
  return contacts;
}

export function exportContactsToCsv(
  contacts: ContactRecord[],
  circles: ContactCircle[],
): string {
  const circleMap = new Map(circles.map((c) => [c.id, c.name]));
  const header = [
    "First Name",
    "Last Name",
    "Nickname",
    "Company",
    "Job Title",
    "Closeness",
    "Circles",
    "Phone",
    "Email",
    "Address",
    "Birthday",
    "Anniversary",
    "Last Contacted",
    "Tags",
    "Notes",
  ];
  const lines = [header.map(escapeCsvCell).join(",")];
  for (const c of contacts) {
    const primaryAddr = c.addresses[0]
      ? formatContactAddressOneLine(c.addresses[0])
      : "";
    const plainBio = c.bioHtml
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const row = [
      c.firstName || "",
      c.lastName || "",
      c.nickname || "",
      c.company || "",
      c.jobTitle || "",
      CLOSENESS_TIER_META[c.closeness].label,
      c.circleIds.map((id) => circleMap.get(id)).filter(Boolean).join("; "),
      c.phones.map((p) => p.value).join("; "),
      c.emails.map((e) => e.value).join("; "),
      primaryAddr,
      c.birthday || "",
      c.anniversary || "",
      c.lastContactedAt || "",
      c.tags.join("; "),
      plainBio,
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return lines.join("\n");
}
