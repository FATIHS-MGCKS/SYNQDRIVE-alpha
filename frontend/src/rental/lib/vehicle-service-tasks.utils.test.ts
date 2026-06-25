import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  selectOpenVehicleMaintenanceTasks,
  summarizeVehicleMaintenanceTasks,
} from './vehicle-service-tasks.utils';

function task(overrides: Partial<ApiTask> = {}): ApiTask {
  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title ?? 'Service prüfen',
    status: overrides.status ?? 'OPEN',
    priority: overrides.priority ?? 'NORMAL',
    type: overrides.type ?? 'VEHICLE_SERVICE',
    category: overrides.category ?? 'Service',
    dueDate: overrides.dueDate ?? null,
    isOverdue: overrides.isOverdue ?? false,
    blocksVehicleAvailability: overrides.blocksVehicleAvailability ?? false,
    createdAt: overrides.createdAt ?? '2026-06-25T10:00:00.000Z',
  } as ApiTask;
}

describe('vehicle-service-tasks.utils', () => {
  it('returns no overview service context for non-service or closed tasks', () => {
    const rows = [
      task({ id: 'doc', type: 'DOCUMENT_REVIEW', category: 'Dokumente' }),
      task({ id: 'done', status: 'DONE', type: 'VEHICLE_SERVICE' }),
    ];
    expect(selectOpenVehicleMaintenanceTasks(rows)).toHaveLength(0);
    expect(summarizeVehicleMaintenanceTasks(rows).openCount).toBe(0);
  });

  it('summarizes overdue, critical and blocking maintenance tasks once', () => {
    const rows = [
      task({
        id: 'svc-overdue',
        priority: 'CRITICAL',
        isOverdue: true,
        blocksVehicleAvailability: true,
      }),
    ];
    const summary = summarizeVehicleMaintenanceTasks(rows);
    expect(summary).toMatchObject({
      openCount: 1,
      overdueCount: 1,
      criticalCount: 1,
      blockingCount: 1,
    });
    expect(selectOpenVehicleMaintenanceTasks(rows).map((row) => row.id)).toEqual(['svc-overdue']);
  });
});
