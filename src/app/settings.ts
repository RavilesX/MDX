/**
 * Viewer preferences and recent files, persisted per user in localStorage.
 * Reads are defensive: a corrupted or absent value must never stop the app
 * from opening a document.
 */

export type Theme = "auto" | "light" | "dark" | "sepia" | "high-contrast";
export type Width = "narrow" | "normal" | "wide" | "full";
export type Typeface = "sans" | "serif" | "mono";

export interface Settings {
  theme: Theme;
  width: Width;
  typeface: Typeface;
  fontScale: number;
  /** Document zoom: scales the rendered page, diagrams and images included. */
  zoom: number;
  sidebarOpen: boolean;
  showFrontMatter: boolean;
  justify: boolean;
  allowRemoteImages: boolean;
}

export interface SessionTab {
  path: string;
  name: string;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

const SETTINGS_KEY = "mdx.settings.v1";
const RECENTS_KEY = "mdx.recents.v1";
const TABS_KEY = "mdx.tabs.v1";
const MAX_RECENTS = 12;
const MAX_TABS = 30;

export const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  width: "normal",
  typeface: "sans",
  fontScale: 1,
  zoom: 1,
  sidebarOpen: false,
  showFrontMatter: true,
  justify: false,
  allowRemoteImages: true,
};

export const THEMES: Theme[] = ["auto", "light", "dark", "sepia", "high-contrast"];
export const WIDTHS: Width[] = ["narrow", "normal", "wide", "full"];

/** The steps zoom moves through, as in a browser. */
export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const FONT_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing contexts and blocked site data land here. Preferences
    // simply do not persist; the session still works.
  }
}

export function loadSettings(): Settings {
  const stored = read<Partial<Settings>>(SETTINGS_KEY, {});
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  // Clamp anything a hand-edited value could have broken.
  merged.fontScale = Math.min(2.2, Math.max(0.7, Number(merged.fontScale) || 1));
  merged.zoom = Math.min(3, Math.max(0.5, Number(merged.zoom) || 1));
  if (!THEMES.includes(merged.theme)) merged.theme = DEFAULT_SETTINGS.theme;
  if (!WIDTHS.includes(merged.width)) merged.width = DEFAULT_SETTINGS.width;
  return merged;
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

export function loadRecents(): RecentFile[] {
  const list = read<RecentFile[]>(RECENTS_KEY, []);
  return Array.isArray(list) ? list.filter((r) => r && typeof r.path === "string") : [];
}

export function pushRecent(file: Omit<RecentFile, "openedAt">): RecentFile[] {
  const next = [
    { ...file, openedAt: Date.now() },
    ...loadRecents().filter((r) => r.path !== file.path),
  ].slice(0, MAX_RECENTS);
  write(RECENTS_KEY, next);
  return next;
}

export function forgetRecent(path: string): RecentFile[] {
  const next = loadRecents().filter((r) => r.path !== path);
  write(RECENTS_KEY, next);
  return next;
}

/**
 * The tabs that were open when the app last closed, so a session survives a
 * restart. Only the co-ordinates are stored; the documents are read from disk
 * again when a tab is activated.
 */
export function loadOpenTabs(): SessionTab[] {
  const list = read<SessionTab[]>(TABS_KEY, []);
  return Array.isArray(list)
    ? list.filter((t) => t && typeof t.path === "string" && t.path).slice(0, MAX_TABS)
    : [];
}

export function saveOpenTabs(tabs: SessionTab[]): void {
  write(TABS_KEY, tabs.slice(0, MAX_TABS));
}

/** Remembered scroll position, so reopening a long document lands where you left it. */
export function saveScroll(path: string, ratio: number): void {
  write(`mdx.scroll:${path}`, Math.max(0, Math.min(1, ratio)));
}

export function loadScroll(path: string): number {
  const value = read<number>(`mdx.scroll:${path}`, 0);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
