import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  applyThemeClass,
  cycleThemePreference,
  readThemePreference,
  resolveIsDarkMode,
  writeThemePreference,
  type ThemePreference,
} from '../lib/theme';

interface AppThemeContextValue {
  preference: ThemePreference;
  isDarkMode: boolean;
  setThemePreference: (preference: ThemePreference) => void;
  cycleThemePreference: () => void;
}

const AppThemeCtx = createContext<AppThemeContextValue | null>(null);

function subscribeSystemDark(onStoreChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onStoreChange);
  return () => mq.removeEventListener('change', onStoreChange);
}

function getSystemDarkSnapshot(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystemDark, getSystemDarkSnapshot, () => false);
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());
  const systemDark = useSystemPrefersDark();
  const isDarkMode = useMemo(
    () => resolveIsDarkMode(preference, systemDark),
    [preference, systemDark],
  );

  useEffect(() => {
    applyThemeClass(isDarkMode);
    writeThemePreference(preference);
  }, [isDarkMode, preference]);

  const cycle = useCallback(() => {
    setPreference((current) => cycleThemePreference(current));
  }, []);

  const value = useMemo(
    () => ({
      preference,
      isDarkMode,
      setThemePreference: setPreference,
      cycleThemePreference: cycle,
    }),
    [preference, isDarkMode, cycle],
  );

  return <AppThemeCtx.Provider value={value}>{children}</AppThemeCtx.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeCtx);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}
