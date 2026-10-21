import { evaluateStartProxyCadenceGate } from '../battery-start-proxy-cadence-gate';
import { sanitizeStartProxyVoltages } from '../battery-start-proxy.policy';

import { assessBucketTemporalCoherence } from './p4h-bucket-temporal-coherence';
import {
  type P4hEvaluationMode,
  resolveP4hEvaluatedAt,
} from './p4h-evaluation-semantics';
import {
  crankPointsFromArchive,
  type P4hRawArchiveV1,
  verifyP4hRawArchive,
} from './p4h-raw-archive.v1';

export type P4hGateEvaluationSlice = {
  mode: P4hEvaluationMode;
  evaluatedAtUtc: string;
  semantics: string;
  gateOk: boolean;
  reasonCode: string;
  quality: string;
  providerDelayMs: number | null;
  coverageRatio: number;
  medianIntervalMs: number | null;
  maxIntervalMs: number | null;
};

export type P4hOfflineTripEvaluation = {
  tripId: string;
  archiveIntegrityOk: boolean;
  archiveIntegrityReason?: string;
  requestStatus: 'ok' | 'error';
  sampleCount: number;
  evaluations: P4hGateEvaluationSlice[];
  metrics: {
    vPreCrank: number | null;
    vMinCrank: number | null;
    vPostStart: number | null;
    voltageDropV: number | null;
    recoveryDeltaV: number | null;
    minVoltageOffsetFromTripStartS: number | null;
    maxGapS: number | null;
    medianIntervalS: number | null;
  };
  evidence: {
    plausibleStartDip: boolean;
    validatedProxyGate: boolean;
    validatedProxyWithValues: boolean;
    grade: 'NONE' | 'REJECTED' | 'LOW' | 'PARTIAL_DIP' | 'VALIDATED_PROXY';
  };
  bucketCoherence: ReturnType<typeof assessBucketTemporalCoherence>;
  rejectionReason: string | null;
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mapRejection(
  requestStatus: 'ok' | 'error',
  reasonCode: string,
  hasPreCrank: boolean,
  hasMin: boolean,
): string | null {
  if (requestStatus !== 'ok') return 'provider_request_failed';
  if (reasonCode !== 'valid_proxy') {
    switch (reasonCode) {
      case 'no_data':
        return 'no_historical_data';
      case 'insufficient_cadence':
        return 'too_coarse_sampling';
      case 'insufficient_coverage':
      case 'provider_delay':
        return 'provider_gap';
      case 'timestamp_inconsistent':
        return 'invalid_provenance';
      default:
        return 'extractor_quality_gate';
    }
  }
  if (!hasPreCrank) return 'pre_crank_missing';
  if (!hasMin) return 'no_plausible_dip';
  return null;
}

export function evaluateP4hArchivedTrip(
  archive: P4hRawArchiveV1,
  options?: {
    modes?: P4hEvaluationMode[];
    liveIngestAt?: Date;
    /** Primary mode used for voltage metrics / evidence (default HISTORICAL_REPLAY). */
    primaryMode?: P4hEvaluationMode;
  },
): P4hOfflineTripEvaluation {
  const integrity = verifyP4hRawArchive(archive);
  const points = crankPointsFromArchive(archive);
  const tripStart = new Date(archive.trip.tripStartUtc);
  const modes = options?.modes ?? ['LIVE_INGEST', 'HISTORICAL_REPLAY'];
  const primaryMode = options?.primaryMode ?? 'HISTORICAL_REPLAY';

  const evaluations: P4hGateEvaluationSlice[] = modes.map((mode) => {
    const { evaluatedAt, semantics } = resolveP4hEvaluatedAt(mode, {
      liveIngestAt: options?.liveIngestAt,
      queryWindowToUtc: archive.query.windowToUtc,
    });
    const gate = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: tripStart,
      evaluatedAt,
    });
    return {
      mode,
      evaluatedAtUtc: evaluatedAt.toISOString(),
      semantics,
      gateOk: gate.ok,
      reasonCode: gate.ok ? 'valid_proxy' : gate.reasonCode,
      quality: gate.quality,
      providerDelayMs: gate.metrics.providerDelayMs,
      coverageRatio: gate.metrics.coverageRatio,
      medianIntervalMs: gate.metrics.medianIntervalMs,
      maxIntervalMs: gate.metrics.maxIntervalMs,
    };
  });

  const primaryEval = evaluations.find((e) => e.mode === primaryMode) ?? evaluations[0];
  const gate = evaluateStartProxyCadenceGate({
    points,
    tripStartAt: tripStart,
    evaluatedAt: new Date(primaryEval.evaluatedAtUtc),
  });

  const tsMs = points
    .map((p) => new Date(p.timestamp).getTime())
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b);
  const intervals =
    tsMs.length > 1
      ? tsMs.slice(1).map((t, i) => t - tsMs[i])
      : [];

  const tripStartMs = tripStart.getTime();
  let minOffsetS: number | null = null;
  if (points.length > 0) {
    let minV = Infinity;
    let minAt: number | null = null;
    for (const p of points) {
      if (p.voltage != null && p.voltage < minV) {
        minV = p.voltage;
        minAt = new Date(p.timestamp).getTime();
      }
    }
    if (minAt != null) minOffsetS = (minAt - tripStartMs) / 1000;
  }

  const sanitized = gate.values
    ? sanitizeStartProxyVoltages({
        vPreCrank: gate.values.vPreCrank,
        vMinCrank: gate.values.vMinCrank,
        vRecovery5s: gate.values.vRecovery5s,
        vRecovery30s: gate.values.vRecovery30s,
      })
    : null;

  const vPre = sanitized?.vPreCrank ?? null;
  const vMin = sanitized?.vMinCrank ?? null;
  const vPost = gate.values?.vRecovery5s ?? gate.values?.vRecovery30s ?? null;
  const drop = vPre != null && vMin != null ? vPre - vMin : null;
  const recovery =
    vPre != null && vPost != null && vMin != null ? vPost - vMin : null;

  const plausibleStartDip =
    gate.ok && vMin != null && vPre != null && drop != null && drop > 0.1;

  let grade: P4hOfflineTripEvaluation['evidence']['grade'] = 'NONE';
  if (archive.request.status !== 'ok') {
    grade = 'NONE';
  } else if (!gate.ok) {
    grade = 'REJECTED';
  } else if (vPre != null && vMin != null) {
    grade = 'VALIDATED_PROXY';
  } else if (vMin != null) {
    grade = 'PARTIAL_DIP';
  } else {
    grade = 'LOW';
  }

  const rejection = mapRejection(
    archive.request.status,
    gate.ok ? 'valid_proxy' : gate.reasonCode,
    vPre != null,
    vMin != null,
  );

  return {
    tripId: archive.trip.tripId,
    archiveIntegrityOk: integrity.ok,
    archiveIntegrityReason: integrity.reason,
    requestStatus: archive.request.status,
    sampleCount: archive.providerQuality.sampleCount,
    evaluations,
    metrics: {
      vPreCrank: vPre,
      vMinCrank: vMin,
      vPostStart: vPost,
      voltageDropV: drop,
      recoveryDeltaV: recovery,
      minVoltageOffsetFromTripStartS: minOffsetS,
      maxGapS:
        intervals.length > 0 ? Math.max(...intervals) / 1000 : null,
      medianIntervalS:
        intervals.length > 0 ? (median(intervals) ?? 0) / 1000 : null,
    },
    evidence: {
      plausibleStartDip,
      validatedProxyGate: gate.ok,
      validatedProxyWithValues:
        gate.ok && vPre != null && vMin != null,
      grade,
    },
    bucketCoherence: assessBucketTemporalCoherence(points, tripStart),
    rejectionReason: rejection,
  };
}
