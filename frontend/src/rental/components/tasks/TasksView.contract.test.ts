/**
 * Task Domain V2 — Global Tasks page contract (area 1)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const tasksDir = resolve(__dirname);
const rentalDir = resolve(__dirname, '../..');

describe('TasksView integration contract', () => {
  const source = readFileSync(resolve(tasksDir, '../TasksView.tsx'), 'utf8');

  it('exposes page test hooks and state surfaces', () => {
    expect(source).toContain('data-testid="tasks-view"');
    expect(source).toContain('data-testid="tasks-list"');
    expect(source).toContain('data-testid="tasks-loading"');
    expect(source).toContain('<TasksPageViews');
    expect(source).toContain('<TasksFilterPanel');
    expect(source).toContain('<TasksKpiStrip');
    expect(source).toContain('<GlobalTaskDetailPanel');
    expect(source).toContain('<TasksNewTaskDialog');
  });

  it('syncs filters with URL and uses task list hooks', () => {
    expect(source).toContain('readTasksListFiltersFromUrl');
    expect(source).toContain('syncTasksListFiltersToUrl');
    expect(source).toContain('useTasksPageViewModel');
    expect(source).toContain('subscribeTaskQueryInvalidation');
    expect(source).toContain('data-testid="tasks-load-more"');
  });

  it('renders loading, empty and error states', () => {
    expect(source).toContain('<ErrorState');
    expect(source).toContain('Aufgaben konnten nicht geladen werden');
    expect(source).toContain('<EmptyState');
    expect(source).toContain('animate-pulse');
  });

  it('is wired in rental App navigation', () => {
    const appSource = readFileSync(resolve(rentalDir, 'App.tsx'), 'utf8');
    expect(appSource).toContain("currentView === 'tasks'");
    expect(appSource).toContain('<TasksView');
  });
});
