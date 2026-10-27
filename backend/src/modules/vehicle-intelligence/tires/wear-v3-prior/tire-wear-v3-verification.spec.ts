import { TireEvidenceSource } from '@prisma/client';
import {
  isAcceptedVerificationMeasurement,
  latestAcceptedVerificationAnchorPerWheel,
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
    fr: number | null;
    rl: number | null;
    rr: number | null;
  }>,
) {
  const tread = partial.fl ?? 7;
  return {
    id: partial.id ?? 'm1',
    measuredAt: partial.measuredAt ?? new Date('2026-02-01T00:00:00Z'),
    odometerAtMeasurement:
      partial.odometer !== undefined ? partial.odometer : 2000,
    frontLeftMm: partial.fl !== undefined ? partial.fl : tread,
    frontRightMm: partial.fr !== undefined ? partial.fr : tread,
    rearLeftMm: partial.rl !== undefined ? partial.rl : tread,
    rearRightMm: partial.rr !== undefined ? partial.rr : tread,
    source: partial.source ?? 'manual',
    evidenceSource: partial.evidence ?? TireEvidenceSource.MANUAL_MEASUREMENT,
  };
}

function wheelStatus(
  r: ReturnType<typeof resolveV3VerificationStatus>,
  pos: 'FL' | 'FR' | 'RL' | 'RR',
) {
  return r.wheels.find((w) => w.position === pos)!;
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

  it('rejects ai_confirmed legacy (not physical tread verification)', () => {
    expect(
      isAcceptedVerificationMeasurement(
        row({
          source: 'ai_confirmed',
          evidence: TireEvidenceSource.USER_CONFIRMED,
        }),
      ).accepted,
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

describe('per-wheel anchors', () => {
  it('four-wheel full measurement shares one anchor per wheel', () => {
    const m = row({
      id: 'full',
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      odometer: 2000,
    });
    const anchors = latestAcceptedVerificationAnchorPerWheel(
      listAcceptedVerificationMeasurements([m], mount),
    );
    for (const pos of ['FL', 'FR', 'RL', 'RR'] as const) {
      expect(anchors[pos]?.id).toBe('full');
    }
  });

  it('FL-only follow-up does not refresh FR/RL/RR cadence anchors', () => {
    const full = row({
      id: 'full',
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      odometer: 2000,
    });
    const flOnly = row({
      id: 'fl-new',
      measuredAt: new Date('2026-06-01T00:00:00Z'),
      odometer: 6500,
      fr: null,
      rl: null,
      rr: null,
      fl: 6,
    });
    const accepted = listAcceptedVerificationMeasurements([full, flOnly], mount);
    const anchors = latestAcceptedVerificationAnchorPerWheel(accepted);
    expect(anchors.FL?.id).toBe('fl-new');
    expect(anchors.FR?.id).toBe('full');
    expect(anchors.RL?.id).toBe('full');
    expect(anchors.RR?.id).toBe('full');

    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-06-15T00:00:00Z'),
      currentOdometerKm: 8600,
      mountPeriod: mount,
      measurements: [full, flOnly],
    });
    expect(wheelStatus(r, 'FL').verificationStatus).toBe('CURRENT');
    expect(wheelStatus(r, 'FR').verificationStatus).toBe('OVERDUE');
    expect(r.status).toBe('OVERDUE');
  });

  it('multiple partial measurements on different dates per wheel', () => {
    const fl = row({
      id: 'fl',
      measuredAt: new Date('2026-03-01T00:00:00Z'),
      odometer: 3000,
      fr: null,
      rl: null,
      rr: null,
    });
    const fr = row({
      id: 'fr',
      measuredAt: new Date('2026-04-01T00:00:00Z'),
      odometer: 4000,
      fl: null,
      rl: null,
      rr: null,
      fr: 6.5,
    });
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-04-10T00:00:00Z'),
      currentOdometerKm: 4100,
      mountPeriod: mount,
      measurements: [fl, fr],
    });
    expect(wheelStatus(r, 'FL').kmSinceAcceptedMeasurement).toBe(1100);
    expect(wheelStatus(r, 'FR').kmSinceAcceptedMeasurement).toBe(100);
    expect(wheelStatus(r, 'RL').hasAcceptedVerification).toBe(false);
  });

  it('missing measurement on one wheel stays insufficient for that wheel only', () => {
    const three = row({
      id: 'three',
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      odometer: 2000,
      rr: null,
    });
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-10T00:00:00Z'),
      currentOdometerKm: 2500,
      mountPeriod: mount,
      measurements: [three],
    });
    expect(wheelStatus(r, 'FL').verificationStatus).toBe('CURRENT');
    expect(wheelStatus(r, 'RR').verificationStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('mixed CURRENT/DUE/OVERDUE wheels aggregate to worst status', () => {
    const flAnchor = row({
      id: 'fl',
      measuredAt: new Date('2026-06-01T00:00:00Z'),
      odometer: 8000,
      fr: null,
      rl: null,
      rr: null,
    });
    const frAnchor = row({
      id: 'fr',
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      odometer: 2000,
      fl: null,
      rl: null,
      rr: null,
      fr: 7,
    });
    const rearAnchor = row({
      id: 'rear',
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      odometer: 2000,
      fl: null,
      fr: null,
      rl: 7,
      rr: 7,
    });
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-06-15T00:00:00Z'),
      currentOdometerKm: 8100,
      mountPeriod: mount,
      measurements: [flAnchor, frAnchor, rearAnchor],
    });
    expect(wheelStatus(r, 'FL').verificationStatus).toBe('CURRENT');
    expect(wheelStatus(r, 'FR').verificationStatus).toBe('OVERDUE');
    expect(r.status).toBe('OVERDUE');
  });
});

