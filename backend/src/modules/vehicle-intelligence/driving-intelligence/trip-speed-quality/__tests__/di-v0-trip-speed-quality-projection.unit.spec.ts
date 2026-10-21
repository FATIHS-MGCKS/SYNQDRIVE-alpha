import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import { buildDiV0TripSpeedQualityIdempotencyKey } from '../di-v0-trip-speed-quality-idempotency';
import { DiV0TripSpeedQualityProjectionError } from '../di-v0-trip-speed-quality-projection.errors';
import {
  syntheticHighLegSpeedInput,
  syntheticHighway130Input,
  syntheticPostGapSpikeInput,
} from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';
import type { DiV0SpeedQcEvaluateInput } from '../../speed-qc/di-v0-speed-qc.types';
import { DI_V0_SPEED_QC_REASON } from '../../speed-qc/di-v0-speed-qc-reason-codes';

const ORG = 'org-1';
const VEHICLE = 'veh-1';
const TRIP = 'trip-1';
const WI = 'wi-1';
const RUN = 'run-1';
const HASH = 'SYNTHETIC:HASH';
const FP = 'fp-1';

function shadowRowFromQcInput(input: DiV0SpeedQcEvaluateInput) {
  return {
    intervalStart: new Date(input.shadow.intervalStart),
    intervalEnd: new Date(input.shadow.intervalEnd),
    referenceTime: new Date(input.shadow.referenceTime),
    motionState: input.shadow.motionState,
    positionState: input.shadow.positionState,
    estimatedSpeedKmh: input.shadow.estimatedSpeedKmh,
    speedEvidenceState: input.shadow.speedEvidenceState,
    valueConfidence: input.shadow.valueConfidence,
    sourceRelation: input.shadow.sourceRelation,
    abstentionReason: input.shadow.abstentionReason,
    evidenceSources: input.shadow.evidenceSources,
    sourceQualityFlags: input.shadow.sourceQualityFlags,
  };
}

function projectTrip(...inputs: DiV0SpeedQcEvaluateInput[]) {
  const primary = inputs[0];
  return buildDiV0TripSpeedQualityProjectionV1({
    organizationId: ORG,
    vehicleId: VEHICLE,
    tripId: TRIP,
    workItemId: WI,
    shadowRunId: RUN,
    pinnedSnapshotHash: HASH,
    boundaryFingerprint: FP,
    sourceFamily: 'API_SYNTHETIC',
    combinedInputIdentity: 'ci-1',
    shadowInputEvidenceVersion: 'iev-1',
    workItemCompletedAt: new Date('2020-06-01T12:30:00Z'),
    snapshotVerified: true,
    evidence: {
      positions: primary.positions,
      positionStateByLabel: new Map(
        primary.positions.map((p) => [p.bucketLabel, p.positionState ?? 'FRESH']),
      ),
      r1Obd: primary.r1Obd ?? [],
    },
    shadowIntervals: inputs.map(shadowRowFromQcInput),
  });
}

