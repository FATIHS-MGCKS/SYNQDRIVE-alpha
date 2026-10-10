import * as fs from 'fs';
import * as path from 'path';
import type { RawFuelSignalSample } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-signal-sample.types';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { normalizeRawFuelSamples } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer';
import { detectChannelRises } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import { scanRawFuelRisePhases } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner';
import { buildStructuralSymbolsFromDetectorConfig } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner.types';
import { RFRF_RISE_PHASE_SCANNER_POLICY_VERSION } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner.policy';
import { preBaselineFromChannelRise } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-phase-scanner.replay-support';
import {
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
} from './settled-post-refuel-plateau.policy';
import {
  DEFENSIBLE_NATURAL_CALIBRATION_ROWS,
  type ReplayCaseDefinition,
} from './settled-post-replay.fixtures';
import { replayCase, type CaseReplayResult } from './settled-post-replay.lib';
import {
  COMMITTED_FULL_REPLAY_FIXTURE_IDS,
  LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS,
  NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS,
  RFRF_OQ014_R4A_EVENT_ACCOUNTING,
  SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS,
} from './rfrf-oq014-r4a-event-accounting';

const REPLAY_HYPOTHESIS_BUNDLE = {
  bundleVersion: 'replay-hypothesis-v1',
  classification: 'REPLAY_HYPOTHESIS' as const,
  maxPeakToSettledDropLiters: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_LITERS,
  maxPeakToSettledDropRatioOfRise: REPLAY_HYPOTHESIS_MAX_PEAK_TO_SETTLED_DROP_RATIO_OF_RISE,
  maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
};

export interface R4aPerEventCalibrationMetrics {
  eventId: string;
  vehicleLabel: string;
  settledDesignReplay: CaseReplayResult | null;
  peakToSettledDropLiters: number | null;
  peakToSettledDropRatio: number | null;
  peakToSettledElapsedMs: number | null;
  maxPeakToSettledContinuityGapMs: number | null;
  maxSettledWindowInternalGapMs: number | null;
  preBaselineFresh: boolean | null;
  preBaselineStaleReason: string | null;
  r3aMaturityStatus: string | null;
  settlingTimingCalibrationEligible: boolean;
  localityCalibrationEligible: boolean;
  sourceProvenance: 'FIXTURE' | 'SPINE_JSON' | 'MISSING';
}

function repoRootFromOpsScript(): string {
  return path.resolve(__dirname, '../../../..');
}

function loadSpineReplayCase(eventId: string): ReplayCaseDefinition | null {
  const row = RFRF_OQ014_R4A_EVENT_ACCOUNTING.find((r) => r.eventId === eventId);
  if (!row?.spineArtifactPath) return null;
  const abs = path.join(repoRootFromOpsScript(), row.spineArtifactPath);
  if (!fs.existsSync(abs)) return null;
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as {
    eventId: string;
    vehicleLabel: string;
    queryWindowUtc: { from: string; to: string };
    samples: Array<{ timestamp: string; absoluteLiters: number; relativePercent?: number | null }>;
  };
  const samples: RawFuelSignalSample[] = parsed.samples.map((s) => ({
    timestamp: new Date(s.timestamp),
    absoluteLiters: s.absoluteLiters,
    relativePercent: s.relativePercent ?? null,
  }));
  return {
    id: parsed.eventId,
    kind: 'PRODUCTION_LABELED',
    label: `${parsed.vehicleLabel} spine ${eventId}`,
    vehicle: parsed.vehicleLabel,
    eventTimestamp: samples[0]?.timestamp.toISOString() ?? parsed.queryWindowUtc.from,
    replayEvidenceTier: 'FULL_REPLAY',
    window: parsed.queryWindowUtc,
    samples,
    relativeCorroboration: 'PARTIAL',
    notes: `Loaded from ${row.spineArtifactPath}`,
  };
}

function resolveReplayCase(eventId: string): ReplayCaseDefinition | null {
  const fromPack = DEFENSIBLE_NATURAL_CALIBRATION_ROWS.find((r) => r.id === eventId);
  if (fromPack && fromPack.samples.length > 0) return fromPack;
  const spine = loadSpineReplayCase(eventId);
  if (spine && spine.samples.length > 0) return spine;
  return null;
}

