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
  sidebarOpen: boolean;
  showFrontMatter: boolean;
  justify: boolean;
  allowRemoteImages: boolean;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

const SETTINGS_KEY = "mdx.settings.v1";
const RECENTS_KEY = "mdx.recents.v1";
const MAX_RECENTS = 12;

export const DEFAULT_SETTINGS: Settings = {
  theme: "auto",
  width: "normal",
  typeface: "sans",
  fontScale: 1,
  sidebarOpen: false,
  showFrontMatter: true,
  justify: false,
  allowRemoteImages: true,
};

export const THEMES: Theme[] = ["auto", "light", "dark", "sepia", "high-contrast"];
export const WIDTHS: Width[] = ["narrow", "normal", "wide", "full"];

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

/** Remembered scroll position, so reopening a long document lands where you left it. */
export function saveScroll(path: string, ratio: number): void {
  write(`mdx.scroll:${path}`, Math.max(0, Math.min(1, ratio)));
}

export function loadScroll(path: string): number {
  const value = read<number>(`mdx.scroll:${path}`, 0);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
