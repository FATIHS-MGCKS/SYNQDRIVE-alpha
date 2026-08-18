import { useCallback } from 'react';

export interface UseMasterPageUrlOptions {
  param: string;
  defaultValue: string;
  /** When false, only reads initial URL without writing on change */
  sync?: boolean;
}

export function readMasterPageUrlParam(param: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(param);
  return value ?? fallback;
}

export function writeMasterPageUrlParam(param: string, value: string, replace = false) {
  if (typeof window === 'undefined') return;
  const search = new URLSearchParams(window.location.search);
  search.set(param, value);
  const next = `${window.location.pathname}?${search.toString()}`;
  if (replace) {
    window.history.replaceState(null, '', next);
  } else {
    window.history.pushState(null, '', next);
  }
}

export function useMasterPageUrlParam(
  param: string,
  defaultValue: string,
): [string, (next: string, replace?: boolean) => void] {
  const setValue = useCallback(
    (next: string, replace = false) => {
      writeMasterPageUrlParam(param, next, replace);
    },
    [param],
  );

  return [readMasterPageUrlParam(param, defaultValue), setValue];
}
