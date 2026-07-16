import { BatteryDriveProfile } from '../../battery-v2-domain';
import { DriveProfileResolverService } from '../../../drive-profile/drive-profile-resolver.service';
import type { HvCapabilityRefreshPayload } from '../battery-v2-job.types';
import { HvCapabilityRefreshHandler } from './hv-capability-refresh.handler';

describe('HvCapabilityRefreshHandler', () => {
  const driveProfileResolver = {
    resolveForVehicle: jest.fn(),
  };
  const handler = new HvCapabilityRefreshHandler(
    driveProfileResolver as unknown as DriveProfileResolverService,
  );

  const payload: HvCapabilityRefreshPayload = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    idempotencyKey: 'hv-cap:1',
    requestedAt: '2026-07-16T10:00:00.000Z',
    modelVersion: '1.0.0',
    correlationId: 'corr-1',
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: '2026-07-16T10:00:00.000Z',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when drive profile does not support HV measurement', async () => {
    driveProfileResolver.resolveForVehicle.mockResolvedValue({
      profile: BatteryDriveProfile.ICE,
      source: 'VEHICLE_MASTER',
      confidence: 'HIGH',
      telemetryFallback: false,
      evidence: ['master:fuel_type:DIESEL'],
    });

    await expect(handler.handle(payload)).resolves.toBeUndefined();
    expect(driveProfileResolver.resolveForVehicle).toHaveBeenCalledWith('veh-1');
  });

  it('continues for BEV profile', async () => {
    driveProfileResolver.resolveForVehicle.mockResolvedValue({
      profile: BatteryDriveProfile.BEV,
      source: 'VEHICLE_MASTER',
      confidence: 'HIGH',
      telemetryFallback: false,
      evidence: ['master:fuel_type:ELECTRIC'],
    });

    await expect(handler.handle(payload)).resolves.toBeUndefined();
  });
});
