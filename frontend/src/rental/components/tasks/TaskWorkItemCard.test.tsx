import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TaskListRow } from '../../lib/task-list.utils';
import { TaskWorkItemCard } from './TaskWorkItemCard';

function taskFixture(overrides?: Partial<TaskListRow>): TaskListRow {
  return {
    id: 'task-1',
    title: 'Reifen prüfen',
    description: 'Profil messen',
    category: 'Maintenance',
    type: 'TIRE_CHECK',
    status: 'Open',
    priority: 'High',
    source: 'MANUAL',
    sourceType: 'MANUAL',
    displaySource: 'Manuell',
    isSystemTask: false,
    vehicleId: 'veh-1',
    vehicleLicense: 'M-AB 1234',
    vehicleModel: 'VW Golf',
    station: 'Berlin',
    assignedUserId: 'user-1',
    assignedUserName: 'Alex Operator',
    createdByUserId: 'user-2',
    createdByUserName: 'Maria Admin',
    createdAtRaw: '2026-07-14T08:00:00.000Z',
    createdDate: '14.07.2026',
    dueDateRaw: '2026-07-15T00:00:00.000Z',
    dueDate: '15.07.2026',
    estimatedDuration: '—',
    linkedObjectLabel: 'M-AB 1234',
    linkedObjectSecondary: 'VW Golf',
    checklistProgressPercent: 50,
    checklistProgressLabel: '2 von 4',
    completionMode: null,
    completionModeLabel: null,
    isOverdue: false,
    serverBucket: 'TODAY',
    ...overrides,
  };
}

describe('TaskWorkItemCard', () => {
  it('renders linked object, assignee, due date and checklist progress', () => {
    const html = renderToStaticMarkup(
      <TaskWorkItemCard task={taskFixture()} onClick={vi.fn()} />,
    );

    expect(html).toContain('data-testid="task-work-item-card"');
    expect(html).toContain('Verknüpft');
    expect(html).toContain('M-AB 1234');
    expect(html).toContain('Zuständig');
    expect(html).toContain('Alex Operator');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('2 von 4');
  });

  it('shows completion mode for closed tasks', () => {
    const html = renderToStaticMarkup(
      <TaskWorkItemCard
        task={taskFixture({
          status: 'Completed',
          completionMode: 'AUTO_RESOLVED',
          completionModeLabel: 'Automatisch aufgelöst',
          completedDate: '15.07.2026',
          checklistProgressPercent: null,
          checklistProgressLabel: null,
        })}
        onClick={vi.fn()}
      />,
    );

    expect(html).toContain('Automatisch aufgelöst');
    expect(html).toContain('Abgeschlossen');
  });
});
