import type { Settings } from "./settings.js";

/**
 * Themes are pure CSS custom properties. This module only decides which
 * attributes sit on <html>; the palettes live in styles/themes.css.
 */

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function isDarkTheme(theme: Settings["theme"]): boolean {
  if (theme === "dark" || theme === "high-contrast") return true;
  if (theme === "light" || theme === "sepia") return false;
  return media.matches;
}

export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.dataset.width = settings.width;
  root.dataset.typeface = settings.typeface;
  root.classList.toggle("dark", isDarkTheme(settings.theme));
  root.classList.toggle("justify", settings.justify);
  root.style.setProperty("--font-scale", String(settings.fontScale));
}

/** Follow the desktop's light/dark switch while the theme is set to auto. */
export function watchSystemTheme(onChange: () => void): void {
  media.addEventListener("change", onChange);
}
