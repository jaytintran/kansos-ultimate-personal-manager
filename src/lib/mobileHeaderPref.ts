const MOBILE_HEADER_PREF_KEY = "kanso_show_mobile_header_v1";
const MOBILE_HEADER_PREF_EVENT = "kanso-mobile-header-pref-change";

export function loadShowMobileHeader(): boolean {
  try {
    return localStorage.getItem(MOBILE_HEADER_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveShowMobileHeader(show: boolean): boolean {
  try {
    if (show) {
      localStorage.setItem(MOBILE_HEADER_PREF_KEY, "true");
    } else {
      localStorage.removeItem(MOBILE_HEADER_PREF_KEY);
    }
    window.dispatchEvent(new CustomEvent(MOBILE_HEADER_PREF_EVENT));
  } catch {
    // Ignore storage errors
  }
  return show;
}

export function subscribeShowMobileHeader(
  listener: (show: boolean) => void,
): () => void {
  const handleSync = () => listener(loadShowMobileHeader());
  window.addEventListener(MOBILE_HEADER_PREF_EVENT, handleSync);
  window.addEventListener("storage", handleSync);
  return () => {
    window.removeEventListener(MOBILE_HEADER_PREF_EVENT, handleSync);
    window.removeEventListener("storage", handleSync);
  };
}
