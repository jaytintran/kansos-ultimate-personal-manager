import { useCallback, useEffect, useState } from "react";
import type {
  CardDetailOptions,
  CoverSize,
  GroupByField,
  ReaderPreferences,
  SidebarSectionKey,
  SortDirection,
  SortField,
  ViewFolderCardLayout,
  ViewFolderDisplayMode,
} from "../../library";

export const DEFAULT_SIDEBAR_WIDTH = 248;
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 340;

const STORAGE_KEY = "kanso_library_studio_prefs_v1";

export const DEFAULT_READER_PREFS: ReaderPreferences = {
  theme: "kanso",
  fontFamily: "source-serif",
  fontSize: 18,
  fontWeight: 400,
  wordSpacing: 0,
  letterSpacing: 0,
  lineHeight: 1.72,
  paragraphSpacing: 0.9,
  textIndent: 0,
  textAlign: "left",
  pageMargins: 48,
  pageWidth: 720,
  contrastPreset: "balanced",
  brightness: 100,
  readingLayout: "scroll",
  publisherStyles: false,
  pdfViewMode: "original",
  pdfLayout: "continuous",
  pdfFitMode: "width",
  pdfZoom: 1.15,
  pdfThemeTone: false,
  pinHeader: true,
  pinBottomBar: true,
  pinLeftSidebar: false,
};

export const DEFAULT_CARD_DETAILS: CardDetailOptions = {
  subtitle: false,
  author: true,
  format: true,
  category: true,
  progress: true,
  tags: false,
};

export interface LibraryStudioUiPreferences {
  reader: ReaderPreferences;
  viewMode: "grid" | "table";
  coverSize: CoverSize;
  cardDetails: CardDetailOptions;
  sortField: SortField;
  sortDirection: SortDirection;
  groupBy: GroupByField;
  sidebarWidth: number;
  sidebarCollapsedDesktop: boolean;
  collapsedSections: Record<SidebarSectionKey, boolean>;
  viewFolderDisplayMode: ViewFolderDisplayMode;
  viewFolderCardLayout: ViewFolderCardLayout;
  hideFiledBooks: boolean;
}

const DEFAULT_UI_PREFS: LibraryStudioUiPreferences = {
  reader: DEFAULT_READER_PREFS,
  viewMode: "grid",
  coverSize: "standard",
  cardDetails: DEFAULT_CARD_DETAILS,
  sortField: "lastReadAt",
  sortDirection: "desc",
  groupBy: "none",
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sidebarCollapsedDesktop: false,
  collapsedSections: {
    library: false,
    folders: false,
    categories: false,
    tags: true,
  },
  viewFolderDisplayMode: "card",
  viewFolderCardLayout: "stacked",
  hideFiledBooks: false,
};

function normalizeReaderPrefs(
  raw: Partial<ReaderPreferences> | undefined,
): ReaderPreferences {
  const merged = { ...DEFAULT_READER_PREFS, ...(raw ?? {}) };
  if (merged.fontFamily === "serif") merged.fontFamily = "source-serif";
  if (merged.fontFamily === "sans") merged.fontFamily = "dm-sans";
  return merged;
}

function loadPrefs(): LibraryStudioUiPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const parsed = JSON.parse(raw) as Partial<LibraryStudioUiPreferences>;
    return {
      ...DEFAULT_UI_PREFS,
      ...parsed,
      reader: normalizeReaderPrefs(parsed.reader),
      cardDetails: { ...DEFAULT_CARD_DETAILS, ...(parsed.cardDetails ?? {}) },
      collapsedSections: {
        ...DEFAULT_UI_PREFS.collapsedSections,
        ...(parsed.collapsedSections ?? {}),
      },
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

export function useLibraryPreferences() {
  const [prefs, setPrefs] = useState<LibraryStudioUiPreferences>(loadPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  const updateUiPrefs = useCallback(
    (patch: Partial<LibraryStudioUiPreferences>) => {
      setPrefs((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const updateReaderPrefs = useCallback((patch: Partial<ReaderPreferences>) => {
    setPrefs((prev) => ({ ...prev, reader: { ...prev.reader, ...patch } }));
  }, []);

  const resetReaderPrefs = useCallback(() => {
    setPrefs((prev) => ({ ...prev, reader: { ...DEFAULT_READER_PREFS } }));
  }, []);

  const updateCardDetails = useCallback((patch: Partial<CardDetailOptions>) => {
    setPrefs((prev) => ({
      ...prev,
      cardDetails: { ...prev.cardDetails, ...patch },
    }));
  }, []);

  const toggleSidebarSection = useCallback((section: SidebarSectionKey) => {
    setPrefs((prev) => ({
      ...prev,
      collapsedSections: {
        ...prev.collapsedSections,
        [section]: !prev.collapsedSections[section],
      },
    }));
  }, []);

  return {
    prefs,
    updateUiPrefs,
    updateReaderPrefs,
    resetReaderPrefs,
    updateCardDetails,
    toggleSidebarSection,
  };
}
