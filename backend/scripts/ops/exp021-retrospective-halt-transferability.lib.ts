/**
 * EXP021 v0_2 transferability run — evaluation harness only (detector frozen).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { P21ForensicLoadedContext } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import { EXP021_EV_GT_REFERENCE } from './exp021-ev-ground-truth-forensic-export.lib';
import { collectPresentPoints, findGapRuns } from './exp021-retrospective-halt-prototype.lib';
import {
  RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
  buildGapEventsV2,
  classifyAllPresentLegsV2,
} from './exp021-retrospective-halt-prototype-v2.lib';

export const TRANSFERABILITY_RUN_ID = 'EXP021_RETROSPECTIVE_HALT_V0_2_TRANSFERABILITY_2026-10-16';

export const TESLA_REFERENCE_VEHICLE_ID = EXP021_EV_GT_REFERENCE.vehicleId;

/** Fleet LTE_R1 (Ruptela path) vs Tesla software integration via DIMO API_SYNTHETIC. */
export const VEHICLE_INTEGRATION_FAMILY: Record<string, 'TESLA_SOFTWARE_DIMO' | 'RUPTELA_LTE_R1' | 'OTHER_LTE_R1'> = {
  [TESLA_REFERENCE_VEHICLE_ID]: 'TESLA_SOFTWARE_DIMO',
  '19fedd4b-c4e8-4de8-a125-dab293326e7e': 'RUPTELA_LTE_R1',
  'c10351f8-b6a2-4258-947f-631aeaa6d359': 'RUPTELA_LTE_R1',
  '8c850ff1-4201-432b-af2e-2711dbc7ca48': 'RUPTELA_LTE_R1',
};

export function integrationFamilyForVehicle(vehicleId: string): string {
  return VEHICLE_INTEGRATION_FAMILY[vehicleId] ?? 'OTHER_LTE_R1';
}

export type TransferTripBinding = {
  tripId: string;
  vehicleId: string;
  workItemId: string;
  source: 'TESLA_EV_GT_REFERENCE' | 'P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1';
  independentVideoGroundTruth: boolean;
  selectionRationale: string[];
};

export type TransferGapEventRow = {
  eventId: string;
  windowUtc: { from: string; to: string };
  gapDurationSec: number;
  classification: string;
  decisiveFeatures: Array<{ feature: string; value: unknown; role: string }>;
  supportingAndContradicting: Array<{ tier: string; text: string; epistemic: string }>;
  metrics: Record<string, unknown>;
  anomalyFlags: string[];
};

export type TransferTripReport = {
  binding: TransferTripBinding;
  integrationFamily: string;
  dataCoverage: {
    shadowIntervalCount: number;
    positionPresentBuckets: number;
    positionAbsentBuckets: number;
    presentFraction: number;
    r1ObdNumericBuckets: number;
    gapRunsTotal: number;
    gapEventsGte3s: number;
    geometryNearStop: number;
    geometrySlowRoll: number;
    geometryMoving: number;
    geometryScatter: number;
  };
  classificationHistogram: Record<string, number>;
  gapEvents: TransferGapEventRow[];
  tripLevelNotes: string[];
};

function countPositions(ctx: P21ForensicLoadedContext): { present: number; absent: number } {
  let present = 0;
  let absent = 0;
  for (const p of ctx.evidence.positions) {
    if (p.availability === 'PRESENT') present += 1;
    else absent += 1;
  }
  return { present, absent };
}

function anomalyFlagsForEvent(
  classification: string,
  metrics: Record<string, string | number | null>,
  gapDurationSec: number,
): string[] {
  const flags: string[] = [];
  const chord = metrics.endpointDisplacementM;
  const legIn = metrics.legIntoGapClass;
  const legOut = metrics.legOutOfGapClass;
  if (classification === 'NOT_DISTINGUISHABLE') flags.push('LOW_CONFIDENCE_CLASSIFICATION');
  if (
    typeof chord === 'number' &&
    chord >= 25 &&
    classification === 'LIKELY_HALT'
  ) {
    flags.push('HALT_WITH_LARGE_CHORD');
  }
  if (
    legIn === 'MOVING_GEOMETRY' &&
    legOut === 'MOVING_GEOMETRY' &&
    classification === 'LIKELY_HALT'
  ) {
    flags.push('HALT_BUT_BOTH_GAP_EDGE_LEGS_MOVING');
  }
  if (gapDurationSec >= 30 && classification === 'LIKELY_SLOW_ROLL_STOP_GO') {
    flags.push('LONG_GAP_SLOW_ROLL_LABEL');
  }
  return flags;
}