describe('DiV0TripSpeedQualityProjectionV1', () => {
  it('76af-class spike: shadow raw max high but qcTrustedMax null', () => {
    const p = projectTrip(syntheticPostGapSpikeInput());
    expect(p.speed.shadowRawMaxKmh).toBe(1652);
    expect(p.speed.qcTrustedMaxKmh).toBeNull();
    expect(p.quality.trustedNumericCount).toBe(0);
    expect(p.assessability.level).not.toBe('FULL');
  });

  it('c66a-class high leg: untrusted, no trusted max', () => {
    const p = projectTrip(syntheticHighLegSpeedInput());
    expect(p.speed.shadowRawMaxKmh).toBeGreaterThan(120);
    expect(p.speed.qcTrustedMaxKmh).toBeNull();
    expect(p.quality.untrustedCount).toBeGreaterThanOrEqual(1);
  });

  it('plausible 130 km/h highway remains trusted usable', () => {
    const p = projectTrip(syntheticHighway130Input());
    expect(p.quality.trustedNumericCount).toBe(1);
    expect(p.speed.qcTrustedMaxKmh).toBe(130);
    expect(p.speed.maxSpeedAssessability).toBe('TRUSTED_MAX_AVAILABLE');
  });

  it('3964-class all non-numeric → UNASSESSABLE', () => {
    const base = syntheticHighway130Input();
    const p = projectTrip({
      ...base,
      shadow: { ...base.shadow, estimatedSpeedKmh: null, speedEvidenceState: 'NONE' },
    });
    expect(p.quality.numericSpeedCount).toBe(0);
    expect(p.assessability.level).toBe('UNASSESSABLE');
  });

  it('TRUSTED_LIMITED not counted as trustedNumericCount', () => {
    const base = syntheticHighway130Input();
    const p = projectTrip({
      ...base,
      shadow: {
        ...base.shadow,
        estimatedSpeedKmh: 2,
        speedEvidenceState: 'STATIONARY_BAND',
        motionState: 'STATIONARY_SUPPORTED',
      },
    });
    expect(p.quality.trustedLimitedCount).toBe(1);
    expect(p.quality.trustedNumericCount).toBe(0);
  });

  it('snapshot not verified → UNASSESSABLE', () => {
    const p = buildDiV0TripSpeedQualityProjectionV1({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: TRIP,
      workItemId: WI,
      shadowRunId: RUN,
      pinnedSnapshotHash: HASH,
      boundaryFingerprint: FP,
      sourceFamily: 'API_SYNTHETIC',
      combinedInputIdentity: null,
      shadowInputEvidenceVersion: null,
      workItemCompletedAt: null,
      snapshotVerified: false,
      evidence: { positions: [], positionStateByLabel: new Map(), r1Obd: [] },
      shadowIntervals: [shadowRowFromQcInput(syntheticHighway130Input())],
    });
    expect(p.assessability.level).toBe('UNASSESSABLE');
  });

  it('idempotency key stable for same inputs', () => {
    const k1 = buildDiV0TripSpeedQualityIdempotencyKey({
      workItemId: WI,
      shadowRunId: RUN,
      pinnedSnapshotHash: HASH,
      boundaryFingerprint: FP,
      qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V1',
      projectionVersion: 'DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1',
    });
    const k2 = buildDiV0TripSpeedQualityIdempotencyKey({
      workItemId: WI,
      shadowRunId: RUN,
      pinnedSnapshotHash: HASH,
      boundaryFingerprint: FP,
      qcPolicyVersion: 'DI_V0_SPEED_QC_POLICY_V1',
      projectionVersion: 'DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1',
    });
    expect(k1).toBe(k2);
  });

  it('deterministic projection across repeats', () => {
    const a = projectTrip(syntheticHighway130Input());
    const b = projectTrip(syntheticHighway130Input());
    expect(a).toEqual(b);
  });

  it('does not expose brake or acceleration claims in projection shape', () => {
    const p = projectTrip(syntheticHighway130Input());
    const json = JSON.stringify(p);
    expect(json.includes('brake')).toBe(false);
    expect(json.includes('acceleration')).toBe(false);
    expect(json.includes('longitudinalAccel')).toBe(false);
  });

  it('tenant scope error type exists for service layer', () => {
    const err = new DiV0TripSpeedQualityProjectionError('TENANT_SCOPE_MISMATCH', 'x');
    expect(err.code).toBe('TENANT_SCOPE_MISMATCH');
  });

  it('tracks missing evidence reason counts', () => {
    const base = syntheticHighway130Input();
    const missingCenter = base.positions.filter((p) => p.bucketLabel !== base.centerBucketLabel);
    const p = buildDiV0TripSpeedQualityProjectionV1({
      organizationId: ORG,
      vehicleId: VEHICLE,
      tripId: TRIP,
      workItemId: WI,
      shadowRunId: RUN,
      pinnedSnapshotHash: HASH,
      boundaryFingerprint: FP,
      sourceFamily: 'API_SYNTHETIC',
      combinedInputIdentity: null,
      shadowInputEvidenceVersion: null,
      workItemCompletedAt: null,
      snapshotVerified: true,
      evidence: {
        positions: missingCenter,
        positionStateByLabel: new Map(),
        r1Obd: [],
      },
      shadowIntervals: [shadowRowFromQcInput(base)],
    });
    expect(p.quality.missingEvidenceCount).toBeGreaterThanOrEqual(1);
    expect(p.quality.reasonCodeBreakdown[DI_V0_SPEED_QC_REASON.MISSING_POSITION_EVIDENCE]).toBeGreaterThanOrEqual(1);
  });
});
