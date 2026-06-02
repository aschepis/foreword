/**
 * Theme management: light (paper) by default; dark via toggle.
 *
 * Persists in localStorage under "foreword:theme" and applies a class
 * to <html> so CSS variables in styles.css flip atomically. Reads the
 * stored value at module load time so the right theme is applied
 * before React mounts (no flash).
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'foreword:theme';

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {}
  return 'light';
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function setStoredTheme(theme) {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  applyTheme(theme);
}

/** Hook for components that need to render based on current theme. */
export function useTheme() {
  const [theme, setTheme] = useState(getStoredTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  return [theme, (next) => { setTheme(next); setStoredTheme(next); }];
}
