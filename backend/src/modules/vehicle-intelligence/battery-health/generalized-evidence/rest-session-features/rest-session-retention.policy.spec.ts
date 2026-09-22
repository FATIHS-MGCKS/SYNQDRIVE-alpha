import {
  BatteryGeneralizedEvidenceClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import { computeRestSessionRetentionFeatures } from './rest-session-retention.policy';
import { convertRestRetentionVoltageToMillivolts } from './rest-session-retention-voltage.policy';
import { computeTheilSenRestSlopeMvPerHour } from './rest-session-retention-theil-sen.policy';
import type {
  RestSessionRetentionAnchorInput,
  RestSessionRetentionCandidateInput,
} from './rest-session-retention.types';

const SESSION = 'session-1';
const MS_PER_HOUR = 3_600_000;

function anchor(voltageV: number): RestSessionRetentionAnchorInput {
  return {
    restSessionId: SESSION,
    evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
    actualRestAgeMs: 0,
    voltageV,
  };
}

function restPoint(input: {
  id: string;
  ageMs: number;
  voltageV: number;
  evidenceClass?: BatteryGeneralizedEvidenceClass;
  alignment?: BatteryShutdownStateAlignmentClass;
  nominalIndex?: number | null;
  sessionId?: string;
}): RestSessionRetentionCandidateInput {
  return {
    observationId: input.id,
    restSessionId: input.sessionId ?? SESSION,
    evidenceClass: input.evidenceClass ?? BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
    stateAlignmentClass: input.alignment ?? BatteryShutdownStateAlignmentClass.ALIGNED,
    actualRestAgeMs: input.ageMs,
    voltageV: input.voltageV,
    providerObservationAt: new Date(Date.UTC(2026, 0, 1, 0, 0, input.ageMs)),
    nominalRestIntervalIndex: input.nominalIndex ?? null,
  };
}

describe('rest-session-retention.policy (M3.3C C1 A–H)', () => {
  it('TEST_A_ONE_POINT: one eligible rest point, slope null, shutdown delta correct', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [restPoint({ id: 'a1', ageMs: MS_PER_HOUR, voltageV: 14.0 })],
    });

    expect(features.numberOfValidRestPoints).toBe(1);
    expect(features.robustRestSlopeMvPerHour).toBeNull();
    expect(features.minimumRestVoltageMv).toBe(14000);
    expect(features.maximumRestVoltageMv).toBe(14000);
    expect(features.medianRestVoltageMv).toBe(14000);
    expect(features.restVoltageVarianceMv2).toBe(0);
    expect(features.observationSpanMs).toBe(0);
    expect(features.maxInterObservationGapMs).toBeNull();
    expect(features.shutdownToFirstRestDeltaMv).toBe(
      convertRestRetentionVoltageToMillivolts(14.2) -
        convertRestRetentionVoltageToMillivolts(14.0),
    );
  });

  it('TEST_B_TWO_IRREGULAR_TIMESTAMPS: slope uses actual age difference', () => {
    const age1 = 45 * 60_000;
    const age2 = 3 * MS_PER_HOUR + 15 * 60_000;
    const v1 = 14000;
    const v2 = 13800;
    const expected =
      (v2 - v1) / ((age2 - age1) / MS_PER_HOUR);

    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({ id: 'b1', ageMs: age1, voltageV: 14.0 }),
        restPoint({ id: 'b2', ageMs: age2, voltageV: 13.8 }),
      ],
    });

    expect(features.robustRestSlopeMvPerHour).toBeCloseTo(expected, 10);
  });

  it('TEST_C_MULTI_POINT_THEIL_SEN: exact median pairwise slope', () => {
    const points = [
      restPoint({ id: 'c1', ageMs: MS_PER_HOUR, voltageV: 14.0 }),
      restPoint({ id: 'c2', ageMs: 2 * MS_PER_HOUR, voltageV: 13.9 }),
      restPoint({ id: 'c3', ageMs: 3 * MS_PER_HOUR, voltageV: 13.7 }),
    ];
    const eligible = points.map((p) => ({
      observationId: p.observationId,
      actualRestAgeMs: p.actualRestAgeMs!,
      voltageMv: convertRestRetentionVoltageToMillivolts(p.voltageV!),
      providerObservationAtMs: p.providerObservationAt!.getTime(),
      nominalRestIntervalIndex: null,
      evidenceClass: p.evidenceClass,
    }));
    const expected = computeTheilSenRestSlopeMvPerHour(eligible);

    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: points,
    });

    expect(features.robustRestSlopeMvPerHour).toBe(expected);
  });

  it('TEST_D_OUTLIER_ROBUSTNESS: extreme voltage at same age does not add slope pairs', () => {
    const age3 = 3 * MS_PER_HOUR;
    const candidates = [
      restPoint({ id: 'd1', ageMs: MS_PER_HOUR, voltageV: 14.0 }),
      restPoint({ id: 'd2', ageMs: 2 * MS_PER_HOUR, voltageV: 13.99 }),
      restPoint({ id: 'd3', ageMs: age3, voltageV: 13.98 }),
      restPoint({ id: 'd-out', ageMs: age3, voltageV: 8.0 }),
    ];
    const withoutOutlier = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: candidates.slice(0, 3),
    });
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates,
    });

    expect(features.numberOfValidRestPoints).toBe(4);
    expect(features.robustRestSlopeMvPerHour).toBe(withoutOutlier.robustRestSlopeMvPerHour);
    expect(features.minimumRestVoltageMv).toBe(8000);
  });

  it('TEST_E_MISSING_NOMINAL_RUNG: rung 1 and 3 without rung 2', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({ id: 'e1', ageMs: MS_PER_HOUR, voltageV: 14.0, nominalIndex: 1 }),
        restPoint({ id: 'e3', ageMs: 3 * MS_PER_HOUR, voltageV: 13.8, nominalIndex: 3 }),
      ],
    });

    expect(features.missingRungCount).toBe(1);
    expect(features.pairwiseRestDeltas).toEqual({ '1->3': -200 });
  });

  it('TEST_F_STALE_REPLAY_EXCLUDED: stale replay not counted', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({ id: 'f-good', ageMs: MS_PER_HOUR, voltageV: 14.0 }),
        restPoint({
          id: 'f-stale',
          ageMs: 2 * MS_PER_HOUR,
          voltageV: 13.5,
          evidenceClass: BatteryGeneralizedEvidenceClass.STALE_REPLAY,
        }),
      ],
    });

    expect(features.numberOfValidRestPoints).toBe(1);
    expect(features.robustRestSlopeMvPerHour).toBeNull();
  });

  it('TEST_G_CONTAMINATION_EXCLUDED: driving/charging/active contamination ignored', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({ id: 'g-good', ageMs: MS_PER_HOUR, voltageV: 14.0 }),
        restPoint({
          id: 'g-dc',
          ageMs: 2 * MS_PER_HOUR,
          voltageV: 13.0,
          evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_CHARGING,
        }),
        restPoint({
          id: 'g-active',
          ageMs: 3 * MS_PER_HOUR,
          voltageV: 12.9,
          evidenceClass: BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
        }),
        restPoint({
          id: 'g-chg',
          ageMs: 4 * MS_PER_HOUR,
          voltageV: 12.8,
          evidenceClass: BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
        }),
      ],
    });

    expect(features.numberOfValidRestPoints).toBe(1);
  });

  it('TEST_H_GAP_DURATION_NOT_REST_AGE: policy uses actualRestAgeMs only', () => {
    const ageMs = 5 * MS_PER_HOUR + 17 * 60_000;
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.15),
      candidates: [restPoint({ id: 'h1', ageMs, voltageV: 13.85 })],
    });

    expect(features.maxActualRestAgeMs).toBe(ageMs);
    expect(features.numberOfValidRestPoints).toBe(1);
  });
});

