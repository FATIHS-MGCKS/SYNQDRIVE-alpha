import { describe, expect, it } from 'vitest';
import {
  cycleThemePreference,
  isThemePreference,
  resolveIsDarkMode,
} from './theme';

describe('theme', () => {
  it('resolves effective dark mode from preference', () => {
    expect(resolveIsDarkMode('light', true)).toBe(false);
    expect(resolveIsDarkMode('dark', false)).toBe(true);
    expect(resolveIsDarkMode('system', true)).toBe(true);
    expect(resolveIsDarkMode('system', false)).toBe(false);
  });

  it('cycles system → light → dark → system', () => {
    expect(cycleThemePreference('system')).toBe('light');
    expect(cycleThemePreference('light')).toBe('dark');
    expect(cycleThemePreference('dark')).toBe('system');
  });

  it('validates stored preference values', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('auto')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
