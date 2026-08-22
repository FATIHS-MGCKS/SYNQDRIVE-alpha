// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsAttentionPanel } from './attention/OperationsAttentionPanel';
import { FleetReadinessAttentionPanel } from './attention/FleetReadinessAttentionPanel';
import { FinanceKpiStrip } from './FinanceKpiStrip';
import { TaskSummaryRow } from './tasks/TaskSummaryRow';
import type { DashboardViewModel } from './dashboardTypes';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ApiTask } from '../../../lib/api';

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../../context/RentalEntityNavigationContext', () => ({
  useRentalEntityNavigation: () => ({}),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    vendors: { list: vi.fn().mockResolvedValue([]) },
  },
}));

function tDe(key: TranslationKey, vars?: Record<string, string | number>): string {
  let value: string = de[key] ?? en[key] ?? String(key);
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(val));
    }
  }
  return value;
}

function attentionVm(): DashboardViewModel {
  return {
    dashboardAttention: {
      splitActive: true,
      operations: {
        items: [],
        entries: [],
        loading: false,
        error: null,
        errorCode: null,
        total: 0,
        refresh: async () => {},
        mutations: {
          markRead: async () => {},
          markUnread: async () => {},
          acknowledge: async () => {},
          snooze: async () => {},
          unsnooze: async () => {},
          resolveNotification: async () => {},
          archiveNotification: async () => {},
          loadMore: async () => {},
          hasMore: false,
        },
      },
      fleetReadiness: {
        items: [],
        entries: [],
        loading: false,
        error: null,
        errorCode: null,
        total: 0,
        refresh: async () => {},
        mutations: {
          markRead: async () => {},
          markUnread: async () => {},
          acknowledge: async () => {},
          snooze: async () => {},
          unsnooze: async () => {},
          resolveNotification: async () => {},
          archiveNotification: async () => {},
          loadMore: async () => {},
          hasMore: false,
        },
      },
      fleetSummary: {
        summary: {
          readyCount: 6,
          totalCount: 6,
          readyPercent: 100,
          notReadyCount: 0,
          unevaluableCount: 0,
          unknownCount: 0,
        },
        loading: false,
        error: null,
        refresh: async () => {},
      },
    },
  } as unknown as DashboardViewModel;
}

function taskFixture(): ApiTask {
  return {
    id: 'task-1',
    organizationId: 'org-1',
    title: 'Zahlungseingang prüfen',
    description: '',
    category: '',
    type: 'CUSTOM',
    status: 'OPEN',
    priority: 'HIGH',
    source: null,
    sourceType: 'MANUAL',
    dedupKey: null,
    vehicleId: null,
    bookingId: null,
    customerId: null,
    vendorId: null,
    alertId: null,
    documentId: null,
    fineId: null,
    invoiceId: null,
    serviceCaseId: null,
    assignedUserId: null,
    estimatedCostCents: null,
    actualCostCents: null,
    resolutionNote: null,
    blocksVehicleAvailability: false,
    metadata: null,
    isOverdue: true,
    bucket: 'OVERDUE',
    dueDate: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('dashboard UI copy refinement', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders operations panel title and subtitle in German', () => {
    act(() => {
      root.render(
        createElement(OperationsAttentionPanel, {
          vm: attentionVm(),
          handlers: {},
          t: tDe,
          locale: 'de',
          referenceNowMs: Date.now(),
        }),
      );
    });

    expect(container.textContent).toContain(de['dashboardAttention.operations.title']);
    expect(container.textContent).toContain(de['dashboardAttention.operations.subtitle']);
  });

  it('renders fleet panel title and subtitle in German', () => {
    act(() => {
      root.render(
        createElement(FleetReadinessAttentionPanel, {
          vm: attentionVm(),
          handlers: {},
          t: tDe,
          locale: 'de',
          referenceNowMs: Date.now(),
        }),
      );
    });

    expect(container.textContent).toContain(de['dashboardAttention.fleetReadiness.title']);
    expect(container.textContent).toContain(de['dashboardAttention.fleetReadiness.subtitle']);
  });

  it('keeps notification domain operations label unchanged', () => {
    expect(de['notification.domain.operations']).toBe('Betrieb');
    expect(en['notification.domain.operations']).toBe('Operations');
    expect(de['dashboardTasksOverview.domain.operations']).toBe('Betrieb');
  });

  it('does not render open invoices CTA in finance KPI strip', () => {
    const slice = (id: 'revenue' | 'profit' | 'open-receivables' | 'overdue-receivables') => ({
      id,
      title: id,
      count: id === 'open-receivables' ? 2 : id === 'overdue-receivables' ? 1 : 0,
      valueCents: id === 'open-receivables' ? 10000 : id === 'overdue-receivables' ? 5000 : 0,
      tone: 'neutral' as const,
      rows: [],
    });

    act(() => {
      root.render(
        createElement(FinanceKpiStrip, {
          businessPulseSlices: {
            revenue: slice('revenue'),
            profit: slice('profit'),
            'open-receivables': slice('open-receivables'),
            'overdue-receivables': slice('overdue-receivables'),
            expenses: { id: 'expenses', title: 'expenses', count: 0, valueCents: 0, tone: 'neutral', rows: [] },
            'paid-invoices': { id: 'paid-invoices', title: 'paid', count: 0, valueCents: 0, tone: 'neutral', rows: [] },
            'draft-invoices': { id: 'draft-invoices', title: 'draft', count: 0, valueCents: 0, tone: 'neutral', rows: [] },
            'failed-payments': { id: 'failed-payments', title: 'failed', count: 0, valueCents: 0, tone: 'neutral', rows: [] },
            'reserved-revenue': { id: 'reserved-revenue', title: 'reserved', count: 0, valueCents: 0, tone: 'neutral', rows: [] },
          },
          loading: false,
          error: false,
        }),
      );
    });

    expect(container.textContent).not.toContain(de['dashboard.openInvoices']);
    expect(container.textContent).not.toContain(en['dashboard.openInvoices']);
    expect(container.textContent).toContain(en['dashboard.openReceivables']);
  });

  it('uses tighter spacing between task meta row and title', () => {
    act(() => {
      root.render(
        createElement(TaskSummaryRow, {
          task: taskFixture(),
          t: tDe,
          locale: 'de-DE',
          expanded: false,
          controlsId: 'task-panel-1',
          onToggle: vi.fn(),
        }),
      );
    });

    const title = container.querySelector('p.text-pretty');
    expect(title?.className).toContain('mt-0.5');
    expect(title?.className).not.toContain('mt-1');
  });
});
