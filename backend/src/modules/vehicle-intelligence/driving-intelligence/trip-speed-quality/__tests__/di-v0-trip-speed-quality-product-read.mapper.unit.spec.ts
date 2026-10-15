import { randomUUID } from 'crypto';
import { DI_V0_SPEED_QC_POLICY_V1, DI_V0_SPEED_QC_POLICY_V2 } from '../../speed-qc/di-v0-speed-qc-policy.version';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import type { DiV0TripSpeedQualityPersistedRow } from '../di-v0-trip-speed-quality-projection.repository';
import {
  buildDiV0TripGpsSpeedEvaluationUnavailable,
  toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow,
} from '../di-v0-trip-speed-quality-product-read.mapper';
import { syntheticHighway130Input } from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';

function persistedV2Row(
  overrides?: Partial<DiV0TripSpeedQualityPersistedRow['projection']['assessability']>,
): DiV0TripSpeedQualityPersistedRow {
  const organizationId = randomUUID();
  const tripId = randomUUID();
  const workItemId = randomUUID();
  const qc = syntheticHighway130Input();
  const shadow = {
    intervalStart: new Date(qc.shadow.intervalStart),
    intervalEnd: new Date(qc.shadow.intervalEnd),
    referenceTime: new Date(qc.shadow.referenceTime),
    motionState: qc.shadow.motionState,
    positionState: qc.shadow.positionState,
    estimatedSpeedKmh: qc.shadow.estimatedSpeedKmh,
    speedEvidenceState: qc.shadow.speedEvidenceState,
    valueConfidence: qc.shadow.valueConfidence,
    sourceRelation: qc.shadow.sourceRelation,
    abstentionReason: qc.shadow.abstentionReason,
    evidenceSources: qc.shadow.evidenceSources,
    sourceQualityFlags: qc.shadow.sourceQualityFlags,
  };
  const projection = buildDiV0TripSpeedQualityProjectionV1({
    organizationId,
    vehicleId: randomUUID(),
    tripId,
    workItemId,
    shadowRunId: randomUUID(),
    pinnedSnapshotHash: 'SYNTHETIC:HASH',
    boundaryFingerprint: 'fp',
    sourceFamily: 'API_SYNTHETIC',
    combinedInputIdentity: 'ci',
    shadowInputEvidenceVersion: 'iev',
    workItemCompletedAt: new Date('2020-06-01T12:30:00Z'),
    snapshotVerified: true,
    evidence: {
      positions: qc.positions,
      positionStateByLabel: new Map(qc.positions.map((pos) => [pos.bucketLabel, pos.positionState ?? 'FRESH'])),
      r1Obd: qc.r1Obd ?? [],
    },
    shadowIntervals: [shadow],
    qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
  });
  if (overrides) {
    projection.assessability = { ...projection.assessability, ...overrides };
  }
  return {
    id: randomUUID(),
    organizationId,
    tripId,
    workItemId,
    lifecycleStatus: 'CURRENT',
    contentFingerprint: 'fp',
    idempotencyKey: 'key',
    createdAt: new Date(),
    projection,
  };
}

describe('di-v0-trip-speed-quality-product-read.mapper', () => {
  it('maps V2 persisted row without ops fields', () => {
    const row = persistedV2Row();
    const product = toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow(row);
    expect(product.qcPolicyVersion).toBe(DI_V0_SPEED_QC_POLICY_V2);
    expect(product.availability).toBe('READY');
    expect(product.coverage?.trustedNumericIntervalCount).toBeGreaterThanOrEqual(0);
    expect(product.speed?.meanScope).toBe('TRUSTED_NUMERIC_INTERVALS_ONLY');
    expect(JSON.stringify(product)).not.toMatch(/contentFingerprint|claim_token|pinnedSnapshotHash/);
  });

  it('refuses V1 policy rows', () => {
    const row = persistedV2Row();
    row.projection.identity.qcPolicyVersion = DI_V0_SPEED_QC_POLICY_V1;
    expect(() => toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow(row)).toThrow(/non-V2/);
  });

  it('marks UNASSESSABLE availability while retaining metrics', () => {
    const row = persistedV2Row({ level: 'UNASSESSABLE' });
    const product = toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow(row);
    expect(product.availability).toBe('NOT_ASSESSABLE');
    expect(product.coverage).not.toBeNull();
    expect(product.speed).not.toBeNull();
  });

  it('builds empty pending/unavailable shells', () => {
    const pending = buildDiV0TripGpsSpeedEvaluationUnavailable('PENDING');
    expect(pending.speed).toBeNull();
    expect(pending.availability).toBe('PENDING');
  });
});
