import type { HvCapabilityRefreshPayload } from '../battery-v2-job.types';
import { HvCapabilityRefreshHandler } from './hv-capability-refresh.handler';

describe('HvCapabilityRefreshHandler', () => {
  const capabilityPreflight = {
    runForVehicle: jest.fn(),
  };
  const handler = new HvCapabilityRefreshHandler(
    capabilityPreflight as never,
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

  it('runs capability preflight for vehicles with DIMO token', async () => {
    capabilityPreflight.runForVehicle.mockResolvedValue({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      provider: 'DIMO',
      checkedAt: new Date('2026-07-16T10:00:00.000Z'),
      queryError: null,
      signals: [
        {
          signalKey: 'hv.soc',
          preflightStatus: 'AVAILABLE_WITH_DATA',
        },
      ],
    });

    await expect(handler.handle(payload)).resolves.toBeUndefined();
    expect(capabilityPreflight.runForVehicle).toHaveBeenCalledWith(
      'org-1',
      'veh-1',
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
  });

  it('skips when preflight returns null (no DIMO token)', async () => {
    capabilityPreflight.runForVehicle.mockResolvedValue(null);

    await expect(handler.handle(payload)).resolves.toBeUndefined();
    expect(capabilityPreflight.runForVehicle).toHaveBeenCalledWith(
      'org-1',
      'veh-1',
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
  });
});
