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
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataAuthorizationDto, DataAuthorizationStatsDto } from '../../lib/api';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { DataAuthorizationTab } from './settings/data-authorization/DataAuthorizationTab';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P218_ENFORCE_CLEAN_EXACT = [
  'rental/components/settings/data-authorization/DataAuthorizationTab.tsx',
];

function isP218EnforceCleanPath(relPath: string): boolean {
  return P218_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function readTabSource(): string {
  return readFileSync(
    join(__dirname, 'settings/data-authorization/DataAuthorizationTab.tsx'),
    'utf8',
  );
}

const sampleStats: DataAuthorizationStatsDto = {
  total: 3,
  active: 2,
  pending: 1,
  revoked: 0,
  expired: 0,
  highRisk: 1,
  expiringSoon: 0,
};

const sampleAuthorization: DataAuthorizationDto = {
  id: 'auth-1',
  organizationId: 'org-1',
  title: 'DIMO Telemetry Authorization',
  description: 'Partner telemetry access',
  requestingEntity: 'SynqDrive',
  moduleOrigin: 'DIMO',
  purpose: 'LIVE_MAP',
  purposes: ['LIVE_MAP'],
  sourceType: 'DIMO',
  processorType: 'SYSTEM',
  processorName: 'DIMO Network',
  scope: 'CONNECTED_VEHICLES',
  scopeKey: 'CONNECTED_VEHICLES',
  dataCategories: ['TELEMETRY_DATA', 'GPS_LOCATION'],
  destination: 'DIMO',
  vehicleIds: ['veh-1'],
  vehicleCount: 1,
  customerIds: [],
  bookingIds: [],
  accessPattern: 'READ',
  accessPatternKey: 'READ',
  status: 'ACTIVE',
  statusKey: 'ACTIVE',
  riskLevel: 'HIGH',
  riskLevelKey: 'HIGH',
  systemKey: 'dimo-telemetry',
  isSystemGenerated: true,
  lastAccessAt: null,
  accessCount: 0,
  revokeReason: null,
  grantedById: null,
  grantedByName: null,
  grantedAt: '2026-01-01T00:00:00.000Z',
  revokedById: null,
  revokedByName: null,
  revokedAt: null,
  expiresAt: null,
  notes: null,
  scopeNote: null,
  lastSyncedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('./settings/data-authorization/useDataAuthorizationCenter', () => ({
  useDataAuthorizationCenter: () => ({
    authorizations: [sampleAuthorization],
    stats: sampleStats,
    loading: false,
    error: null,
    actionId: null,
    load: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
    syncSystem: vi.fn(),
    create: vi.fn(),
    fetchById: vi.fn(),
  }),
}));

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    root.render(createElement(LanguageProvider, null, ui));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('data authorization global closure localization (P2.2.18)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports zero P218 scoped findings in inventory', () => {
    const findings = inventory.findings.filter((finding) => isP218EnforceCleanPath(finding.file));
    expect(findings).toHaveLength(0);
  });

  describe('DataAuthorizationTab source guards', () => {
    const source = readTabSource();

    it('uses canonical translation keys for tab chrome', () => {
      expect(source).toContain('useLanguage');
      expect(source).toContain("t('settings.dataAuth.kpi.active')");
      expect(source).toContain("t('settings.dataAuth.table.authorization')");
      expect(source).toContain("t('tasks.filter.resetFilters')");
      expect(source).toContain("t('common.all')");
      expect(source).toContain("t('settings.dataAuth.empty.noAuthorizations')");
      expect(source).toContain("t('settings.dataAuth.filters.summary'");
    });

    it('does not contain hidden German presentation literals', () => {
      expect(source).not.toMatch(/Filter zurücksetzen/);
      expect(source).not.toMatch(/Aktive Freigaben/);
      expect(source).not.toMatch(/Keine Treffer/);
      expect(source).not.toMatch(/Noch keine Datenfreigaben vorhanden/);
      expect(source).not.toMatch(/label:\s*'Ausstehende Anfragen'/);
    });

    it('preserves machine filter and status values', () => {
      expect(source).toContain("status: 'ACTIVE'");
      expect(source).toContain("status: 'PENDING'");
      expect(source).toContain("risk: 'HIGH'");
      expect(source).toContain("dataCategory: 'all'");
      expect(source).toContain('grant(selected.id)');
      expect(source).toContain('revoke(revokeTarget.id');
    });
  });

  describe('dictionary parity', () => {
    const keys = [
      'settings.dataAuth.kpi.active',
      'settings.dataAuth.kpi.pending',
      'settings.dataAuth.kpi.highRisk',
      'settings.dataAuth.kpi.expiring',
      'settings.dataAuth.kpi.revokedExpired',
      'settings.dataAuth.table.authorization',
      'settings.dataAuth.table.risk',
      'settings.dataAuth.table.affected',
      'settings.dataAuth.filters.summary',
      'settings.dataAuth.empty.noAuthorizations',
      'settings.dataAuth.empty.adjustFilters',
      'settings.dataAuth.empty.dimoAutoCreate',
    ] as const;

    it.each(keys)('resolves %s in EN and DE', (key) => {
      expect(en[key]).toBeTruthy();
      expect(de[key]).toBeTruthy();
      expect(en[key]).not.toBe(key);
      expect(de[key]).not.toBe(key);
    });
  });

  describe('EN chrome', () => {
    it('renders localized KPI labels and table headers', () => {
      const { container, cleanup } = renderWithLocale(
        'en',
        createElement(DataAuthorizationTab, { canWrite: true, canManage: true }),
      );
      expect(container.textContent).toContain(en['settings.dataAuth.kpi.active']);
      expect(container.textContent).toContain(en['settings.dataAuth.kpi.pending']);
      expect(container.textContent).toContain(en['settings.dataAuth.table.authorization']);
      expect(container.textContent).toContain(en['common.status']);
      cleanup();
    });
  });

  describe('DE chrome', () => {
    it('renders localized KPI labels and table headers', () => {
      const { container, cleanup } = renderWithLocale(
        'de',
        createElement(DataAuthorizationTab, { canWrite: true, canManage: true }),
      );
      expect(container.textContent).toContain(de['settings.dataAuth.kpi.active']);
      expect(container.textContent).toContain(de['settings.dataAuth.kpi.pending']);
      expect(container.textContent).toContain(de['settings.dataAuth.table.authorization']);
      expect(container.textContent).toContain(de['common.status']);
      cleanup();
    });
  });

  describe('dynamic authorization data preservation', () => {
    it('renders authorization title unchanged across locales', () => {
      const enView = renderWithLocale(
        'en',
        createElement(DataAuthorizationTab, { canWrite: false, canManage: false }),
      );
      expect(enView.container.textContent).toContain('DIMO Telemetry Authorization');
      expect(enView.container.textContent).toContain('DIMO Network');
      enView.cleanup();

      const deView = renderWithLocale(
        'de',
        createElement(DataAuthorizationTab, { canWrite: false, canManage: false }),
      );
      expect(deView.container.textContent).toContain('DIMO Telemetry Authorization');
      expect(deView.container.textContent).toContain('DIMO Network');
      deView.cleanup();
    });
  });

  describe('runtime locale switch', () => {
    it('updates KPI labels when locale changes', () => {
      const { container, cleanup } = renderWithLocale(
        'en',
        createElement(DataAuthorizationTab, { canWrite: false, canManage: false }),
      );
      expect(container.textContent).toContain(en['settings.dataAuth.kpi.highRisk']);
      expect(container.textContent).not.toContain(de['settings.dataAuth.kpi.highRisk']);
      cleanup();

      const deView = renderWithLocale(
        'de',
        createElement(DataAuthorizationTab, { canWrite: false, canManage: false }),
      );
      expect(deView.container.textContent).toContain(de['settings.dataAuth.kpi.highRisk']);
      expect(deView.container.textContent).not.toContain(en['settings.dataAuth.kpi.highRisk']);
      deView.cleanup();
    });
  });
});