describe('resolveV3VerificationStatus', () => {
  const asOf = new Date('2026-08-01T12:00:00Z');

  it('returns INSUFFICIENT without accepted anchor on any wheel', () => {
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

    const statuses = [4499, 4500, 5000, 6000].map((delta) =>
      resolveV3VerificationStatus({
        asOf: new Date('2026-07-01T12:00:00Z'),
        currentOdometerKm: baseOdo + delta,
        mountPeriod: mount,
        measurements: [m],
      }).status,
    );
    expect(statuses).toEqual(['CURRENT', 'DUE_SOON', 'DUE', 'OVERDUE']);
  });

  it('time fallback: 6 calendar months → OVERDUE per wheel even with low km', () => {
    const measuredAt = new Date('2026-01-15T00:00:00Z');
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-07-15T00:00:00Z'),
      currentOdometerKm: 2100,
      mountPeriod: mount,
      measurements: [row({ measuredAt, odometer: 2000 })],
    });
    expect(calendarMonthsElapsedUtc(measuredAt, new Date('2026-07-15T00:00:00Z'))).toBe(6);
    expect(wheelStatus(r, 'FL').verificationStatus).toBe('OVERDUE');
    expect(r.status).toBe('OVERDUE');
    expect(r.kmSinceAcceptedMeasurement).toBe(100);
  });

  it('does not clamp negative km to CURRENT on affected wheel', () => {
    const r = resolveV3VerificationStatus({
      asOf,
      currentOdometerKm: 1500,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000 })],
    });
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(wheelStatus(r, 'FL').qualityFlags).toContain(
      'VERIFICATION_ODOMETER_REGRESSED_VS_ACCEPTED',
    );
    expect(wheelStatus(r, 'FL').kmSinceAcceptedMeasurement).toBeNull();
  });

  it('blocks km cadence when setup odometer quality flags present', () => {
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-15T00:00:00Z'),
      currentOdometerKm: 9000,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000, measuredAt: new Date('2026-02-01T00:00:00Z') })],
      setupOdometerQualityFlags: ['ODOMETER_STALE_OR_JUMP_AHEAD_OF_LEDGER'],
    });
    expect(wheelStatus(r, 'FL').verificationStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(wheelStatus(r, 'FL').kmSinceAcceptedMeasurement).toBe(7000);
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
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

  it('unverified rotation fail-closed: no CURRENT on any wheel', () => {
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-10T00:00:00Z'),
      currentOdometerKm: 2500,
      mountPeriod: mount,
      measurements: [row({ odometer: 2000 })],
      rotationDuringMountPeriod: true,
    });
    expect(r.qualityFlags).toContain('VERIFICATION_ROTATION_IDENTITY_UNVERIFIED');
    for (const w of r.wheels) {
      expect(w.verificationStatus).toBe('INSUFFICIENT_EVIDENCE');
      expect(w.qualityFlags).toContain('VERIFICATION_ROTATION_IDENTITY_UNVERIFIED');
    }
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('AI-only legacy source does not anchor verification', () => {
    const r = resolveV3VerificationStatus({
      asOf: new Date('2026-02-10T00:00:00Z'),
      currentOdometerKm: 2500,
      mountPeriod: mount,
      measurements: [
        row({
          source: 'ai_estimate',
          evidence: TireEvidenceSource.AI_ESTIMATED,
        }),
      ],
    });
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('V2 regression preservation', () => {
  it('does not import or mutate V2 tire health config from verification module', () => {
    const config = require('../tire-health.config');
    expect(config.TIRE_HEALTH_CONFIG.measurementFreshness).toBeDefined();
    const verificationConfig = require('./tire-wear-v3-verification.config');
    expect(verificationConfig.TIRE_WEAR_V3_VERIFICATION_POLICY.remindKm).toBe(4500);
  });
});
