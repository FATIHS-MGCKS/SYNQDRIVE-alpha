import { describe, expect, it } from 'vitest';
import type { ApiTask } from '../../lib/api';
import {
  buildHealthSourceFindingId,
  buildHealthTaskPrefill,
  findDuplicateHealthTask,
} from './health-task-bridge.utils';

function task(partial: Partial<ApiTask> & Pick<ApiTask, 'id' | 'vehicleId' | 'status' | 'type'>): ApiTask {
  return {
    title: 'Task',
    priority: 'NORMAL',
    sourceType: 'MANUAL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as ApiTask;
}

describe('health-task-bridge.utils', () => {
  it('buildHealthSourceFindingId is stable for same finding', () => {
    const first = buildHealthSourceFindingId({
      vehicleId: 'veh-1',
      module: 'battery',
      reason: 'Low SOC',
    });
    const second = buildHealthSourceFindingId({
      vehicleId: 'veh-1',
      module: 'battery',
      reason: 'low soc',
    });
    expect(first).toBe(second);
  });

  it('does not false-match unrelated REPAIR task for battery finding', () => {
    const sourceFindingId = buildHealthSourceFindingId({
      vehicleId: 'veh-1',
      module: 'battery',
      reason: 'Low SOC',
    });
    const openTasks = [
      task({
        id: 't1',
        vehicleId: 'veh-1',
        status: 'OPEN',
        type: 'REPAIR',
        metadata: { healthModule: 'error_codes' },
      }),
    ];
    expect(findDuplicateHealthTask(openTasks, 'veh-1', 'battery', sourceFindingId)).toBeNull();
  });

  it('matches task with same sourceFindingId', () => {
    const prefill = buildHealthTaskPrefill({
      module: 'brakes',
      vehicleId: 'veh-1',
      rentalModule: { state: 'warning', reason: 'Pad wear', last_updated_at: null, data_stale: false },
    });
    const openTasks = [
      task({
        id: 't2',
        vehicleId: 'veh-1',
        status: 'OPEN',
        type: 'BRAKE_CHECK',
        metadata: prefill.metadata,
      }),
    ];
    expect(
      findDuplicateHealthTask(
        openTasks,
        'veh-1',
        'brakes',
        String(prefill.metadata.sourceFindingId),
      )?.id,
    ).toBe('t2');
  });
});
