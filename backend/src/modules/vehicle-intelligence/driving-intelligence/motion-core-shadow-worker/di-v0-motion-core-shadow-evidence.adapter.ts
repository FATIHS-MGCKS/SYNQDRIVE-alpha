import type { MotionCorePositionBucket } from '../core/kinematics/motion-core-grid';
import type { SparseVehicleSpeedSample } from '../core/kinematics/motion-fsm';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { resolveR1ObdFsmPointAuthority } from '../r1-obd-acquisition/r1-obd-fsm-point-authority';
import { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } from '../trip-speed-quality/di-v0-trip-speed-quality-evidence';

export type DiV0MotionCoreShadowSparseSamplePersisted = {
  /** 1 Hz aggregation grid alignment label (not a provider measurement timestamp). */
  aggregationBucketLabelUtc: string;
  speedKmh: number;
  /** Provider-native measurement instant when present in pinned R1 payload; otherwise unknown. */
  measurementTimeUtc: string | null;
  /** Ingest/arrival instant — never invented from bucket order or label time. */
  arrivalTimestampUtc: null;
  provenance: 'R1_OBD_PINNED_SNAPSHOT';
};

export type DiV0MotionCoreShadowEvidenceAdaptation = {
  buckets: MotionCorePositionBucket[];
  sparseSpeed: SparseVehicleSpeedSample[];
  sparsePersisted: DiV0MotionCoreShadowSparseSamplePersisted[];
  sparseChannelOutcome: string | null;
  sparseComparable: boolean;
  limitations: string[];
};

/**
 * Builds motion-core grid inputs from a verified pinned S4 evidence container.
 * Does not query DIMO; sparse support comes only from the pinned R1_OBD channel when present.
 */
export function adaptMotionCoreShadowEvidenceFromParsedContainer(
  parsed: DiV0S4ParsedEvidenceContainer,
  _sourceFamily: DiV0S4SourceFamily,
): DiV0MotionCoreShadowEvidenceAdaptation {
  const bundle = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(parsed);
  const buckets: MotionCorePositionBucket[] = bundle.positions.map((p) => ({
    bucketLabelUtc: p.bucketLabel,
    availability: p.availability,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
  }));

  const r1Entry = parsed.channelManifest.find((c) => c.channel === 'R1_OBD');
  const sparsePersisted: DiV0MotionCoreShadowSparseSamplePersisted[] = [];
  const sparseSpeed: SparseVehicleSpeedSample[] = [];
  for (const row of bundle.r1Obd) {
    if (row.speedKmh == null) continue;
    const authority = resolveR1ObdFsmPointAuthority({
      temporalConfidence: row.temporalConfidence,
      bucketLabel: row.bucketLabel,
    });
    sparseSpeed.push({
      label: row.bucketLabel,
      speedKmh: row.speedKmh,
      fsmPointAuthority: authority.fsmPointAuthority,
    });
    sparsePersisted.push({
      aggregationBucketLabelUtc: row.bucketLabel,
      speedKmh: row.speedKmh,
      measurementTimeUtc: authority.measurementTimeUtc,
      arrivalTimestampUtc: null,
      provenance: 'R1_OBD_PINNED_SNAPSHOT',
    });
  }

  const limitations: string[] = [];
  let sparseComparable = sparseSpeed.length > 0;
  if (r1Entry && r1Entry.outcome === 'PRESENT_SPARSE' && sparseSpeed.length === 0) {
    limitations.push('R1_OBD_PRESENT_SPARSE_BUT_NO_USABLE_SAMPLES_IN_SNAPSHOT');
    sparseComparable = false;
  }
  if (!r1Entry || r1Entry.outcome === 'NOT_APPLICABLE' || r1Entry.outcome === 'DISABLED') {
    limitations.push('SPARSE_VEHICLE_SPEED_UNAVAILABLE_IN_PINNED_SNAPSHOT');
    sparseComparable = false;
  }
  if (sparseSpeed.length > 0) {
    limitations.push('SPARSE_DECISION_ARRIVAL_LATENCY_UNKNOWN');
    if (sparseSpeed.every((s) => s.fsmPointAuthority === false)) {
      limitations.push('SPARSE_R1_BUCKET_ONLY_NO_FSM_POINT_AUTHORITY');
    }
  }

  return {
    buckets,
    sparseSpeed,
    sparsePersisted,
    sparseChannelOutcome: r1Entry?.outcome ?? null,
    sparseComparable,
    limitations,
  };
}
