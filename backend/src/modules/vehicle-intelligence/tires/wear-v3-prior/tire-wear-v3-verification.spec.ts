import { TireEvidenceSource } from '@prisma/client';
import {
  isAcceptedVerificationMeasurement,
  listAcceptedVerificationMeasurements,
} from './tire-wear-v3-verification.accepted';
import { validateTireWearV3VerificationPolicy } from './tire-wear-v3-verification.config';
import {
  calendarMonthsElapsedUtc,
  resolveV3VerificationStatus,
} from './tire-wear-v3-verification.resolver';
import type { MountPeriodWindow } from './tire-wear-v3-prior.lifecycle';

const mount: MountPeriodWindow = {
  id: 'mp-1',
  installedAt: new Date('2026-01-01T00:00:00Z'),
  removedAt: null,
  installedOdometerKm: 1000,
  odometerAnchorStatus: 'ANCHORED',
};

function row(
  partial: Partial<{
    id: string;
    measuredAt: Date;
    odometer: number | null;
    source: string;
    evidence: TireEvidenceSource | null;
    fl: number | null;
  }>,
) {
  return {
    id: partial.id ?? 'm1',
    measuredAt: partial.measuredAt ?? new Date('2026-02-01T00:00:00Z'),
    odometerAtMeasurement:
      partial.odometer !== undefined ? partial.odometer : 2000,
    frontLeftMm: partial.fl ?? 7,
    frontRightMm: partial.fl ?? 7,
    rearLeftMm: partial.fl ?? 7,
    rearRightMm: partial.fl ?? 7,
    source: partial.source ?? 'manual',
    evidenceSource: partial.evidence ?? TireEvidenceSource.MANUAL_MEASUREMENT,
  };
}

describe('tire-wear-v3-verification policy', () => {
  it('rejects non-monotonic km thresholds', () => {
    expect(() =>
      validateTireWearV3VerificationPolicy({
        remindKm: 5000,
        dueKm: 4000,
        overdueKm: 6000,
        timeFallbackMonths: 6,
      }),
    ).toThrow();
  });
});

describe('accepted verification measurements', () => {
  it('rejects AI and calibration legacy sources', () => {
    expect(
      isAcceptedVerificationMeasurement(
        row({ source: 'ai_agent', evidence: TireEvidenceSource.AI_ESTIMATED }),
      ).accepted,
    ).toBe(false);
    expect(
      isAcceptedVerificationMeasurement(row({ source: 'calibration' })).accepted,
    ).toBe(false);
  });

  it('rejects missing odometer', () => {
    expect(
      isAcceptedVerificationMeasurement(row({ odometer: null })).accepted,
    ).toBe(false);
  });

  it('accepts manual ground truth with odometer', () => {
    expect(isAcceptedVerificationMeasurement(row({})).accepted).toBe(true);
  });

  it('excludes measurements outside mount period (tire replacement)', () => {
    const old = row({
      id: 'old',
      measuredAt: new Date('2025-06-01T00:00:00Z'),
      odometer: 500,
    });
    const accepted = listAcceptedVerificationMeasurements([old], mount);
    expect(accepted).toHaveLength(0);
  });
});

describe('resolveV3VerificationStatus', () => {
  const asOf = new Date('2026-08-01T12:00:00Z');

  it('returns INSUFFICIENT without accepted anchor', () => {
    const r = resolveV3VerificationStatus({
      asOf,
      currentOdometerKm: 8000,
      mountPeriod: mount,
      measurements: [row({ odometer: null })],
    });
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.kmSinceAcceptedMeasurement).toBeNull();
  });

  it('boundary: 4499 km → CURRENT, 4500 → DUE_SOON, 5000 → DUE, 6000 → OVERDUE', () => {
    const baseOdo = 1000;
    const acceptedAt = new Date('2026-07-01T00:00:00Z');
    const m = row({ measuredAt: acceptedAt, odometer: baseOdo });

    expect(
      resolveV3VerificationStatus({
        asOf: new Date('2026-07-01T12:00:00Z'),
        currentOdometerKm: baseOdo + 4499,
        mountPeriod: mount,
        measurements: [m],
      }).status,
    ).toBe('CURRENT');

    expect(
      resolveV3VerificationStatus({
        asOf: new Date('2026-07-01T12:00:00Z'),
        currentOdometerKm: baseOdo + 4500,
        mountPeriod: mount,
        measurements: [m],
      }).status,
    ).toBe('DUE_SOON');

    expect(
      resolveV3VerificationStatus({
        asOf: new Date('2026-07-01T12:00:00Z'),
        currentOdometerKm: baseOdo + 5000,
        mountPeriod: mount,
        measurements: [m],
      }).status,
    ).toBe('DUE');

    expect(
      resolveV3VerificationStatus({
        asOf: new Date('2026-07-01T12:00:00Z'),
        currentOdometerKm: baseOdo + 6000,
        mountPeriod: mount,
        measurements: [m],
      }).status,
    ).toBe('OVERDUE');
  });

  it('time fallback: 6 calendar months → OVERDUE even with low km', () => {
    const measuredAt = new Date('2026-01-15T00:00:00Z');
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-07-15T00:00:00Z'),
      currentOdometerKm: 2100,
      mountPeriod: mount,
      measurements: [row({ measuredAt, odometer: 2000 })],
    });
    expect(calendarMonthsElapsedUtc(measuredAt, new Date('2026-07-15T00:00:00Z'))).toBe(6);
    expect(r.status).toBe('OVERDUE');
    expect(r.kmSinceAcceptedMeasurement).toBe(100);
  });

  it('does not clamp negative km to CURRENT', () => {
    const r = resolveV3VerificationStatus({
      asOf,
      currentOdometerKm: 1500,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000 })],
    });
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.qualityFlags).toContain('VERIFICATION_ODOMETER_REGRESSED_VS_ACCEPTED');
    expect(r.kmSinceAcceptedMeasurement).toBeNull();
  });

  it('blocks km cadence when setup odometer quality flags present', () => {
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-15T00:00:00Z'),
      currentOdometerKm: 9000,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000, measuredAt: new Date('2026-02-01T00:00:00Z') })],
      setupOdometerQualityFlags: ['ODOMETER_STALE_OR_JUMP_AHEAD_OF_LEDGER'],
    });
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.kmSinceAcceptedMeasurement).toBe(7000);
  });

  it('verification accepted without implying calibration (single point)', () => {
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-10T00:00:00Z'),
      currentOdometerKm: 2500,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000 })],
    });
    expect(r.status).toBe('CURRENT');
    expect(r.nextDueOdometerKm).toBe(7000);
  });

  it('partial per-wheel verification', () => {
    const partial = {
      id: 'p1',
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      odometerAtMeasurement: 2000,
      frontLeftMm: 7,
      frontRightMm: null,
      rearLeftMm: null,
      rearRightMm: null,
      source: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
    };
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-10T00:00:00Z'),
      currentOdometerKm: 2500,
      mountPeriod: mount,
      measurements: [partial],
    });
    expect(r.wheels.find((w) => w.position === 'FL')?.hasAcceptedVerification).toBe(true);
    expect(r.wheels.find((w) => w.position === 'FR')?.hasAcceptedVerification).toBe(false);
  });

  it('flags rotation during mount period', () => {
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-10T00:00:00Z'),
      currentOdometerKm: 2500,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000 })],
      rotationDuringMountPeriod: true,
    });
    expect(r.qualityFlags).toContain('VERIFICATION_ROTATION_IDENTITY_UNVERIFIED');
  });
});
