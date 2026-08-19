// @vitest-environment happy-dom
import { vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider, translateKey } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { Sidebar } from './Sidebar';
import { ControlKpiStrip } from './dashboard/ControlKpiStrip';
import type { DashboardRuntimeModel } from './dashboard/runtime';

const __dirname = dirname(fileURLToPath(import.meta.url));

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(MemoryRouter, null, createElement(LanguageProvider, null, ui)));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('rental navigation and dashboard localization (P2.2.1)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  it('resolves sidebar navigation labels through canonical i18n', () => {
    ({ cleanup } = renderWithLocale(
      'en',
      createElement(Sidebar, { currentView: 'dashboard' }),
    ));
    expect(document.body.textContent).toContain(en['nav.dashboard']);
    expect(document.body.textContent).toContain(en['nav.bookings']);
  });

  it('renders German sidebar labels', () => {
    ({ cleanup } = renderWithLocale(
      'de',
      createElement(Sidebar, { currentView: 'dashboard' }),
    ));
    expect(document.body.textContent).toContain(de['nav.dashboard']);
    expect(document.body.textContent).toContain(de['nav.bookings']);
  });

  it('resolves dashboard KPI labels through canonical i18n', () => {
    const runtime = {
      slices: {
        'ready-to-rent': { id: 'ready-to-rent', count: 2, title: '', subtitle: '', tone: 'success' },
        'active-rented': { id: 'active-rented', count: 1, title: '', subtitle: '', tone: 'brand' },
      },
      vehicleStates: [],
    } as unknown as DashboardRuntimeModel;

    ({ cleanup } = renderWithLocale(
      'en',
      createElement(ControlKpiStrip, {
        dashboardRuntime: runtime,
        onSelectSlice: () => {},
        locale: 'en',
      }),
    ));

    expect(document.body.textContent).toContain(en['dashboard.control.vehiclesReady']);
    expect(document.body.textContent).toContain(en['dashboard.todaysOperations.activeRentalsKpi']);
  });

  it('falls back Turkish to English for dashboard copy', () => {
    const result = translateKey('tr', 'dashboard.control.vehiclesReady');
    expect(result.source).toBe('fallback-en');
    expect(result.text).toBe(en['dashboard.control.vehiclesReady']);
  });

  it('falls back partial locales explicitly to English when key is missing', () => {
    const result = translateKey('pl', 'topbar.searchHint');
    expect(result.source).toBe('fallback-en');
    expect(result.text).toBe(en['topbar.searchHint']);
  });

  it('keeps internal vehicle operational enum values unchanged in builders', () => {
    const source = readFileSync(
      join(__dirname, 'dashboard/runtime/vehicleRuntimeStateBuilder.ts'),
      'utf8',
    );
    expect(source).toContain("'available'");
    expect(source).toContain("'active_rented'");
    expect(source).not.toMatch(/operationalStatus\s*=\s*['"]Verfügbar['"]/);
  });

  it('uses formattingLocale helper in touched dashboard utils', () => {
    const source = readFileSync(join(__dirname, 'dashboard/dashboard-i18n.ts'), 'utf8');
    expect(source).toContain('dashboardFormattingLocale');
    expect(source).toContain('getFormattingLocale');
  });

  it('reports zero enforce-clean findings for P2.2.1 scope in inventory', () => {
    expect(inventory.summary.enforceCleanRemaining).toBe(0);
    const scoped = inventory.findings.filter((finding) =>
      (finding.files ?? [finding.file]).some(
        (file: string) =>
          file === 'rental/components/TopBar.tsx' ||
          file === 'rental/components/Sidebar.tsx' ||
          file.startsWith('rental/components/dashboard/'),
      ),
    );
    expect(scoped).toHaveLength(0);
  });
});
