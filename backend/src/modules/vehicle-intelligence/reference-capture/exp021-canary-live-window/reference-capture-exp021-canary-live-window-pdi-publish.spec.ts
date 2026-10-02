import { TripStatus } from '@prisma/client';
import {
  comparePdiAuthorityInterval,
  EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE,
  isTripEligibleForCanaryPdiPublication,
  publishCanaryLiveWindowPhysicalDriveInterval,
  resolveCanaryLiveWindowVehicleTripPdiAuthority,
} from './reference-capture-exp021-canary-live-window-pdi-publish.lib';
import { EXP021_CANARY_LIVE_WINDOW_CANARY } from './reference-capture-exp021-canary-live-window-activation.constants';
import { buildExp021CanaryCohortAuthority } from './reference-capture-exp021-canary-live-window-cohort.lib';

function ksMxPdiCtx(overrides: {
  vehicleTripId?: string;
  sessionId?: string;
  activationNotBeforeMs?: number;
}) {
  const cohort = buildExp021CanaryCohortAuthority([
    {
      organizationId: EXP021_CANARY_LIVE_WINDOW_CANARY.organizationId,
      vehicleId: EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId,
      tokenId: EXP021_CANARY_LIVE_WINDOW_CANARY.tokenId,
    },
  ])!;
  return {
    vehicleTripId: overrides.vehicleTripId ?? 'trip-1',
    organizationId: EXP021_CANARY_LIVE_WINDOW_CANARY.organizationId,
    vehicleId: EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId,
    tokenId: EXP021_CANARY_LIVE_WINDOW_CANARY.tokenId,
    sessionId: overrides.sessionId ?? 'sess-1',
    activationNotBeforeMs: overrides.activationNotBeforeMs ?? Date.parse('2026-09-20T10:00:00.000Z'),
    cohort,
  };
}

describe('reference-capture-exp021-canary-live-window-pdi-publish.lib', () => {
  const T0 = Date.parse('2026-09-20T10:00:00.000Z');
  const tripStart = new Date(T0 + 60_000);
  const tripEnd = new Date(T0 + 600_000);

  it('isTripEligibleForCanaryPdiPublication requires ledger and current NOT_BEFORE', () => {
    expect(
      isTripEligibleForCanaryPdiPublication({
        tripStartTimeMs: tripStart.getTime(),
        activationNotBeforeMs: T0,
        currentActivationNotBeforeMs: T0,
      }),
    ).toBe(true);
    expect(
      isTripEligibleForCanaryPdiPublication({
        tripStartTimeMs: T0 - 1,
        activationNotBeforeMs: T0,
        currentActivationNotBeforeMs: T0,
      }),
    ).toBe(false);
    expect(
      isTripEligibleForCanaryPdiPublication({
        tripStartTimeMs: tripStart.getTime(),
        activationNotBeforeMs: T0,
        currentActivationNotBeforeMs: tripStart.getTime() + 1,
      }),
    ).toBe(false);
  });

  it('comparePdiAuthorityInterval detects identical vs conflict', () => {
    const existing = {
      physicalStartAt: tripStart.toISOString(),
      physicalEndAt: tripEnd.toISOString(),
      source: 'CANARY_VEHICLE_TRIP_CONFIRMED' as const,
    };
    expect(comparePdiAuthorityInterval(existing, tripStart, tripEnd)).toBe('identical');
    expect(
      comparePdiAuthorityInterval(existing, tripStart, new Date(tripEnd.getTime() + 1000)),
    ).toBe('conflict');
  });

  it('publish is idempotent when identical authority already present', async () => {
    const sessionId = 'sess-1';
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          tripStatus: TripStatus.COMPLETED,
          startTime: tripStart,
          endTime: tripEnd,
        }),
      },
      referenceCaptureSettlementShadowExperiment: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'exp-db',
            metadataJson: {
              physicalDriveInterval: {
                physicalStartAt: tripStart.toISOString(),
                physicalEndAt: tripEnd.toISOString(),
                source: EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE,
              },
            },
          })
          .mockResolvedValueOnce({
            metadataJson: {
              physicalDriveInterval: {
                physicalStartAt: tripStart.toISOString(),
                physicalEndAt: tripEnd.toISOString(),
                source: EXP021_CANARY_VEHICLE_TRIP_PDI_SOURCE,
              },
            },
          }),
      },
    };
    const persist = jest.fn();
    const result = await publishCanaryLiveWindowPhysicalDriveInterval({
      prisma: prisma as never,
      settlementShadow: { persistPhysicalDriveIntervalAuthority: persist } as never,
      currentActivationNotBeforeMs: T0,
      ctx: ksMxPdiCtx({ sessionId, activationNotBeforeMs: T0 }),
    });
    expect(result.outcome).toBe('already_present');
    expect(persist).not.toHaveBeenCalled();
  });

  it('publish fails closed on conflicting existing authority', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          tripStatus: TripStatus.COMPLETED,
          startTime: tripStart,
          endTime: tripEnd,
        }),
      },
      referenceCaptureSettlementShadowExperiment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exp-db',
          metadataJson: {
            physicalDriveInterval: {
              physicalStartAt: tripStart.toISOString(),
              physicalEndAt: new Date(tripEnd.getTime() + 5000).toISOString(),
              source: 'PDI_CANDIDATE',
            },
          },
        }),
      },
    };
    const result = await publishCanaryLiveWindowPhysicalDriveInterval({
      prisma: prisma as never,
      settlementShadow: { persistPhysicalDriveIntervalAuthority: jest.fn() } as never,
      currentActivationNotBeforeMs: T0,
      ctx: ksMxPdiCtx({ activationNotBeforeMs: T0 }),
    });
    expect(result.outcome).toBe('conflict');
  });

  it('resolveCanaryLiveWindowVehicleTripPdiAuthority returns null for ONGOING trip', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          tripStatus: TripStatus.ONGOING,
          startTime: tripStart,
          endTime: null,
        }),
      },
    };
    const resolved = await resolveCanaryLiveWindowVehicleTripPdiAuthority(
      prisma as never,
      'trip-1',
      EXP021_CANARY_LIVE_WINDOW_CANARY.vehicleId,
    );
    expect(resolved).toBeNull();
  });
});
