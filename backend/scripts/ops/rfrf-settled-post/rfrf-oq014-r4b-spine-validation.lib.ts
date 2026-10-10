import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
export const R4B_WOB_7503_SPINE_PATH = path.join(
  REPO_ROOT,
  'architecture/knowledge-graphs/energy-event-detection/evidence/data/EED-EV-0110-WOB-L-7503-2026-10-09-ABSOLUTE-SPINE.json',
);

const AGENT_DIMO_EXTRACT_PATH = '/opt/cursor/artifacts/wob-7503-2026-10-09-dimo.json';

export interface R4bSpineTelemetryGap {
  fromUtc: string;
  toUtc: string;
  durationSeconds: number;
}

export interface R4bWob7503SpineArtifact {
  evidenceId: string;
  eventId: string;
  sourceClassification: string;
  sampleCount: number;
  maxObservationGapSeconds: number;
  telemetryObservationGaps: R4bSpineTelemetryGap[];
  r4bAdmissionGrade: string;
  userReportedGroundTruth: {
    pumpVolumeLiters: number;
    approxRefuelAnchorUtc: string;
  };
  canonicalPhysicalEpisode: {
    refuelRiseStartUtc: string | null;
    provenance: string;
  };
  samples: Array<{
    timestamp: string;
    absoluteLiters: number | null;
    relativePercent: number | null;
  }>;
  calibrationPopulationStatus: {
    quantityValidation: string;
    physicalEventIdentity: string;
    settlingTimingCalibration: string;
    localityCalibration: string;
    dropCalibrationEligibleN: boolean;
    authoritativeCalibrationMetricEligible: boolean;
  };
}

export function loadR4bWob7503SpineArtifact(): R4bWob7503SpineArtifact {
  return JSON.parse(fs.readFileSync(R4B_WOB_7503_SPINE_PATH, 'utf8')) as R4bWob7503SpineArtifact;
}

/** Optional cross-check when the read-only agent extract is still on disk (not required in CI). */
export function crossCheckSpineAgainstAgentDimoExtract(spine: R4bWob7503SpineArtifact): {
  skipped: boolean;
  errors: string[];
} {
  if (!fs.existsSync(AGENT_DIMO_EXTRACT_PATH)) {
    return { skipped: true, errors: [] };
  }
  const agent = JSON.parse(fs.readFileSync(AGENT_DIMO_EXTRACT_PATH, 'utf8')) as {
    sampleCount: number;
    samples: Array<{ timestamp: string; fuelAbsoluteLiters: number | null; fuelRelativePercent: number | null }>;
  };
  const errors: string[] = [];
  if (agent.sampleCount !== 109 || agent.samples.length !== 109) {
    errors.push('agent_sample_count_not_109');
  }
  if (spine.samples.length !== agent.samples.length) {
    errors.push('spine_agent_length_mismatch');
    return { skipped: false, errors };
  }
  for (let i = 0; i < spine.samples.length; i += 1) {
    const s = spine.samples[i];
    const a = agent.samples[i];
    if (s.timestamp !== a.timestamp) {
      errors.push(`timestamp_mismatch_at_${i}`);
      break;
    }
    const absEq =
      s.absoluteLiters == null && a.fuelAbsoluteLiters == null
        ? true
        : s.absoluteLiters != null &&
          a.fuelAbsoluteLiters != null &&
          Math.abs(s.absoluteLiters - a.fuelAbsoluteLiters) < 1e-9;
    if (!absEq) {
      errors.push(`absolute_mismatch_at_${i}`);
      break;
    }
  }
  return { skipped: false, errors };
}

export function validateR4bWob7503SpineProvenance(spine: R4bWob7503SpineArtifact): {
  errors: string[];
} {
  const errors: string[] = [];
  if (spine.sampleCount !== spine.samples.length) {
    errors.push('sampleCount_mismatch');
  }
  if (spine.samples.length !== 109) {
    errors.push('expected_109_samples');
  }
  let prev: number | null = null;
  for (const s of spine.samples) {
    const t = Date.parse(s.timestamp);
    if (!Number.isFinite(t)) {
      errors.push(`invalid_timestamp:${s.timestamp}`);
      continue;
    }
    if (prev != null && t < prev) {
      errors.push('non_monotonic_timestamps');
    }
    prev = t;
  }
  if (spine.maxObservationGapSeconds !== 3040) {
    errors.push('max_gap_not_3040');
  }
  const gap3040 = spine.telemetryObservationGaps.find((g) => g.durationSeconds === 3040);
  if (!gap3040) {
    errors.push('missing_3040_gap_record');
  }
  if (spine.sourceClassification !== 'BOUNDED_DIMO_READONLY_PRODUCTION_EXTRACT') {
    errors.push('unexpected_source_classification');
  }
  return { errors };
}
