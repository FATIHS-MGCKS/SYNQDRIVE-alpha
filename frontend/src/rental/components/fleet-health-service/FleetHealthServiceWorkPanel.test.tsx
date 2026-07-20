// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiTask } from '../../../lib/api';
import { FleetHealthServiceWorkPanel } from './FleetHealthServiceWorkPanel';

vi.mock('./FleetHealthServiceTasksPanel', () => ({
  FleetHealthServiceTasksPanel: ({
    tasks,
    loading,
    error,
    focusTaskId,
  }: {
    tasks: ApiTask[];
    loading?: boolean;
    error?: string | null;
    focusTaskId?: string | null;
  }) => (
    <div
      data-testid="fhs-tasks-panel"
      data-count={tasks.length}
      data-loading={loading ? '1' : '0'}
      data-error={error ?? ''}
      data-focus={focusTaskId ?? ''}
    />
  ),
}));

vi.mock('./FleetHealthServiceCasesPanel', () => ({
  FleetHealthServiceCasesPanel: () => <div data-testid="fhs-cases-panel" />,
}));

vi.mock('./FleetHealthServiceSchedulePanel', () => ({
  FleetHealthServiceSchedulePanel: () => <div data-testid="fhs-schedule-panel" />,
}));

const tasks: ApiTask[] = [
  {
    id: 'task-1',
    organizationId: 'org-1',
    vehicleId: 'v1',
    title: 'Inspect tires',
    status: 'OPEN',
    priority: 'NORMAL',
    type: 'TIRE_SERVICE',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as ApiTask,
];

const baseProps = {
  vendors: [],
  tasks,
  serviceCases: [],
  serviceCasesDataReady: true,
  tasksLoading: false,
  tasksError: null,
  taskFilter: 'all' as const,
  onTaskFilterChange: vi.fn(),
  onViewChange: vi.fn(),
  onReload: vi.fn(),
};

describe('FleetHealthServiceWorkPanel', () => {
  it('renders tasks panel with source-state props in the tasks view', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServiceWorkPanel
        {...baseProps}
        activeView="tasks"
        focusTaskId="task-1"
        tasksError="Aufgaben konnten nicht geladen werden."
        tasksLoading
      />,
    );

    expect(html).toContain('data-testid="fhs-tasks-panel"');
    expect(html).toContain('data-count="1"');
    expect(html).toContain('data-loading="1"');
    expect(html).toContain('data-focus="task-1"');
    expect(html).toContain('Aufgaben konnten nicht geladen werden.');
    expect(html).not.toContain('data-testid="fhs-cases-panel"');
  });

  it('switches internal rendering when active work view changes', () => {
    const tasksHtml = renderToStaticMarkup(
      <FleetHealthServiceWorkPanel {...baseProps} activeView="tasks" />,
    );
    const casesHtml = renderToStaticMarkup(
      <FleetHealthServiceWorkPanel {...baseProps} activeView="service-cases" />,
    );
    const scheduleHtml = renderToStaticMarkup(
      <FleetHealthServiceWorkPanel {...baseProps} activeView="due-dates" />,
    );

    expect(tasksHtml).toContain('Aufgaben');
    expect(tasksHtml).toContain('data-testid="fhs-tasks-panel"');
    expect(casesHtml).toContain('Servicefälle');
    expect(casesHtml).toContain('data-testid="fhs-cases-panel"');
    expect(scheduleHtml).toContain('Fälligkeiten');
    expect(scheduleHtml).toContain('data-testid="fhs-schedule-panel"');
  });
});
