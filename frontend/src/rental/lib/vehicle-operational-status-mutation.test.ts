import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { invalidateVehicleOperationalState } from './vehicle-operational-query';
import {
  classifyVehicleOperationalStatusMutationError,
  mutateVehicleOperationalStatus,
  shouldWarnBeforeVehicleOperationalStatusChange,
  vehicleOperationalStatusMutationSuccessMessage,
} from './vehicle-operational-status-mutation';
import { mapVehicleOperationalEditStatusToPrismaStatus } from './vehicle-operational-state';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      updateOperationalStatus: vi.fn(),
    },
  },
}));

vi.mock('./vehicle-operational-query', () => ({
  invalidateVehicleOperationalState: vi.fn().mockResolvedValue(undefined),
  vehicleOperationalQueryKeys: {
    fleetMap: (orgId: string) => ['vehicle-operational', orgId, 'fleet-map'],
    fleetHealth: (orgId: string) => ['vehicle-operational', orgId, 'fleet-health'],
    vehicleDetail: (orgId: string, vehicleId: string) => [
      'vehicle-operational',
      orgId,
      'vehicle',
      vehicleId,
    ],
    dashboardRuntime: (orgId: string) => ['vehicle-operational', orgId, 'dashboard-runtime'],
  },
}));

describe('vehicle-operational-status-mutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps edit tokens to prisma statuses', () => {
    expect(mapVehicleOperationalEditStatusToPrismaStatus('Available')).toBe('AVAILABLE');
    expect(mapVehicleOperationalEditStatusToPrismaStatus('Maintenance')).toBe('IN_SERVICE');
    expect(mapVehicleOperationalEditStatusToPrismaStatus('Manual Block')).toBe('OUT_OF_SERVICE');
  });

  it('warns only when leaving Available for Maintenance or Manual Block', () => {
    expect(shouldWarnBeforeVehicleOperationalStatusChange('Available', 'Maintenance')).toBe(true);
    expect(shouldWarnBeforeVehicleOperationalStatusChange('Available', 'Manual Block')).toBe(true);
    expect(shouldWarnBeforeVehicleOperationalStatusChange('Maintenance', 'Available')).toBe(false);
  });

  it('persists successful status change via existing API endpoint', async () => {
    vi.mocked(api.vehicles.updateOperationalStatus).mockResolvedValue({
      vehicle: { id: 'veh-1', status: 'IN_SERVICE' },
    });

    const result = await mutateVehicleOperationalStatus({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      editStatus: 'Maintenance',
    });

    expect(result.prismaStatus).toBe('IN_SERVICE');
    expect(api.vehicles.updateOperationalStatus).toHaveBeenCalledWith('org-1', 'veh-1', {
      status: 'IN_SERVICE',
    });
  });

  it('classifies backend, validation, permission, and foreign-org errors', () => {
    expect(
      classifyVehicleOperationalStatusMutationError(new Error('HTTP 500 Internal Server Error'), 'de'),
    ).toMatch(/konnte nicht gespeichert/i);
    expect(
      classifyVehicleOperationalStatusMutationError(
        new Error("Vehicle status 'RENTED' cannot be set via the admin status endpoint"),
        'de',
      ),
    ).toMatch(/nicht direkt gesetzt/i);
    expect(
      classifyVehicleOperationalStatusMutationError(new Error('HTTP 403 Forbidden'), 'de'),
    ).toMatch(/Berechtigung/i);
    expect(
      classifyVehicleOperationalStatusMutationError(new Error('Vehicle not found'), 'de'),
    ).toMatch(/nicht gefunden/i);
  });

  it('invalidates fleet and runtime query keys after successful patch', async () => {
    vi.mocked(api.vehicles.updateOperationalStatus).mockResolvedValue({
      vehicle: { id: 'veh-1', status: 'OUT_OF_SERVICE' },
    });

    await mutateVehicleOperationalStatus({
      orgId: 'org-1',
      vehicleId: 'veh-1',
      editStatus: 'Manual Block',
    });

    await invalidateVehicleOperationalState({
      orgId: 'org-1',
      vehicleIds: ['veh-1'],
      reason: 'vehicle-status-patch',
      optimistic: 'none',
    });

    expect(invalidateVehicleOperationalState).toHaveBeenCalledWith({
      orgId: 'org-1',
      vehicleIds: ['veh-1'],
      reason: 'vehicle-status-patch',
      optimistic: 'none',
    });
  });

  it('rejects double-submit while first mutation is in flight', async () => {
    let resolveFirst: (() => void) | undefined;
    const pending = new Promise<{ vehicle: Record<string, unknown> }>((resolve) => {
      resolveFirst = () => resolve({ vehicle: { id: 'veh-1', status: 'AVAILABLE' } });
    });
    vi.mocked(api.vehicles.updateOperationalStatus).mockReturnValue(pending);

    let busy = false;
    const run = async () => {
      if (busy) return 'skipped';
      busy = true;
      try {
        await mutateVehicleOperationalStatus({
          orgId: 'org-1',
          vehicleId: 'veh-1',
          editStatus: 'Available',
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

  it('does not emit optimistic success copy before server confirmation', () => {
    expect(vehicleOperationalStatusMutationSuccessMessage('Maintenance', 'de')).toMatch(/gesetzt/);
  });
});