function pickPrimaryRise(samples: { samples: import('../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer').NormalizedRawFuelSample[] }) {
  const rises = detectChannelRises(samples.samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
  if (rises.length === 0) return null;
  return rises.reduce((best, r) => {
    const peak = Math.max(...r.risePoints.map((p) => p.value));
    const bestPeak = Math.max(...best.risePoints.map((p) => p.value));
    return peak > bestPeak ? r : best;
  });
}

export function computeR4aPerEventMetrics(eventId: string): R4aPerEventCalibrationMetrics | null {
  const meta = RFRF_OQ014_R4A_EVENT_ACCOUNTING.find((r) => r.eventId === eventId);
  if (!meta) return null;

  const replayDef = resolveReplayCase(eventId);
  const settledDesignReplay = replayDef ? replayCase(replayDef) : null;
  const sourceProvenance: R4aPerEventCalibrationMetrics['sourceProvenance'] = replayDef
    ? replayDef.notes?.includes('Loaded from')
      ? 'SPINE_JSON'
      : 'FIXTURE'
    : 'MISSING';

  let peakToSettledDropLiters: number | null = settledDesignReplay?.peakToSettledDrop ?? null;
  let peakToSettledDropRatio: number | null = null;
  let peakToSettledElapsedMs: number | null = null;
  let maxPeakToSettledContinuityGapMs: number | null = null;
  let maxSettledWindowInternalGapMs: number | null = null;
  let preBaselineFresh: boolean | null = null;
  let preBaselineStaleReason: string | null = null;
  let r3aMaturityStatus: string | null = null;

  if (replayDef && replayDef.samples.length > 0) {
    const norm = normalizeRawFuelSamples(
      replayDef.samples,
      new Date(replayDef.window.from),
      new Date(replayDef.window.to),
      RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
    );
    if (norm.ok) {
      const rise = pickPrimaryRise(norm);
      if (rise) {
        const preBaseline = preBaselineFromChannelRise(rise);
        preBaselineFresh = preBaseline.fresh;
        preBaselineStaleReason = preBaseline.staleReason;

        const r3a = scanRawFuelRisePhases({
          samples: replayDef.samples
            .filter((s) => typeof s.absoluteLiters === 'number')
            .map((s) => ({ timestamp: s.timestamp, absoluteLiters: s.absoluteLiters as number })),
          preBaseline,
          riseAnchors: { riseOnsetAt: rise.riseOnsetAt, riseEndAt: rise.riseEndAt },
          structuralSymbols: buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1),
          calibrationBundle: REPLAY_HYPOTHESIS_BUNDLE,
          policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
          physicalIdentityAnchors: null,
          f3Context: {
            lifecycleState: rise.lifecycleState,
            rejectionReason: rise.rejectionReason ?? null,
          },
          evidenceProvenance: { fleetRowId: eventId, preMedian: preBaseline.medianLiters },
        });
        r3aMaturityStatus = r3a.maturityStatus;
        peakToSettledDropLiters = r3a.peakToSettledDropLiters;
        peakToSettledDropRatio = r3a.peakToSettledDropRatio;
        peakToSettledElapsedMs = r3a.peakToSettledElapsedMs;
        maxPeakToSettledContinuityGapMs = r3a.maxPeakToSettledContinuityGapMs;
        maxSettledWindowInternalGapMs = RAW_FUEL_RISE_DETECTOR_CONFIG_V1.absolute.maxSampleGapMs;
      }
    }
  }

  if (
    peakToSettledDropRatio == null &&
    settledDesignReplay?.peak != null &&
    settledDesignReplay?.preMedian != null &&
    settledDesignReplay.peakToSettledDrop != null
  ) {
    const rise = settledDesignReplay.peak - settledDesignReplay.preMedian;
    if (rise > 0) {
      peakToSettledDropRatio = settledDesignReplay.peakToSettledDrop / rise;
    }
  }

  const settlingTimingCalibrationEligible = SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS.includes(
    eventId as (typeof SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS)[number],
  );
  const localityCalibrationEligible = LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS.includes(
    eventId as (typeof LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS)[number],
  );

  return {
    eventId,
    vehicleLabel: meta.vehicleLabel,
    settledDesignReplay,
    peakToSettledDropLiters,
    peakToSettledDropRatio,
    peakToSettledElapsedMs,
    maxPeakToSettledContinuityGapMs,
    maxSettledWindowInternalGapMs,
    preBaselineFresh,
    preBaselineStaleReason,
    r3aMaturityStatus,
    settlingTimingCalibrationEligible,
    localityCalibrationEligible,
    sourceProvenance,
  };
}

export function computeAllR4aEligibleMetrics(): R4aPerEventCalibrationMetrics[] {
  return NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS.map((id) => computeR4aPerEventMetrics(id)).filter(
    (r): r is R4aPerEventCalibrationMetrics => r != null,
  );
}

export function summarizeDropCalibration(metrics: R4aPerEventCalibrationMetrics[]) {
  const drops = metrics
    .map((m) => m.peakToSettledDropLiters)
    .filter((d): d is number => d != null);
  const ratios = metrics
    .map((m) => m.peakToSettledDropRatio)
    .filter((r): r is number => r != null);
  const sortNum = (a: number, b: number) => a - b;
  const median = (arr: number[]) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort(sortNum);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  };
  return {
    n: metrics.length,
    dropMin: drops.length ? Math.min(...drops) : null,
    dropMedian: median(drops),
    dropMax: drops.length ? Math.max(...drops) : null,
    ratioMin: ratios.length ? Math.min(...ratios) : null,
    ratioMedian: median(ratios),
    ratioMax: ratios.length ? Math.max(...ratios) : null,
  };
}

export function assertCommittedReplayCoverage(): void {
  for (const id of COMMITTED_FULL_REPLAY_FIXTURE_IDS) {
    const def = resolveReplayCase(id);
    if (!def || def.samples.length === 0) {
      throw new Error(`R4A: missing committed replay samples for ${id}`);
    }
  }
}
