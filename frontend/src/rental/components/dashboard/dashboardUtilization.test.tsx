// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DashboardUtilizationPanel } from './utilization/DashboardUtilizationPanel';
import { UtilizationHeatmapLegend } from './utilization/UtilizationHeatmapLegend';
import { UtilizationMonthCalendar } from './utilization/UtilizationMonthCalendar';
import { UtilizationProgressBar } from './utilization/UtilizationProgressBar';
import {
  formatUtilizationPercent,
  utilizationHeatmapCellClass,
  utilizationHeatmapTone,
} from './utilization/utilizationHeatmapTone';
import { de } from '../../i18n/translations/de';

const testDir = dirname(fileURLToPath(import.meta.url));

vi.mock('../../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1' }),
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: keyof typeof de, vars?: Record<string, string>) => {
      let value = de[key] ?? String(key);
      if (vars) {
        for (const [name, val] of Object.entries(vars)) {
          value = value.replace(`{${name}}`, val);
        }
      }
      return value;
    },
  }),
}));

const overviewFixture = {
  status: 'AVAILABLE' as const,
  reason: null,
  year: 2026,
  month: 8,
  isPartialMonth: true,
  stationScoped: false,
  generatedAt: '2026-08-22T00:00:00.000Z',
  monthMetrics: {
    utilizationPercent: 78,
    bookingCount: 42,
    utilizationDeltaPp: 6,
    bookingDeltaPercent: 12,
  },
  previousMonthMetrics: {
    utilizationPercent: 72,
    bookingCount: 38,
    utilizationDeltaPp: null,
    bookingDeltaPercent: null,
  },
  days: Array.from({ length: 31 }, (_, index) => ({
    date: `2026-08-${String(index + 1).padStart(2, '0')}`,
    utilizationPercent: index === 0 ? 0 : index === 20 ? 92 : 32,
  })),
};

vi.mock('./utilization/useDashboardUtilization', () => ({
  useDashboardUtilization: () => ({
    month: { year: 2026, month: 8 },
    phase: 'settled',
    data: overviewFixture,
    error: null,
    reload: vi.fn(),
    goToPreviousMonth: vi.fn(),
    goToNextMonth: vi.fn(),
  }),
}));

const minimalVm = {
  selectedStationId: null,
} as never;

describe('dashboard utilization UI', () => {
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

  it('renders title Auslastung and KPI values', () => {
    act(() => {
      root.render(createElement(DashboardUtilizationPanel, { vm: minimalVm }));
    });
    expect(container.textContent).toContain(de['dashboard.utilization.title']);
    expect(container.textContent).toContain('78 %');
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('+6 PP');
    expect(container.textContent).toContain('+12 %');
  });

  it('does not render vehicle-hours copy', () => {
    act(() => {
      root.render(createElement(DashboardUtilizationPanel, { vm: minimalVm }));
    });
    expect(container.textContent).not.toMatch(/Fahrzeugstunden|vehicle hours/i);
  });

  it('renders progress bar with month utilization', () => {
    act(() => {
      root.render(
        createElement(UtilizationProgressBar, {
          label: de['dashboard.utilization.progressLabel'],
          percent: 78,
        }),
      );
    });
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('78');
  });

  it('renders calendar cells without visible percent text', () => {
    act(() => {
      root.render(
        createElement(UtilizationMonthCalendar, {
          year: 2026,
          month: 8,
          days: overviewFixture.days,
          weekdayLabels: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
          dayAriaLabel: (date, percent) => `${date}, ${percent ?? 0} Prozent`,
        }),
      );
    });
    expect(container.textContent).not.toMatch(/92\s*%|32\s*%/);
    expect(container.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(28);
  });

  it('applies heatmap tone classes and accessible day labels', () => {
    expect(utilizationHeatmapTone(0)).toBe('neutral');
    expect(utilizationHeatmapTone(92)).toBe('level5');
    expect(utilizationHeatmapCellClass('level5')).toContain('bg-[color:var(--brand)]');

    act(() => {
      root.render(
        createElement(UtilizationMonthCalendar, {
          year: 2026,
          month: 8,
          days: overviewFixture.days,
          weekdayLabels: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
          dayAriaLabel: (date, percent) =>
            de['dashboard.utilization.dayAriaLabel'].replace('{date}', date).replace('{percent}', String(percent ?? 0)),
        }),
      );
    });
    const highDay = container.querySelector('button[aria-label*="92"]');
    expect(highDay).toBeTruthy();
    expect(highDay?.textContent).toBe('21');
  });

  it('renders horizontal legend bar', () => {
    act(() => {
      root.render(
        createElement(UtilizationHeatmapLegend, {
          label: de['dashboard.utilization.legendLabel'],
          ticks: ['0%', '20%', '40%', '60%', '80%', '100%'],
        }),
      );
    });
    expect(container.querySelector('[role="img"]')).toBeTruthy();
    expect(container.textContent).toContain('0%');
    expect(container.textContent).toContain('100%');
  });

  it('formats utilization percent safely', () => {
    expect(formatUtilizationPercent(null)).toBe('—');
    expect(formatUtilizationPercent(78.4)).toBe('78 %');
  });
});

describe('dashboard utilization layout contract', () => {
  const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');
  const shellSrc = readFileSync(resolve(testDir, './dashboardShell.tsx'), 'utf8');
  const panelSrc = readFileSync(resolve(testDir, './utilization/DashboardUtilizationPanel.tsx'), 'utf8');

  it('uses side-by-side KPI stack and full-height calendar in utilization panel', () => {
    expect(panelSrc).toMatch(/layout="stack"/);
    expect(panelSrc).toMatch(/fillHeight/);
    expect(panelSrc).toMatch(/lg:grid-cols-\[minmax\(0,2fr\)_minmax\(0,3fr\)\]/);
    expect(panelSrc).not.toMatch(/UtilizationMonthNav/);
    expect(panelSrc).not.toMatch(/UtilizationProgressBar/);
  });

  it('places utilization panel beside ops and finance on desktop', () => {
    expect(shellSrc).toMatch(/controlFinanceGrid:[\s\S]*lg:grid-cols-2/);
    expect(shellSrc).toMatch(/utilizationSlot:[\s\S]*lg:col-start-2/);
    expect(dashboardViewSrc).toMatch(/controlFinanceGrid[\s\S]*DashboardUtilizationPanel/);
    expect(dashboardViewSrc).toMatch(/controlLeftColumn[\s\S]*ControlKpiStrip[\s\S]*FinanceKpiStrip/);
  });

  it('places notifications left and tasks right on desktop', () => {
    expect(shellSrc).toMatch(/notificationsSlot:[\s\S]*lg:col-start-1/);
    expect(shellSrc).toMatch(/tasksSlot:[\s\S]*lg:col-start-2/);
    expect(dashboardViewSrc).toMatch(/lowerAttentionGrid[\s\S]*notificationsSlot[\s\S]*tasksSlot/);
  });

  it('keeps mobile layout single-column stacked', () => {
    expect(shellSrc).toMatch(/lowerAttentionGrid:[\s\S]*grid-cols-1/);
    expect(shellSrc).toMatch(/notificationsSlot:[\s\S]*order-1/);
    expect(shellSrc).toMatch(/tasksSlot:[\s\S]*order-2/);
  });
});
