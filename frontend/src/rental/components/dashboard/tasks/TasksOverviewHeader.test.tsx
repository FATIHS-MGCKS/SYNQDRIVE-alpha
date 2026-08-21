// @vitest-environment happy-dom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksOverviewHeader } from './TasksOverviewHeader';
import { de } from '../../../i18n/translations/de';
import { en } from '../../../i18n/translations/en';
import type { TranslationKey } from '../../../i18n/translations/en';

function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  let value: string = de[key] ?? String(key);
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.replace(`{${name}}`, String(val));
    }
  }
  return value;
}

describe('TasksOverviewHeader', () => {
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

  function renderHeader(width = 375, openCount: number | null = 4) {
    container.style.width = `${width}px`;
    act(() => {
      root.render(
        createElement(TasksOverviewHeader, {
          title: de['dashboardTasksOverview.title'],
          openCount,
          countsLoading: openCount == null,
          counts: { open: 4, overdue: 1, today: 2, inProgress: 1, unassigned: 3 },
          canViewUnassigned: true,
          showMetrics: true,
          t,
          onOpenAllTasks: vi.fn(),
          onFilterSelect: vi.fn(),
        }),
      );
    });
  }

  function metricsGrid() {
    return container.querySelector('[data-testid="dashboard-tasks-overview-status-chips"]');
  }

  it.each([320, 375, 390, 430])('renders four metric buttons in one grid row at %ipx', (width) => {
    renderHeader(width);
    const grid = metricsGrid();
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain('grid-cols-4');
    expect(grid?.querySelectorAll('button').length).toBe(4);
  });

  it('shows open count inline with title and removes legacy subtitle', () => {
    renderHeader(375, 4);
    const headerRow = container.querySelector('[data-testid="dashboard-tasks-overview-header-row"]');
    expect(headerRow).not.toBeNull();
    expect(container.textContent).toContain(de['dashboardTasksOverview.openCountShort'].replace('{count}', '4'));
    expect(container.textContent).not.toContain(de['dashboardTasksOverview.openTasksSubtitle'].replace('{count}', '4'));
    expect(container.querySelector('[data-testid="dashboard-tasks-overview-open-count"]')).not.toBeNull();
  });

  it('aligns title, open count and CTA in the same header row', () => {
    renderHeader(430, 4);
    const headerRow = container.querySelector('[data-testid="dashboard-tasks-overview-header-row"]');
    expect(headerRow?.querySelector('h2')?.textContent).toBe(de['dashboardTasksOverview.title']);
    expect(headerRow?.textContent).toContain(de['dashboardTasksOverview.allTasks']);
  });

  it('provides compact and full unassigned labels for responsive display', () => {
    renderHeader(375);
    const shortLabel = container.querySelector('.min-\\[390px\\]\\:hidden');
    const fullLabel = container.querySelector('.hidden.min-\\[390px\\]\\:inline');
    expect(shortLabel?.textContent).toBe(de['dashboardTasksOverview.unassignedShort']);
    expect(fullLabel?.textContent).toBe(de['dashboardTasksOverview.unassigned']);
  });

  it('uses touch-friendly metric buttons with minimum hit target classes', () => {
    renderHeader(320);
    const buttons = metricsGrid()?.querySelectorAll('button');
    expect(buttons?.length).toBe(4);
    for (const button of buttons ?? []) {
      expect(button.className).toContain('min-h-11');
    }
  });
});

describe('TasksOverviewHeader english labels', () => {
  it('uses natural english priority labels in translation keys', () => {
    expect(en['dashboardTasksOverview.priorityHigh']).toBe('High priority');
    expect(en['dashboardTasksOverview.openCountShort']).toBe('{count} open');
  });
});
