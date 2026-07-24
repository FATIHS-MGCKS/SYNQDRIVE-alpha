import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import {
  classifyVehicleCleaningStatusMutationError,
  deriveVehicleDetailHeaderCleaningStatus,
  mapCleaningPrismaOrDisplayToUi,
  mapCleaningUiStatusToPrisma,
  mutateVehicleCleaningStatus,
  resolveCleaningStatusMutationSideEffects,
  shouldWarnBeforeCleaningStatusChange,
} from './vehicle-cleaning-status-mutation';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      updateOperationalStatus: vi.fn(),
    },
  },
}));

describe('vehicle-cleaning-status-mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps UI labels to prisma cleaning statuses', () => {
    expect(mapCleaningUiStatusToPrisma('Clean')).toBe('CLEAN');
    expect(mapCleaningUiStatusToPrisma('Needs Cleaning')).toBe('NEEDS_CLEANING');
  });

  it('derives header cleaning status from fleet vehicle snapshot', () => {
    expect(deriveVehicleDetailHeaderCleaningStatus({ cleaningStatus: 'Needs Cleaning' })).toBe(
      'Needs Cleaning',
    );
    expect(deriveVehicleDetailHeaderCleaningStatus({ cleaningStatus: 'CLEAN' })).toBe('Clean');
    expect(mapCleaningPrismaOrDisplayToUi('NEEDS_CLEANING')).toBe('Needs Cleaning');
  });

  it('warns only when switching to Needs Cleaning', () => {
    expect(shouldWarnBeforeCleaningStatusChange('Needs Cleaning')).toBe(true);
    expect(shouldWarnBeforeCleaningStatusChange('Clean')).toBe(false);
  });

  it('persists successful cleaning status via existing PATCH endpoint', async () => {
    vi.mocked(api.vehicles.updateOperationalStatus).mockResolvedValue({
      vehicle: { id: 'veh-1', cleaningStatus: 'CLEAN' },
      cleaningTask: { action: 'completed', completedCount: 1 },
    });

    const result = await mutateVehicleCleaningStatus({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      uiStatus: 'Clean',
    });

    expect(result.prismaStatus).toBe('CLEAN');
    expect(api.vehicles.updateOperationalStatus).toHaveBeenCalledWith('org-1', 'veh-1', {
      cleaningStatus: 'CLEAN',
    });
  });

  it('classifies permission and not-found errors for cleaning domain', () => {
    expect(
      classifyVehicleCleaningStatusMutationError(new Error('HTTP 403 Forbidden'), 'de'),
    ).toMatch(/Reinigungsstatus/i);
    expect(
      classifyVehicleCleaningStatusMutationError(new Error('Vehicle not found'), 'de'),
    ).toMatch(/nicht gefunden/i);
    expect(
      classifyVehicleCleaningStatusMutationError(new Error('HTTP 500 Internal Server Error'), 'de'),
    ).toMatch(/konnte nicht gespeichert/i);
  });

  it('preserves cleaning-task side effects without implying rental readiness', () => {
    expect(
      resolveCleaningStatusMutationSideEffects('NEEDS_CLEANING', {
        prismaStatus: 'NEEDS_CLEANING',
        cleaningTask: { action: 'created', taskId: 'task-1' },
      }),
    ).toEqual(
      expect.objectContaining({
        toast: expect.objectContaining({ type: 'success', title: 'Reinigungsaufgabe erstellt' }),
        highlightedTaskId: 'task-1',
        openVehicleTasks: true,
      }),
    );

    expect(
      resolveCleaningStatusMutationSideEffects('CLEAN', {
        prismaStatus: 'CLEAN',
        cleaningTask: { action: 'completed', completedCount: 2 },
      })?.toast.description,
    ).toMatch(/2 offene Reinigungsaufgaben/);
  });

  it('rejects double-submit while first cleaning mutation is in flight', async () => {
    let resolveFirst: (() => void) | undefined;
    const pending = new Promise<{ vehicle: Record<string, unknown> }>((resolve) => {
      resolveFirst = () => resolve({ vehicle: { id: 'veh-1', cleaningStatus: 'CLEAN' } });
    });
    vi.mocked(api.vehicles.updateOperationalStatus).mockReturnValue(pending);

    let busy = false;
    const run = async () => {
      if (busy) return 'skipped';
      busy = true;
      try {
        await mutateVehicleCleaningStatus({
          orgId: 'org-1',
          vehicleId: 'veh-1',
          uiStatus: 'Clean',
        });
        return 'done';
      } finally {
        busy = false;
      }
    };

    const first = run();
    const second = run();
    resolveFirst?.();
    const results = await Promise.all([first, second]);
    expect(results).toContain('done');
    expect(results).toContain('skipped');
    expect(api.vehicles.updateOperationalStatus).toHaveBeenCalledTimes(1);
  });
});
