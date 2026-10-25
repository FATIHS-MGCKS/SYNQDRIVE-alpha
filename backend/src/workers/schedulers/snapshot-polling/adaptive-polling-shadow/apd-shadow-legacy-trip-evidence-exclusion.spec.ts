import { apdShadowBaselinePollEvidenceForTests } from './apd-shadow-test-baseline-evidence.helper';
import {
  APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUDED_TRIP_IDS,
  APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID,
} from './apd-shadow-legacy-trip-evidence-exclusion.contract';
import {
  apdShadowLegacyTripEvidenceExclusionRelievedReconciliationAtMs,
  buildApdShadowReconciliationTripIntervalWhere,
  isVehicleInActiveTripAtMs,
} from './apd-shadow-trip-reconciliation.util';

describe('APD shadow legacy trip evidence exclusion', () => {
  const atMs = Date.parse('2026-10-23T12:00:00.000Z');
  const legacyTripId = APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUDED_TRIP_IDS[0];
  const realTripId = 'real-trip-ongoing';

  it('excludes only the frozen vehicle and trip ids from reconciliation corpus', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    await isVehicleInActiveTripAtMs(
      prisma as never,
      APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID,
      atMs,
    );
    expect(prisma.vehicleTrip.findFirst).toHaveBeenCalledWith({
      where: buildApdShadowReconciliationTripIntervalWhere(
        APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID,
        new Date(atMs),
        { applyLegacyTripEvidenceExclusion: true },
      ),
      select: { id: true },
    });
    const where = (prisma.vehicleTrip.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where.id?.notIn).toEqual([...APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUDED_TRIP_IDS]);
  });

  it('does not apply exclusion to other vehicles', () => {
    const where = buildApdShadowReconciliationTripIntervalWhere(
      'other-vehicle-id',
      new Date(atMs),
      { applyLegacyTripEvidenceExclusion: true },
    );
    expect(where.id).toBeUndefined();
  });

  it('relieved reconciliation when only legacy phantom trips cover decision time', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: legacyTripId }),
      },
    };
    const relieved = await apdShadowLegacyTripEvidenceExclusionRelievedReconciliationAtMs(
      prisma as never,
      APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID,
      atMs,
    );
    expect(relieved).toBe(true);
  });

  it('does not relieve when a non-excluded trip still covers decision time', async () => {
    const prisma = {
      vehicleTrip: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: realTripId })
          .mockResolvedValueOnce({ id: realTripId }),
      },
    };
    const inTrip = await isVehicleInActiveTripAtMs(
      prisma as never,
      APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID,
      atMs,
    );
    expect(inTrip).toBe(true);
    const relieved = await apdShadowLegacyTripEvidenceExclusionRelievedReconciliationAtMs(
      prisma as never,
      APD_SHADOW_LEGACY_TRIP_EVIDENCE_EXCLUSION_VEHICLE_ID,
      atMs,
    );
    expect(relieved).toBe(false);
  });
});
