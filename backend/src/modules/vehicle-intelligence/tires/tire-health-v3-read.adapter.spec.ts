import { TireOdometerAnchorStatus } from '@prisma/client';
import {
  buildV3VerificationAlerts,
  mapV3SetupToCustomerRead,
  resolveV3OverallTreadStatus,
} from './tire-health-v3-read.adapter';
import type { TireWearV3PriorSetupResult } from './wear-v3-prior/tire-wear-v3-prior.types';

function baseSetup(overrides: Partial<TireWearV3PriorSetupResult> = {}): TireWearV3PriorSetupResult {
  return {
    tireSetupId: 'setup-1',
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    modelVersion: '0.2.0',
    modelConfigHash: 'hash',
    inputFingerprint: 'fp',
    computedAt: '2026-10-27T12:00:00.000Z',
    odometerAnchorKm: 10000,
    odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
    currentOdometerKm: 12000,
    ledgerDistanceKm: 2000,
    ledgerRowCount: 3,
    dynamicBeta: 0,
    ds4SeverityCoverage: 0,
    ds4SeveritySRel: null,
    rated: true,
    setupFlags: [],
    wheels: [
      {
        position: 'FL',
        initialTreadMm: 8,
        initialTreadUsedDefaultFallback: false,
        replacementThresholdMm: 3,
        distanceSinceAnchorKm: 2000,
        estimatedTreadMm: { lo: 7.2, hi: 7.4 },
        estimatedWearMm: { lo: 0.6, hi: 0.8 },
        displayTreadMm: { lo: 7.2, hi: 7.4 },
        pointEstimateTreadMm: 7.3,
        treadEvidenceClass: 'CALIBRATED_ESTIMATE',
        remainingKm: { lo: 10000, hi: 12000 },
        wearRate: {
          mmPerKm: { lo: 0.0003, hi: 0.0004 },
          mmPer1000km: { lo: 0.3, hi: 0.4 },
          source: 'measurement_fused',
          modelUncertaintyMmPerKm: { lo: 0.0001, hi: 0.0002 },
          measurementUncertaintyMmPerKm: null,
          flags: [],
        },
        evidenceLevel: 'L2',
        dynamicFactor: {
          factor: 1,
          coverage: 0,
          sRel: null,
          applied: false,
          appliedToRateLo: false,
        },
        flags: [],
      },
    ],
    verification: {
      status: 'CURRENT',
      kmSinceAcceptedMeasurement: 500,
      daysSinceAcceptedMeasurement: 30,
      nextDueOdometerKm: 15000,
      acceptedMeasurementId: 'm1',
      acceptedMeasurementAt: '2026-09-01T00:00:00.000Z',
      acceptedOdometerKm: 11500,
      wheels: [
        {
          position: 'FL',
          hasAcceptedVerification: true,
          verificationStatus: 'CURRENT',
          lastAcceptedMeasurementId: 'm1',
          lastAcceptedMeasurementAt: '2026-09-01T00:00:00.000Z',
          lastAcceptedOdometerKm: 11500,
          kmSinceAcceptedMeasurement: 500,
          daysSinceAcceptedMeasurement: 30,
          nextDueOdometerKm: 15000,
          qualityFlags: [],
        },
      ],
      qualityFlags: [],
    },
    ...overrides,
  };
}

describe('tire-health-v3-read.adapter', () => {
  it('maps setup to customer read without fabricating mm when insufficient', () => {
    const read = mapV3SetupToCustomerRead(
      baseSetup({
        verification: {
          ...baseSetup().verification,
          status: 'INSUFFICIENT_EVIDENCE',
        },
        wheels: [
          {
            ...baseSetup().wheels[0],
            treadEvidenceClass: 'INSUFFICIENT',
            displayTreadMm: null,
            pointEstimateTreadMm: null,
          },
        ],
      }),
    );
    expect(read.insufficientEvidence).toBe(true);
    expect(read.wheels[0].treadDepthMm).toBeNull();
    expect(resolveV3OverallTreadStatus(read, 'SUMMER')).toBe('UNKNOWN');
  });

  it('distinguishes OVERDUE vs INSUFFICIENT in verification alerts', () => {
    const insufficient = buildV3VerificationAlerts(
      mapV3SetupToCustomerRead(
        baseSetup({
          verification: { ...baseSetup().verification, status: 'INSUFFICIENT_EVIDENCE' },
        }),
      ),
      'setup-1',
    );
    expect(insufficient[0].reasonCode).toBe('TIRE_V3_INSUFFICIENT_EVIDENCE');

    const overdue = buildV3VerificationAlerts(
      mapV3SetupToCustomerRead(
        baseSetup({
          verification: { ...baseSetup().verification, status: 'OVERDUE' },
        }),
      ),
      'setup-1',
    );
    expect(overdue[0].reasonCode).toBe('TIRE_V3_VERIFICATION_OVERDUE');
  });
});
