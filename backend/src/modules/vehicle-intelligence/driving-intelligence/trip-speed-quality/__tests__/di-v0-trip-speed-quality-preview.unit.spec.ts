import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import { DI_V0_TRIP_SPEED_QUALITY_PREVIEW_DISCLAIMER } from '../di-v0-trip-speed-quality-preview.types';
import {
  syntheticHighLegSpeedInput,
  syntheticHighway130Input,
  syntheticPostGapSpikeInput,
} from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';
import type { DiV0SpeedQcEvaluateInput } from '../../speed-qc/di-v0-speed-qc.types';

const ORG = 'org-u';
const VEHICLE = 'veh-u';
const TRIP = 'trip-u';

function projectFromQc(...inputs: DiV0SpeedQcEvaluateInput[]) {
  const primary = inputs[0];
  return buildDiV0TripSpeedQualityProjectionV1({
    organizationId: ORG,
    vehicleId: VEHICLE,
    tripId: TRIP,
    workItemId: 'wi-u',
    shadowRunId: 'run-u',
    pinnedSnapshotHash: 'hash-u',
    boundaryFingerprint: 'fp-u',
    sourceFamily: 'API_SYNTHETIC',
    combinedInputIdentity: 'ci-u',
    shadowInputEvidenceVersion: 'iev-u',
    workItemCompletedAt: new Date('2020-06-01T12:30:00Z'),
    snapshotVerified: true,
    evidence: {
      positions: primary.positions,
      positionStateByLabel: new Map(
        primary.positions.map((p) => [p.bucketLabel, p.positionState ?? 'FRESH']),
      ),
      r1Obd: primary.r1Obd ?? [],
    },
    shadowIntervals: inputs.map((input) => ({
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
    })),
  });
}

describe('P2.1 preview report metrics (in-memory projection parity)', () => {
  it('includes disclaimer and policy versions on highway 130 scenario', () => {
    const p = projectFromQc(syntheticHighway130Input());
    const json = JSON.stringify({ disclaimer: DI_V0_TRIP_SPEED_QUALITY_PREVIEW_DISCLAIMER, projection: p });
    expect(p.speed.qcTrustedMaxKmh).toBe(130);
    expect(p.provenance.qcPolicyVersion).toBeTruthy();
    expect(p.provenance.projectionVersion).toBeTruthy();
    expect(json).not.toMatch(/latitude|longitude/i);
  });

  it('76af-class spike: high raw max, no trusted max', () => {
    const p = projectFromQc(syntheticPostGapSpikeInput());
    expect(p.speed.shadowRawMaxKmh).toBe(1652);
    expect(p.speed.qcTrustedMaxKmh).toBeNull();
  });

  it('c66a-class high leg remains untrusted for max', () => {
    const p = projectFromQc(syntheticHighLegSpeedInput());
    expect(p.speed.qcTrustedMaxKmh).toBeNull();
    expect(p.quality.untrustedCount).toBeGreaterThanOrEqual(1);
  });

  it('non-numeric speed → UNASSESSABLE assessability', () => {
    const base = syntheticHighway130Input();
    const p = projectFromQc({
      ...base,
      shadow: { ...base.shadow, estimatedSpeedKmh: null, speedEvidenceState: 'NONE' },
    });
    expect(p.assessability.level).toBe('UNASSESSABLE');
  });
});
