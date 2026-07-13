export const THEME_STORAGE_KEY = 'synqdrive-theme-preference';

export type ThemePreference = 'system' | 'light' | 'dark';

const VALID: ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value != null && (VALID as string[]).includes(value);
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return 'system';
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* ignore */
  }
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveIsDarkMode(
  preference: ThemePreference,
  systemDark: boolean = systemPrefersDark(),
): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return systemDark;
}

export function applyThemeClass(isDark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'light';
  if (current === 'light') return 'dark';
  return 'system';
}

export function themePreferenceLabel(preference: ThemePreference): string {
  switch (preference) {
    case 'system':
      return 'Design: Systemeinstellung';
    case 'light':
      return 'Design: Hell';
    case 'dark':
      return 'Design: Dunkel';
  }
}

/** Inline bootstrap for index.html — keep in sync with resolveIsDarkMode defaults. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}';var p=localStorage.getItem(k);var dark=p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);}catch(e){}})();`;
