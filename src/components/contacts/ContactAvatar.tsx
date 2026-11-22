import React, { useEffect, useState } from "react";
import {
  getContactDisplayName,
  getContactInitials,
  getDeterministicAvatarColor,
} from "../../lib/contactUtils";
import { CONTACT_PHOTO_CHANGE_EVENT, contactPhotoDb } from "../../lib/db";
import type { ContactRecord } from "../../types/contacts";

interface ContactAvatarProps {
  contact: Pick<
    ContactRecord,
    "id" | "firstName" | "lastName" | "nickname" | "company" | "avatarColor"
  >;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<ContactAvatarProps["size"]>, string> = {
  xs: "w-7 h-7 text-[11px] rounded-lg",
  sm: "w-9 h-9 text-xs rounded-xl",
  md: "w-11 h-11 text-sm rounded-xl",
  lg: "w-14 h-14 text-base rounded-2xl",
  xl: "w-16 h-16 text-lg rounded-2xl",
};

export const ContactAvatar: React.FC<ContactAvatarProps> = ({
  contact,
  size = "md",
  className = "",
}) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      void contactPhotoDb.getPhoto(contact.id).then((url) => {
        if (active) setPhotoUrl(url);
      });
    };
    load();

    const handleChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ contactId?: string }>).detail;
      if (!detail?.contactId || detail.contactId === contact.id) {
        load();
      }
    };
    window.addEventListener(CONTACT_PHOTO_CHANGE_EVENT, handleChanged);
    return () => {
      active = false;
      window.removeEventListener(CONTACT_PHOTO_CHANGE_EVENT, handleChanged);
    };
  }, [contact.id]);

  const bg =
    contact.avatarColor ||
    getDeterministicAvatarColor(`${getContactDisplayName(contact)}-${contact.id}`);
  const initials = getContactInitials(contact);

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={getContactDisplayName(contact)}
        className={`${SIZE_CLASSES[size]} object-cover shrink-0 border ${className}`}
        style={{ borderColor: "var(--border-subtle)" }}
      />
    );
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} shrink-0 flex items-center justify-center font-display font-bold text-white select-none tracking-tight ${className}`}
      style={{ backgroundColor: bg }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
};