describe('rest-session-retention.policy edge cases', () => {
  it('zero eligible points returns empty statistics', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [],
    });
    expect(features.numberOfValidRestPoints).toBe(0);
    expect(features.robustRestSlopeMvPerHour).toBeNull();
  });

  it('rejects equal actualRestAgeMs for slope pairs (zero-time skipped)', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({ id: 't1', ageMs: MS_PER_HOUR, voltageV: 14.0 }),
        restPoint({ id: 't2', ageMs: MS_PER_HOUR, voltageV: 13.9 }),
      ],
    });
    expect(features.robustRestSlopeMvPerHour).toBeNull();
  });

  it('excludes wrong restSessionId', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({ id: 'w1', ageMs: MS_PER_HOUR, voltageV: 14.0, sessionId: 'other' }),
      ],
    });
    expect(features.numberOfValidRestPoints).toBe(0);
  });

  it('excludes non-aligned alignment and REST_WAKE accepted', () => {
    const misaligned = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({
          id: 'u1',
          ageMs: MS_PER_HOUR,
          voltageV: 14.0,
          alignment: BatteryShutdownStateAlignmentClass.SKEWED,
        }),
      ],
    });
    expect(misaligned.numberOfValidRestPoints).toBe(0);

    const wake = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        restPoint({
          id: 'wake1',
          ageMs: MS_PER_HOUR,
          voltageV: 14.0,
          evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        }),
      ],
    });
    expect(wake.numberOfValidRestPoints).toBe(1);
  });

  it('convertRestRetentionVoltageToMillivolts rounds deterministically', () => {
    expect(convertRestRetentionVoltageToMillivolts(14.126)).toBe(14126);
    expect(convertRestRetentionVoltageToMillivolts(14.1264)).toBe(14126);
    expect(convertRestRetentionVoltageToMillivolts(14.1265)).toBe(14127);
    expect(() => convertRestRetentionVoltageToMillivolts(Number.NaN)).toThrow();
  });

  it('ENGINE_OFF anchor is not counted as ladder point', () => {
    const features = computeRestSessionRetentionFeatures({
      restSessionId: SESSION,
      anchor: anchor(14.2),
      candidates: [
        {
          observationId: 'off-as-candidate',
          restSessionId: SESSION,
          evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
          stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
          actualRestAgeMs: 0,
          voltageV: 14.2,
          providerObservationAt: new Date(),
          nominalRestIntervalIndex: null,
        },
      ],
    });
    expect(features.numberOfValidRestPoints).toBe(0);
  });
});
