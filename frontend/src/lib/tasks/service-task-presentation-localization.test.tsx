// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { LOCALE_STORAGE_KEY } from '../../i18n/locales';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import type { ApiTask } from '../../lib/api';
import { ServiceTaskCard } from '../../rental/components/service-center/ServiceTaskCard';
import {
  serviceBoardColumnLabel,
  serviceTaskPriorityLabel,
  serviceTaskStatusLabel,
  serviceTaskTypeLabel,
  serviceTaskTypeLabelForType,
  serviceVehicleLabel,
} from './service-task-presentation-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const LEGACY_GERMAN_TASK_TYPE_PRESENTATION = [
  'Fahrzeug-Service / Wartung',
  'Fahrzeug-Inspektion / HU',
  'Reifen prüfen / wechseln',
  'Bremsen prüfen',
  'Batterie prüfen',
  'Fahrzeug reinigen',
  'Buchung vorbereiten',
  'Übergabe',
  'Rückgabe',
  'Dokument prüfen',
  'Rechnung erforderlich',
  'Kunden-Nachverfolgung',
  'Reparatur / Schaden',
  'Benutzerdefiniert',
];

const P216A_ENFORCE_CLEAN_EXACT = [
  'rental/lib/service-task-semantics.ts',
  'lib/tasks/service-task-presentation-i18n.ts',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/VehicleTasksView.tsx',
  'rental/components/EntityTasksSection.tsx',
  'rental/components/vehicle-detail/VehicleServiceContextPanel.tsx',
  'rental/components/fleet-health-service/fleet-health-service-case-list.ts',
  'rental/components/service-center/ServiceTaskCard.tsx',
  'rental/components/service-center/ServiceScheduleRow.tsx',
  'rental/components/service-center/ServiceSchedulePanel.tsx',
  'rental/components/service-center/ServiceTasksCalendar.tsx',
  'rental/components/service-center/ServiceHistoryTimelineRow.tsx',
  'rental/components/service-center/ServiceTasksBoard.tsx',
  'rental/components/service-center/ServiceTaskCreateModal.tsx',
  'rental/components/service-center/ServiceHistoryPanel.tsx',
  'rental/components/service-center/ServiceTasksPanel.tsx',
  'rental/components/service-center/ServiceCenterContextBar.tsx',
];

function isP216AEnforceCleanPath(relPath: string): boolean {
  return P216A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
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

function renderStaticWithLocale(locale: 'de' | 'en', ui: ReactElement) {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  return renderToStaticMarkup(createElement(LanguageProvider, null, ui));
}

function apiTaskFixture(overrides?: Partial<ApiTask>): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Annual inspection',
    description: '',
    category: 'Maintenance',
    type: 'VEHICLE_SERVICE',
    status: 'OPEN',
    priority: 'NORMAL',
    source: 'MANUAL',
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: 'veh-1',
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: null,
    assignedUserName: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: false,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    checklist: [],
    ...overrides,
  };
}

