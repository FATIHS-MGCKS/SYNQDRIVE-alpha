import { evaluateDiV0SpeedQcInterval } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import {
  dateToBucketLabel,
  diagnosePositionGapAtLabel,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import {
  bucketLabelMinusSeconds,
  bucketLabelPlusSeconds,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';

export type EvGroundTruthPerSecondRow = {
  bucketLabelUtc: string;
  positionAvailability: string | null;
  positionState: string | null;
  r1SpeedKmh: number | null;
  l3SpeedKmh: number | null;
  motionState: string | null;
  speedEvidenceState: string | null;
  sourceRelation: string | null;
  abstentionReason: string | null;
  qcTrustLevel: string;
  qcReasonCodes: string[];
  supportWindowNote: string | null;
};

function r1AtLabel(
  r1Obd: Array<{ bucketLabel: string; speedKmh: number | null }>,
  label: string,
): number | null {
  const hit = r1Obd.find((r) => r.bucketLabel === label);
  return hit?.speedKmh ?? null;
}

function supportNote(
  center: string,
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  window: P21ForensicLoadedContext['acquisitionWindow'],
): string | null {
  const prev = bucketLabelMinusSeconds(center, 1);
  const next = bucketLabelPlusSeconds(center, 1);
  const notes: string[] = [];
  for (const label of [prev, center, next]) {
    const d = diagnosePositionGapAtLabel(label, posByLabel, window);
    if (d !== 'PRESENT_OK') notes.push(`${label}:${d}`);
  }
  return notes.length ? notes.join(';') : null;
}

export function buildEvGroundTruthPerSecondReplay(ctx: P21ForensicLoadedContext): EvGroundTruthPerSecondRow[] {
  const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
  const window = ctx.acquisitionWindow;
  const sorted = [...ctx.shadowIntervals].sort(
    (a, b) => a.referenceTime.getTime() - b.referenceTime.getTime(),
  );

  return sorted.map((r: DiV0TripSpeedQualityShadowRow) => {
    const center = dateToBucketLabel(r.referenceTime);
    const pos = posByLabel.get(center);
    const verdict = evaluateDiV0SpeedQcInterval({
      qcPolicyVersion: DI_V0_SPEED_QC_POLICY_V2,
      centerBucketLabel: center,
      shadow: {
        intervalStart: center,
        intervalEnd: center,
        referenceTime: center,
        estimatedSpeedKmh: r.estimatedSpeedKmh,
        speedEvidenceState: (r.speedEvidenceState ?? 'NONE') as 'NONE',
        valueConfidence: r.valueConfidence as 'HIGH',
        sourceRelation: r.sourceRelation as never,
        motionState: r.motionState as never,
        positionState: r.positionState as never,
        abstentionReason: r.abstentionReason as never,
        sourceQualityFlags: Array.isArray(r.sourceQualityFlags)
          ? r.sourceQualityFlags.map(String)
          : [],
        evidenceSources: [],
      },
      positions: ctx.evidence.positions,
      r1Obd: ctx.evidence.r1Obd,
      evidenceIdentity: { pinnedSnapshotHash: ctx.pinnedSnapshotHash },
    });

    return {
      bucketLabelUtc: center,
      positionAvailability: pos?.availability ?? null,
      positionState: pos?.positionState ?? null,
      r1SpeedKmh: r1AtLabel(ctx.evidence.r1Obd, center),
      l3SpeedKmh:
        r.estimatedSpeedKmh != null && Number.isFinite(r.estimatedSpeedKmh) ? r.estimatedSpeedKmh : null,
      motionState: r.motionState ?? null,
      speedEvidenceState: r.speedEvidenceState ?? null,
      sourceRelation: r.sourceRelation ?? null,
      abstentionReason: r.abstentionReason ?? null,
      qcTrustLevel: verdict.trustLevel,
      qcReasonCodes: [...verdict.reasonCodes],
      supportWindowNote: supportNote(center, posByLabel, window),
    };
  });
}
