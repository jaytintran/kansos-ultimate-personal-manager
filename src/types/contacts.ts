export type ContactClosenessTier =
  | "inner"
  | "close"
  | "regular"
  | "acquaintance";

export type ContactCheckInChannel =
  | "call"
  | "message"
  | "email"
  | "in-person"
  | "video"
  | "other";

export interface ContactCheckInLog {
  id: string;
  date: string; // YYYY-MM-DD
  channel: ContactCheckInChannel;
  note: string;
  createdAt: string;
}

export interface ContactLabeledValue {
  id: string;
  label: string;
  value: string;
  isPrimary?: boolean;
}

export interface ContactAddress {
  id: string;
  label: string;
  street: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  isPrimary?: boolean;
}

export interface ContactCustomField {
  id: string;
  key: string;
  value: string;
}

export interface ContactRelationshipLink {
  id: string;
  targetContactId?: string;
  targetName: string;
  relation: string;
}

export interface ContactCircle {
  id: string;
  name: string;
  color: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ContactRecord {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  company?: string;
  jobTitle?: string;
  circleIds: string[];
  closeness: ContactClosenessTier;
  tags: string[];
  favorite?: boolean;
  phones: ContactLabeledValue[];
  emails: ContactLabeledValue[];
  socialHandles: ContactLabeledValue[];
  addresses: ContactAddress[];
  customFields: ContactCustomField[];
  relationships: ContactRelationshipLink[];
  checkInLogs?: ContactCheckInLog[];
  birthday?: string | null; // YYYY-MM-DD or --MM-DD
  anniversary?: string | null; // YYYY-MM-DD or --MM-DD
  syncBirthdayToTimeline?: boolean;
  lastContactedAt?: string | null; // YYYY-MM-DD
  bioHtml: string;
  avatarColor?: string;
  hasLocalPhoto?: boolean;
  createdAt: string;
  updatedAt: string;
}
