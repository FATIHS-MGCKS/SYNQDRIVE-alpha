import { DrivingCapabilityStatus } from '@prisma/client';
import { VehicleDrivingCapabilityLifecycleService } from './vehicle-driving-capability-lifecycle.service';

describe('VehicleDrivingCapabilityLifecycleService', () => {
  function makeService(deps: {
    preflightRan?: boolean;
    beforeFingerprint?: string;
    afterFingerprint?: string;
    beforeRows?: any[];
    afterRows?: any[];
    hardwareType?: string;
  }) {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          hardwareType: deps.hardwareType ?? 'LTE_R1',
        }),
      },
    };
    const repository = {
      findByVehicle: jest.fn().mockImplementation(async () => {
        if (repository.findByVehicle.mock.calls.length <= 1) {
          return deps.beforeRows ?? [];
        }
        return deps.afterRows ?? deps.beforeRows ?? [];
      }),
    };
    const preflight = {
      runPreflight: jest.fn().mockResolvedValue({
        ran: deps.preflightRan ?? true,
        probesWritten: 3,
        capabilityVersion: 'cap-preflight-v1',
        checkedAt: new Date().toISOString(),
      }),
      runPreflightIfStale: jest.fn().mockResolvedValue({
        ran: deps.preflightRan ?? true,
        probesWritten: 3,
        capabilityVersion: 'cap-preflight-v1',
        checkedAt: new Date().toISOString(),
      }),
    };
    let call = 0;
    const detectorResolver = {
      resolveForVehicle: jest.fn().mockImplementation(async () => {
        call += 1;
        const detectors =
          call === 1
            ? [{ detectorKey: 'native_harsh_events', status: deps.beforeFingerprint === 'changed' ? 'SHADOW' : 'PRODUCTION' }]
            : [{ detectorKey: 'native_harsh_events', status: deps.afterFingerprint === 'changed' ? 'UNSUPPORTED' : 'PRODUCTION' }];
        return {
          capabilityVersion: 'driving-detector-cap-v1',
          detectors,
          reasons: [],
        };
      }),
    };
    const tripMetrics = {
      drivingCapabilityRefresh: { inc: jest.fn() },
      drivingCapabilityTransition: { inc: jest.fn() },
      drivingCapabilityDetectorChanged: { inc: jest.fn() },
    };

    const service = new VehicleDrivingCapabilityLifecycleService(
      prisma as any,
      repository as any,
      preflight as any,
      detectorResolver as any,
      tripMetrics as any,
    );

    return { service, preflight, tripMetrics, repository, detectorResolver };
  }

  it('forces refresh on NEW_INTEGRATION without waiting for stale interval', async () => {
    const { service, preflight } = makeService({});
    const result = await service.requestRefresh({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      trigger: 'NEW_INTEGRATION',
    });
    expect(result.ran).toBe(true);
    expect(preflight.runPreflightIfStale).toHaveBeenCalled();
    expect(result.trigger).toBe('NEW_INTEGRATION');
  });

  it('skips aggressive refresh when post-trip gate is not stale', async () => {
    const { service, preflight } = makeService({ preflightRan: false });
    preflight.runPreflightIfStale.mockResolvedValue({
      ran: false,
      skippedReason: 'preflight_not_stale',
      probesWritten: 0,
      capabilityVersion: 'cap-preflight-v1',
      checkedAt: new Date().toISOString(),
    });
    const result = await service.refreshAfterTripInit('org-1', 'veh-1');
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toBe('preflight_not_stale');
  });

  it('records detector capability change for downstream jobs', async () => {
    const before = [{
      capabilityKey: 'behavior.harshAcceleration',
      capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
      providerSource: 'DIMO_TELEMETRY',
      capabilityVersion: 'cap-preflight-v1',
      hardwareProfile: 'LTE_R1',
      metadata: {},
    }];
    const after = [{
      ...before[0],
      capabilityStatus: DrivingCapabilityStatus.UNSUPPORTED,
      metadata: { lossStreak: 2 },
    }];

    const { service, tripMetrics, detectorResolver } = makeService({
      beforeRows: before,
      afterRows: after,
      afterFingerprint: 'changed',
    });

    detectorResolver.resolveForVehicle
      .mockResolvedValueOnce({
        capabilityVersion: 'driving-detector-cap-v1',
        detectors: [{ detectorKey: 'native_harsh_events', status: 'PRODUCTION' }],
        reasons: [],
      })
      .mockResolvedValueOnce({
        capabilityVersion: 'driving-detector-cap-v1',
        detectors: [{ detectorKey: 'native_harsh_events', status: 'UNSUPPORTED' }],
        reasons: [],
      });

    const result = await service.requestRefresh({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      trigger: 'SIGNAL_LOSS_RETRY',
      force: true,
    });

    expect(result.detectorCapabilityChanged).toBe(true);
    expect(tripMetrics.drivingCapabilityDetectorChanged.inc).toHaveBeenCalled();
    expect(result.transitions.some((t) => t.kind === 'SIGNAL_LOST')).toBe(true);
  });

  it('uses HARDWARE_PROVIDER_CHANGE trigger when stored profile differs', async () => {
    const beforeRows = [{
      capabilityKey: 'speed',
      capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
      providerSource: 'DIMO_TELEMETRY',
      capabilityVersion: 'cap-preflight-v1',
      hardwareProfile: 'LTE_R1',
      metadata: {},
    }];
    const { service } = makeService({
      hardwareType: 'SMART5',
      beforeRows,
      afterRows: beforeRows,
    });

    const result = await service.refreshAfterTripInit('org-1', 'veh-1');
    expect(result.trigger).toBe('HARDWARE_PROVIDER_CHANGE');
  });
});