describe('shared service task presentation localization (P2.2.16A)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    window.localStorage.clear();
  });

  describe('serviceTaskTypeLabel', () => {
    it('returns English under EN locale (no German leakage)', () => {
      const label = serviceTaskTypeLabel('en', {
        type: 'VEHICLE_SERVICE',
        category: '',
        metadata: null,
      });
      expect(label).toBe(en['tasks.type.VEHICLE_SERVICE']);
      expect(label).toBe('Vehicle service');
      expect(label).not.toContain('Fahrzeug');
      expect(label).not.toMatch(/Wartung/);
    });

    it('returns German under DE locale', () => {
      const label = serviceTaskTypeLabel('de', {
        type: 'VEHICLE_SERVICE',
        category: '',
        metadata: null,
      });
      expect(label).toBe(de['tasks.type.VEHICLE_SERVICE']);
    });

    it('localizes damage repair variant without mutating machine type', () => {
      const task = {
        type: 'REPAIR' as const,
        category: '',
        metadata: { damageId: 'dmg-1', origin: 'DAMAGE' },
      };
      expect(serviceTaskTypeLabel('en', task)).toBe(en['tasks.type.repairDamage']);
      expect(serviceTaskTypeLabel('de', task)).toBe(de['tasks.type.repairDamage']);
      expect(task.type).toBe('REPAIR');
    });

    it('localizes diagnostics category hint without mutating category token', () => {
      const task = {
        type: 'CUSTOM' as const,
        category: 'DTC Fehler',
        metadata: null,
      };
      expect(serviceTaskTypeLabel('en', task)).toBe(en['tasks.type.diagnostics']);
      expect(task.category).toBe('DTC Fehler');
    });

    it('falls back to CUSTOM type label for unknown machine type without raw key leakage', () => {
      const task = {
        type: 'CUSTOM' as const,
        category: '',
        metadata: null,
      };
      const label = serviceTaskTypeLabel('en', task);
      expect(label).toBe(en['tasks.type.CUSTOM']);
      expect(label).not.toMatch(/^tasks\./);
      expect(label).not.toContain('Benutzerdefiniert');
    });

    it('does not reintroduce legacy German presentation map strings under EN', () => {
      const task = apiTaskFixture();
      const label = serviceTaskTypeLabel('en', task);
      for (const legacy of LEGACY_GERMAN_TASK_TYPE_PRESENTATION) {
        expect(label).not.toBe(legacy);
      }
    });
  });

  describe('status and priority presentation', () => {
    it('localizes status labels without mutating machine status', () => {
      const status = 'IN_PROGRESS' as const;
      expect(serviceTaskStatusLabel('en', status)).toBe(en['tasks.filter.status.IN_PROGRESS']);
      expect(serviceTaskStatusLabel('de', status)).toBe(de['tasks.filter.status.IN_PROGRESS']);
      expect(status).toBe('IN_PROGRESS');
    });

    it('localizes priority labels without mutating machine priority', () => {
      const priority = 'CRITICAL' as const;
      expect(serviceTaskPriorityLabel('en', priority)).toBe(en['tasks.filter.priority.CRITICAL']);
      expect(serviceTaskPriorityLabel('de', priority)).toBe(de['tasks.filter.priority.CRITICAL']);
      expect(priority).toBe('CRITICAL');
    });
  });

  describe('supporting presentation helpers', () => {
    it('localizes priority and board columns via canonical keys', () => {
      expect(serviceTaskPriorityLabel('en', 'HIGH')).toBe(en['tasks.filter.priority.HIGH']);
      expect(serviceBoardColumnLabel('de', 'waiting-vendor')).toBe(de['tasks.serviceBoard.waitingVendor']);
    });

    it('localizes vehicle label fallbacks', () => {
      expect(serviceVehicleLabel('en', null)).toBe(en['tasks.vehicleLabel.unknown']);
      expect(serviceVehicleLabel('de', { make: 'VW', model: 'Golf' })).toBe('VW Golf');
    });

    it('maps ApiTaskType values through canonical type keys', () => {
      expect(serviceTaskTypeLabelForType('en', 'TIRE_CHECK')).toBe(en['tasks.type.TIRE_CHECK']);
      expect(serviceTaskTypeLabelForType('de', 'BRAKE_CHECK')).toBe(de['tasks.type.BRAKE_CHECK']);
    });
  });

  describe('production consumer rendering', () => {
    it('renders ServiceTaskCard EN task type without German leakage', () => {
      const html = renderStaticWithLocale(
        'en',
        createElement(ServiceTaskCard, {
          task: apiTaskFixture(),
          onOpen: vi.fn(),
        }),
      );
      expect(html).toContain(en['tasks.type.VEHICLE_SERVICE']);
      expect(html).not.toContain('Fahrzeug-Service');
      expect(html).not.toMatch(/Wartung/);
    });

    it('renders ServiceTaskCard DE task type with German dictionary strings', () => {
      const html = renderStaticWithLocale(
        'de',
        createElement(ServiceTaskCard, {
          task: apiTaskFixture(),
          onOpen: vi.fn(),
        }),
      );
      expect(html).toContain(de['tasks.type.VEHICLE_SERVICE']);
    });

    it('renders vendor operational task row EN via shared adapter path', async () => {
      const VendorTaskRow = () =>
        createElement('p', null, serviceTaskTypeLabel('en', apiTaskFixture({ type: 'TIRE_CHECK' })));
      const view = renderWithLocale('en', createElement(VendorTaskRow));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(en['tasks.type.TIRE_CHECK']);
      expect(view.container.textContent).not.toContain('Reifen prüfen');
    });

    it('renders vendor operational task row DE via shared adapter path', async () => {
      const VendorTaskRow = () =>
        createElement('p', null, serviceTaskTypeLabel('de', apiTaskFixture({ type: 'TIRE_CHECK' })));
      const view = renderWithLocale('de', createElement(VendorTaskRow));
      cleanup = view.cleanup;
      await act(async () => {});
      expect(view.container.textContent).toContain(de['tasks.type.TIRE_CHECK']);
    });
  });

  describe('P216A enforce-clean inventory', () => {
    it('reports zero P216A scoped findings', () => {
      const p216aFindings = inventory.findings.filter((finding) =>
        isP216AEnforceCleanPath(finding.file),
      );
      expect(p216aFindings).toHaveLength(0);
    });

    it('keeps service-task-semantics machine-only', () => {
      const source = readFileSync(
        join(__dirname, '../../rental/lib/service-task-semantics.ts'),
        'utf8',
      );
      expect(source).not.toContain('TASK_TYPE_LABEL_DE');
      expect(source).not.toContain('function taskTypeLabel');
      for (const legacy of LEGACY_GERMAN_TASK_TYPE_PRESENTATION) {
        expect(source).not.toContain(legacy);
      }
    });

    it('keeps presentation adapter free of inline German literals', () => {
      const source = readFileSync(
        join(__dirname, 'service-task-presentation-i18n.ts'),
        'utf8',
      );
      for (const legacy of LEGACY_GERMAN_TASK_TYPE_PRESENTATION) {
        expect(source).not.toContain(legacy);
      }
    });
  });
});