export function analyzeTripWithFrozenV02(
  ctx: P21ForensicLoadedContext,
  binding: TransferTripBinding,
): TransferTripReport {
  const posByLabel = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
  const sortedLabels = [...ctx.shadowIntervals].map((r) => dateToBucketLabel(r.referenceTime)).sort();
  const presentPoints = collectPresentPoints(ctx.evidence.positions);
  const r1ByLabel = new Map(ctx.evidence.r1Obd.map((r) => [r.bucketLabel, r.speedKmh]));
  const gaps = findGapRuns(sortedLabels, posByLabel);
  const gapEvents = buildGapEventsV2(gaps, presentPoints, posByLabel, r1ByLabel);
  const geometryPerSecond = classifyAllPresentLegsV2(presentPoints, ctx.evidence.positions);

  const posCounts = countPositions(ctx);
  const totalPos = posCounts.present + posCounts.absent;
  const histogram: Record<string, number> = {};
  for (const e of gapEvents) {
    histogram[e.classification] = (histogram[e.classification] ?? 0) + 1;
  }

  const tripNotes: string[] = [];
  if (!binding.independentVideoGroundTruth) {
    tripNotes.push('ROBUSTNESS_ONLY_NO_INDEPENDENT_VIDEO — no hit-rate claim.');
  }
  if (posCounts.present / Math.max(1, totalPos) < 0.5) {
    tripNotes.push('SPARSE_POSITION_COVERAGE — gap geometry weak.');
  }
  if ((histogram.LIKELY_HALT ?? 0) >= 5) {
    tripNotes.push('MANY_LIKELY_HALT_GAPS — inspect for stop-and-go or uplink pattern.');
  }

  return {
    binding,
    integrationFamily: integrationFamilyForVehicle(binding.vehicleId),
    dataCoverage: {
      shadowIntervalCount: sortedLabels.length,
      positionPresentBuckets: posCounts.present,
      positionAbsentBuckets: posCounts.absent,
      presentFraction: totalPos > 0 ? posCounts.present / totalPos : 0,
      r1ObdNumericBuckets: ctx.evidence.r1Obd.filter((r) => r.speedKmh != null && Number.isFinite(r.speedKmh)).length,
      gapRunsTotal: gaps.length,
      gapEventsGte3s: gapEvents.length,
      geometryNearStop: geometryPerSecond.filter((g) => g.geometryClass === 'NEAR_STOP_GEOMETRY').length,
      geometrySlowRoll: geometryPerSecond.filter((g) => g.geometryClass === 'SLOW_ROLL_GEOMETRY').length,
      geometryMoving: geometryPerSecond.filter((g) => g.geometryClass === 'MOVING_GEOMETRY').length,
      geometryScatter: geometryPerSecond.filter((g) => g.geometryClass === 'INCONCLUSIVE_SCATTER').length,
    },
    classificationHistogram: histogram,
    gapEvents: gapEvents.map((e) => ({
      eventId: e.eventId,
      windowUtc: e.consideredWindowUtc,
      gapDurationSec: e.gapDurationSec,
      classification: e.classification,
      decisiveFeatures: e.decisiveFeatures ?? [],
      supportingAndContradicting: e.supportingAndContradicting,
      metrics: e.metrics,
      anomalyFlags: anomalyFlagsForEvent(e.classification, e.metrics, e.gapDurationSec),
    })),
    tripLevelNotes: tripNotes,
  };
}

export function buildTransferabilitySummaryMarkdown(reports: TransferTripReport[]): string {
  const lines: string[] = [
    '# EXP021 v0_2 transferability summary',
    '',
    `Detector: **${RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION}** (frozen, no recalibration).`,
    '',
    '| Trip | Integration | Video GT | Gaps ≥3s | LIKELY_HALT | NOT_DIST | Present % | Notes |',
    '|------|-------------|----------|----------|-------------|----------|-----------|-------|',
  ];
  for (const r of reports) {
    const h = r.classificationHistogram;
    lines.push(
      `| \`${r.binding.tripId.slice(0, 8)}…\` | ${r.integrationFamily} | ${r.binding.independentVideoGroundTruth ? 'partial (Tesla ref)' : 'none'} | ${r.dataCoverage.gapEventsGte3s} | ${h.LIKELY_HALT ?? 0} | ${h.NOT_DISTINGUISHABLE ?? 0} | ${(r.dataCoverage.presentFraction * 100).toFixed(0)}% | ${r.tripLevelNotes[0] ?? '—'} |`,
    );
  }
  lines.push('', '## Missing independent validation cases (next video GT)', '');
  lines.push('- Halt without traffic signal (Ampel).');
  lines.push('- Slow roll-through without full halt.');
  lines.push('- Stop-and-go cluster.');
  lines.push('- Resume driving with position/data gap.');
  lines.push('- Maneuver / return near same coordinates.');
  return lines.join('\n');
}

export function defaultManifestPath(repoRoot: string): string {
  return path.join(
    repoRoot,
    'architecture/drivingintelligence/evidence/data/EXP021_P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1.json',
  );
}

export function loadManifestBindings(repoRoot: string): TransferTripBinding[] {
  const raw = JSON.parse(fs.readFileSync(defaultManifestPath(repoRoot), 'utf8')) as {
    selected: Array<{ tripId: string; vehicleId: string; workItemId: string }>;
  };
  return raw.selected.map((t) => ({
    tripId: t.tripId,
    vehicleId: t.vehicleId,
    workItemId: t.workItemId,
    source: 'P1_V2_MULTI_TRIP_MANIFEST_FROZEN_V1',
    independentVideoGroundTruth: false,
    selectionRationale: [
      'Frozen P1 V2 multi-trip manifest — stationary QC regression cohort.',
      'Diverse duration/gaps per original inventory (stops, bands, motion).',
    ],
  }));
}

export function teslaReferenceBinding(): TransferTripBinding {
  return {
    tripId: EXP021_EV_GT_REFERENCE.tripId,
    vehicleId: EXP021_EV_GT_REFERENCE.vehicleId,
    workItemId: EXP021_EV_GT_REFERENCE.workItemId,
    source: 'TESLA_EV_GT_REFERENCE',
    independentVideoGroundTruth: true,
    selectionRationale: [
      'Primary EV ground-truth trip with kompakt external video review.',
      'LONG_HALT windows = readable tacho-0 sections, not proven physical halts.',
    ],
  };
}
