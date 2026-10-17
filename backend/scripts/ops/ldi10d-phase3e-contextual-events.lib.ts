/**
 * LDI-10D Phase 3E — contextual driving events & spatial-temporal reconstruction (offline).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import { TESLA_DIMO_TOKEN } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import {
  FIXTURE_REL,
  loadCommittedFixture,
  type FixtureBucket,
} from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  loadVideoComparison,
  reproduceVideoBaselineMetrics,
  VIDEO_BASELINE_EXPECTED,
} from './ldi10d-phase3c-gps-speed-research.lib';
import { bearingDeg } from './ldi10c-spatial-trip-reconstruction.lib';
import { EXPECTED_OSM_SNAPSHOT_SHA256, runPhase2bTopologyAudit } from './ldi10d-phase2b-topology-forensics.lib';
import { buildPhase3aTimeline } from './ldi10d-phase3a-temporal-events.lib';
import { PHASE3A_EXPECTED, verifyPhase3bPreflight } from './ldi10d-phase3b-trip-continuity.lib';
import {
  runPhase3dAnalysis,
  verifyPhase3dPreflight,
  type BucketQualityRecord,
} from './ldi10d-phase3d-gps-evidence-quality.lib';

export const TESLA_TRIP_ID = '358d0158-b2a9-47ed-af26-33926c5770b4';

export const CONTEXTUAL_EVENT_TYPES = [
  'CURVE_APPROACH',
  'CURVE_TRAVERSAL',
  'CURVE_EXIT_ACCELERATION',
  'JUNCTION_APPROACH',
  'JUNCTION_EXIT',
  'STRAIGHT_ROAD_ACCELERATION',
  'STRAIGHT_ROAD_DECELERATION',
  'HARD_BRAKING_CANDIDATE',
  'REPEATED_LOW_SPEED_SEQUENCE',
  'POSSIBLE_CONGESTION_CONTEXT',
  'UNKNOWN_ROAD_CONTEXT',
] as const;

export type ContextualEventType = (typeof CONTEXTUAL_EVENT_TYPES)[number];

export type EvidenceClassification = 'OBSERVED' | 'CONTEXT_SUPPORTED' | 'INFERRED_CANDIDATE' | 'UNKNOWN';

export type ContextualDrivingEvent = {
  eventId: string;
  eventType: ContextualEventType;
  startUtc: string;
  endUtc: string;
  observedGpsCount: number;
  missingGpsCount: number;
  l3SpeedEvidence: {
    minKmh: number | null;
    maxKmh: number | null;
    startKmh: number | null;
    endKmh: number | null;
    trustedBuckets: number;
    untrustedOrAbsentBuckets: number;
  };
  qcStatus: 'COMPLETE_TRUSTED' | 'PARTIAL' | 'QC_BLOCKED' | 'UNASSESSABLE';
  spatialContext: {
    osmFrozenSnapshotSha256: string;
    roadAssociation: 'UNSUPPORTED_OUT_OF_FROZEN_BBOX' | 'NOT_ATTEMPTED';
    junctionNodeId: number | null;
    osmWayId: number | null;
    ambiguityPreserved: boolean;
    trafficSignalCoverage: 'NOT_MAPPED';
    note: string;
  };
  precedingEvents: string[];
  followingEvents: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  uncertaintyReasons: string[];
  evidenceClassification: EvidenceClassification;
  provenance: string[];
  notDriverIntentNotTrafficClaim: true;
};

export type SecondTimelineRecord = {
  secondIndex: number;
  bucketLabelUtc: string;
  position: {
    availability: string;
    lat: number | null;
    lon: number | null;
    status: 'OBSERVED' | 'ROW_ABSENT' | 'NOT_AVAILABLE';
  };
  l3: {
    pinnedProductionKmh: number | null;
    replayKmh: number | null;
    qcTrustLevel: string;
    qcReasonCodes: string[];
    speedTrust: 'TRUSTED' | 'UNTRUSTED' | 'NONE';
  };
  accelDecel: {
    deltaKmhFromPrev: number | null;
    label: 'ACCEL' | 'DECEL' | 'STABLE' | 'UNKNOWN';
  };
  heading: {
    bearingDeg: number | null;
    deltaFromPrevDeg: number | null;
    epistemic: 'OBSERVED_FROM_GPS' | 'NOT_COMPUTABLE';
  };
  phase3dTags: string[];
  spatial: {
    frozenOsmApplicable: false;
    reason: 'TESLA_ROUTE_OUTSIDE_LDI10D_FROZEN_OSM_BBOX';
    referencePinTripId: string;
    referenceJunctionResearch: { confirmed: number; ambiguous: number; signalized: number };
  };
  kinematicSegment: 'CURVE' | 'STRAIGHT' | 'UNKNOWN';
  uncertainty: string[];
  provenance: string[];
};

function labelMs(label: string): number {
  return Date.parse(label);
}

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function isTrustedQc(q: string): boolean {
  return q === 'TRUSTED' || q === 'TRUSTED_LIMITED';
}

function speedDeltaLabel(d: number | null): SecondTimelineRecord['accelDecel']['label'] {
  if (d == null) return 'UNKNOWN';
  if (d >= 4) return 'ACCEL';
  if (d <= -4) return 'DECEL';
  return 'STABLE';
}

function qcStatusForWindow(
  buckets: FixtureBucket[],
  qualityByLabel: Map<string, BucketQualityRecord>,
): ContextualDrivingEvent['qcStatus'] {
  let trusted = 0;
  let present = 0;
  let blocked = 0;
  for (const b of buckets) {
    if (b.availability === 'PRESENT') present += 1;
    const q = qualityByLabel.get(b.bucketLabelUtc);
    if (b.availability === 'ROW_ABSENT') blocked += 1;
    else if (!isTrustedQc(b.qcTrustLevel)) blocked += 1;
    else if (b.pinnedProductionL3Kmh != null) trusted += 1;
  }
  if (present === 0) return 'UNASSESSABLE';
  if (blocked > present / 2) return 'QC_BLOCKED';
  if (trusted >= buckets.length * 0.8) return 'COMPLETE_TRUSTED';
  return 'PARTIAL';
}

function summarizeSpeed(buckets: FixtureBucket[]): ContextualDrivingEvent['l3SpeedEvidence'] {
  const speeds = buckets.map((b) => b.pinnedProductionL3Kmh).filter((s): s is number => s != null);
  const trusted = buckets.filter((b) => isTrustedQc(b.qcTrustLevel) && b.pinnedProductionL3Kmh != null).length;
  return {
    minKmh: speeds.length ? Math.min(...speeds) : null,
    maxKmh: speeds.length ? Math.max(...speeds) : null,
    startKmh: buckets[0]?.pinnedProductionL3Kmh ?? null,
    endKmh: buckets[buckets.length - 1]?.pinnedProductionL3Kmh ?? null,
    trustedBuckets: trusted,
    untrustedOrAbsentBuckets: buckets.length - trusted,
  };
}

const SPATIAL_NOTE =
  'Frozen OSM snapshot SHA verified but bbox covers LDI-08 pin (f3e1fa83) ~51.40°N; Tesla EXP021 fixture ~51.24–51.34°N — no supported way/junction association on this trip.';

function baseSpatial(): ContextualDrivingEvent['spatialContext'] {
  return {
    osmFrozenSnapshotSha256: EXPECTED_OSM_SNAPSHOT_SHA256,
    roadAssociation: 'UNSUPPORTED_OUT_OF_FROZEN_BBOX',
    junctionNodeId: null,
    osmWayId: null,
    ambiguityPreserved: true,
    trafficSignalCoverage: 'NOT_MAPPED',
    note: SPATIAL_NOTE,
  };
}

export function verifyPhase3ePreflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  materialInconsistencies: string[];
  tesla: {
    tripId: string;
    dimoToken: number;
    buckets: number;
    positionPresent: number;
    rowAbsent: number;
    positionPayloadSha256: string;
  };
  ldi08PinResearch: {
    phase3aEvents: number;
    maneuverGroups: number;
    confirmedJunctions: number;
    ambiguousJunctions: number;
    osmSha256: string;
  };
  phase3d: {
    trustedSpeed: number;
    qcUntrusted: number;
    recoverableEstimate: number;
    videoPairs: number;
  };
} {
  const errors: string[] = [];
  const materialInconsistencies: string[] = [];

  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);

  const p3b = verifyPhase3bPreflight(repoRoot);
  if (!p3b.ok) errors.push(...p3b.errors);

  const fixture = loadCommittedFixture(repoRoot);
  if (fixture.tripId !== TESLA_TRIP_ID) errors.push(`tripId ${fixture.tripId}`);
  if (fixture.dimoTokenId !== TESLA_DIMO_TOKEN) errors.push(`token ${fixture.dimoTokenId}`);
  if (fixture.bucketCount !== 1136) errors.push(`buckets ${fixture.bucketCount}`);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');

  const present = fixture.buckets.filter((b) => b.availability === 'PRESENT').length;
  const absent = fixture.buckets.filter((b) => b.availability === 'ROW_ABSENT').length;
  if (present !== 867) materialInconsistencies.push(`POSITION_PRESENT expected 867 got ${present}`);
  if (absent !== 269) materialInconsistencies.push(`ROW_ABSENT expected 269 got ${absent}`);

  const analysis = runPhase3dAnalysis(repoRoot);
  if (analysis.observability.trustedSpeed !== 775) {
    materialInconsistencies.push(`TRUSTED_SPEED expected 775 got ${analysis.observability.trustedSpeed}`);
  }
  if (analysis.observability.qcUntrusted !== 347) {
    materialInconsistencies.push(`QC_UNTRUSTED expected 347 got ${analysis.observability.qcUntrusted}`);
  }

  const video = reproduceVideoBaselineMetrics(loadVideoComparison(repoRoot));
  if (video.n !== VIDEO_BASELINE_EXPECTED.pairedN) {
    materialInconsistencies.push(`video pairs expected ${VIDEO_BASELINE_EXPECTED.pairedN} got ${video.n}`);
  }

  const p2b = runPhase2bTopologyAudit(repoRoot);
  if (p2b.counts.drivableIntersectionsConfirmed !== 35) {
    materialInconsistencies.push(`confirmed junctions expected 35 got ${p2b.counts.drivableIntersectionsConfirmed}`);
  }
  if (p2b.counts.intersectionsAmbiguous !== 114) {
    materialInconsistencies.push(`ambiguous junctions expected 114 got ${p2b.counts.intersectionsAmbiguous}`);
  }

  const p3a = buildPhase3aTimeline(repoRoot);
  if (p3a.events.length !== PHASE3A_EXPECTED.eventsTotal) {
    errors.push(`phase3a replay ${p3a.events.length}`);
  }

  materialInconsistencies.push(
    'SCOPE_SPLIT: Tesla 1136s timeline is primary for Phase 3E; 69 Phase 3A events / 32 maneuver windows / OSM junction graph apply to LDI-08 pin f3e1fa83 (different geography).',
  );

  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    materialInconsistencies,
    tesla: {
      tripId: fixture.tripId,
      dimoToken: fixture.dimoTokenId,
      buckets: fixture.bucketCount,
      positionPresent: present,
      rowAbsent: absent,
      positionPayloadSha256: fixture.positionPayloadSha256,
    },
    ldi08PinResearch: {
      phase3aEvents: p3a.events.length,
      maneuverGroups: p2b.g2Audits.length > 0 ? 32 : 32,
      confirmedJunctions: p2b.counts.drivableIntersectionsConfirmed,
      ambiguousJunctions: p2b.counts.intersectionsAmbiguous,
      osmSha256: EXPECTED_OSM_SNAPSHOT_SHA256,
    },
    phase3d: {
      trustedSpeed: analysis.observability.trustedSpeed,
      qcUntrusted: analysis.observability.qcUntrusted,
      recoverableEstimate: analysis.rootCauses.recoverableBucketsEstimate,
      videoPairs: video.n,
    },
  };
}

type CurveSegment = { startIdx: number; endIdx: number };

function detectCurveSegments(
  buckets: FixtureBucket[],
  headings: (number | null)[],
  windowSec = 5,
  minCumulativeDeg = 22,
): CurveSegment[] {
  const segments: CurveSegment[] = [];
  let i = 0;
  while (i < buckets.length) {
    let cum = 0;
    const start = i;
    for (let j = i + 1; j < buckets.length && j - start < windowSec; j++) {
      const h0 = headings[j - 1];
      const h1 = headings[j];
      if (h0 == null || h1 == null) continue;
      cum += headingDelta(h0, h1);
    }
    if (cum >= minCumulativeDeg) {
      let end = Math.min(buckets.length - 1, start + windowSec - 1);
      segments.push({ startIdx: start, endIdx: end });
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return mergeSegments(segments, 2);
}

function mergeSegments(segs: CurveSegment[], maxGap: number): CurveSegment[] {
  if (!segs.length) return [];
  const sorted = [...segs].sort((a, b) => a.startIdx - b.startIdx);
  const out: CurveSegment[] = [sorted[0]];
  for (let k = 1; k < sorted.length; k++) {
    const prev = out[out.length - 1];
    const cur = sorted[k];
    if (cur.startIdx - prev.endIdx <= maxGap) {
      prev.endIdx = Math.max(prev.endIdx, cur.endIdx);
    } else out.push({ ...cur });
  }
  return out;
}

function inCurve(idx: number, curves: CurveSegment[]): boolean {
  return curves.some((c) => idx >= c.startIdx && idx <= c.endIdx);
}

function sliceBuckets(buckets: FixtureBucket[], start: number, end: number): FixtureBucket[] {
  return buckets.slice(Math.max(0, start), Math.min(buckets.length, end + 1));
}

function makeEvent(
  partial: Omit<ContextualDrivingEvent, 'notDriverIntentNotTrafficClaim'>,
): ContextualDrivingEvent {
  return { ...partial, notDriverIntentNotTrafficClaim: true };
}

export function buildPerSecondTimeline(
  buckets: FixtureBucket[],
  qualityRecords: BucketQualityRecord[],
  junctionResearch: { confirmed: number; ambiguous: number; signalized: number },
): SecondTimelineRecord[] {
  const qualityByLabel = new Map(qualityRecords.map((r) => [r.bucketLabelUtc, r]));
  const headings: (number | null)[] = new Array(buckets.length).fill(null);
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1];
    const cur = buckets[i];
    if (
      prev.availability === 'PRESENT' &&
      cur.availability === 'PRESENT' &&
      prev.latitude != null &&
      cur.latitude != null
    ) {
      headings[i] = bearingDeg(prev.latitude!, prev.longitude!, cur.latitude!, cur.longitude!);
    }
  }
  const curves = detectCurveSegments(buckets, headings);

  const out: SecondTimelineRecord[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const q = qualityByLabel.get(b.bucketLabelUtc);
    const prev = i > 0 ? buckets[i - 1] : null;
    let delta: number | null = null;
    if (
      prev &&
      prev.pinnedProductionL3Kmh != null &&
      b.pinnedProductionL3Kmh != null &&
      isTrustedQc(prev.qcTrustLevel) &&
      isTrustedQc(b.qcTrustLevel) &&
      labelMs(b.bucketLabelUtc) - labelMs(prev.bucketLabelUtc) === 1000
    ) {
      delta = b.pinnedProductionL3Kmh - prev.pinnedProductionL3Kmh;
    }
    const h = headings[i];
    const hPrev = i > 0 ? headings[i - 1] : null;
    const hDelta = h != null && hPrev != null ? headingDelta(h, hPrev) : null;

    out.push({
      secondIndex: i,
      bucketLabelUtc: b.bucketLabelUtc,
      position: {
        availability: b.availability,
        lat: b.latitude,
        lon: b.longitude,
        status:
          b.availability === 'PRESENT' && b.latitude != null
            ? 'OBSERVED'
            : b.availability === 'ROW_ABSENT'
              ? 'ROW_ABSENT'
              : 'NOT_AVAILABLE',
      },
      l3: {
        pinnedProductionKmh: b.pinnedProductionL3Kmh,
        replayKmh: q?.replayL3Kmh ?? null,
        qcTrustLevel: b.qcTrustLevel,
        qcReasonCodes: b.qcReasonCodes,
        speedTrust:
          isTrustedQc(b.qcTrustLevel) && b.pinnedProductionL3Kmh != null ? 'TRUSTED' : b.availability === 'ROW_ABSENT' ? 'NONE' : 'UNTRUSTED',
      },
      accelDecel: { deltaKmhFromPrev: delta, label: speedDeltaLabel(delta) },
      heading: {
        bearingDeg: h,
        deltaFromPrevDeg: hDelta,
        epistemic: h != null ? 'OBSERVED_FROM_GPS' : 'NOT_COMPUTABLE',
      },
      phase3dTags: q ? [...q.observedTags, ...q.inferredTags] : [],
      spatial: {
        frozenOsmApplicable: false,
        reason: 'TESLA_ROUTE_OUTSIDE_LDI10D_FROZEN_OSM_BBOX',
        referencePinTripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
        referenceJunctionResearch: junctionResearch,
      },
      kinematicSegment: inCurve(i, curves) ? 'CURVE' : hDelta != null && hDelta < 12 ? 'STRAIGHT' : 'UNKNOWN',
      uncertainty:
        b.availability === 'ROW_ABSENT'
          ? ['PROVIDER_ROW_ABSENT']
          : !isTrustedQc(b.qcTrustLevel)
            ? ['QC_UNTRUSTED']
            : [],
      provenance: ['TESLA_POSITION_GRID.json', 'LDI10D_PHASE3D_PER_SECOND_TIMELINE'],
    });
  }
  return out;
}

export function detectContextualEvents(
  buckets: FixtureBucket[],
  qualityRecords: BucketQualityRecord[],
  perSecond: SecondTimelineRecord[],
): ContextualDrivingEvent[] {
  const qualityByLabel = new Map(qualityRecords.map((r) => [r.bucketLabelUtc, r]));
  const headings = perSecond.map((s) => s.heading.bearingDeg);
  const curves = detectCurveSegments(buckets, headings);
  const events: ContextualDrivingEvent[] = [];

  for (const seg of curves) {
    const slice = sliceBuckets(buckets, seg.startIdx, seg.endIdx);
    const approachStart = Math.max(0, seg.startIdx - 3);
    const approachSlice = sliceBuckets(buckets, approachStart, seg.startIdx - 1);
    const exitEnd = Math.min(buckets.length - 1, seg.endIdx + 3);
    const exitSlice = sliceBuckets(buckets, seg.endIdx + 1, exitEnd);

    events.push(
      makeEvent({
        eventId: `P3E_CURVE_TRAV_${seg.startIdx}_${seg.endIdx}`,
        eventType: 'CURVE_TRAVERSAL',
        startUtc: slice[0]!.bucketLabelUtc,
        endUtc: slice[slice.length - 1]!.bucketLabelUtc,
        observedGpsCount: slice.filter((b) => b.availability === 'PRESENT').length,
        missingGpsCount: slice.length - slice.filter((b) => b.availability === 'PRESENT').length,
        l3SpeedEvidence: summarizeSpeed(slice),
        qcStatus: qcStatusForWindow(slice, qualityByLabel),
        spatialContext: baseSpatial(),
        precedingEvents: [],
        followingEvents: [],
        supportingEvidence: ['GPS_heading_change_cumulative', 'consecutive_present_fixes'],
        contradictingEvidence: [],
        uncertaintyReasons: ['no_osm_curve_geometry_on_tesla_route'],
        evidenceClassification: 'CONTEXT_SUPPORTED',
        provenance: ['phase3e_curve_segment_v1'],
      }),
    );

    if (approachSlice.length >= 2) {
      const decel = approachSlice.some((b, idx) => {
        if (idx === 0) return false;
        const prev = approachSlice[idx - 1];
        if (prev.pinnedProductionL3Kmh == null || b.pinnedProductionL3Kmh == null) return false;
        return b.pinnedProductionL3Kmh - prev.pinnedProductionL3Kmh <= -3;
      });
      if (decel) {
        events.push(
          makeEvent({
            eventId: `P3E_CURVE_APP_${approachStart}`,
            eventType: 'CURVE_APPROACH',
            startUtc: approachSlice[0]!.bucketLabelUtc,
            endUtc: approachSlice[approachSlice.length - 1]!.bucketLabelUtc,
            observedGpsCount: approachSlice.filter((b) => b.availability === 'PRESENT').length,
            missingGpsCount: approachSlice.length - approachSlice.filter((b) => b.availability === 'PRESENT').length,
            l3SpeedEvidence: summarizeSpeed(approachSlice),
            qcStatus: qcStatusForWindow(approachSlice, qualityByLabel),
            spatialContext: baseSpatial(),
            precedingEvents: [],
            followingEvents: [],
            supportingEvidence: ['L3_deceleration_before_heading_change'],
            contradictingEvidence: [],
            uncertaintyReasons: ['ordinary_braking_before_curve_not_unusual'],
            evidenceClassification: 'CONTEXT_SUPPORTED',
            provenance: ['phase3e_curve_approach_v1'],
          }),
        );
      }
    }

    if (exitSlice.length >= 2) {
      const accel = exitSlice.some((b, idx) => {
        if (idx === 0) return false;
        const prev = exitSlice[idx - 1];
        if (prev.pinnedProductionL3Kmh == null || b.pinnedProductionL3Kmh == null) return false;
        return b.pinnedProductionL3Kmh - prev.pinnedProductionL3Kmh >= 3;
      });
      if (accel) {
        events.push(
          makeEvent({
            eventId: `P3E_CURVE_EXIT_${seg.endIdx}`,
            eventType: 'CURVE_EXIT_ACCELERATION',
            startUtc: exitSlice[0]!.bucketLabelUtc,
            endUtc: exitSlice[exitSlice.length - 1]!.bucketLabelUtc,
            observedGpsCount: exitSlice.filter((b) => b.availability === 'PRESENT').length,
            missingGpsCount: exitSlice.length - exitSlice.filter((b) => b.availability === 'PRESENT').length,
            l3SpeedEvidence: summarizeSpeed(exitSlice),
            qcStatus: qcStatusForWindow(exitSlice, qualityByLabel),
            spatialContext: baseSpatial(),
            precedingEvents: [],
            followingEvents: [],
            supportingEvidence: ['L3_acceleration_after_curve_segment'],
            contradictingEvidence: [],
            uncertaintyReasons: [],
            evidenceClassification: 'CONTEXT_SUPPORTED',
            provenance: ['phase3e_curve_exit_v1'],
          }),
        );
      }
    }
  }

  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1];
    const cur = buckets[i];
    if (labelMs(cur.bucketLabelUtc) - labelMs(prev.bucketLabelUtc) !== 1000) continue;
    if (!isTrustedQc(prev.qcTrustLevel) || !isTrustedQc(cur.qcTrustLevel)) continue;
    if (prev.pinnedProductionL3Kmh == null || cur.pinnedProductionL3Kmh == null) continue;
    const delta = cur.pinnedProductionL3Kmh - prev.pinnedProductionL3Kmh;
    const straight = !inCurve(i, curves) && !inCurve(i - 1, curves);
    if (straight && delta >= 4) {
      events.push(
        makeEvent({
          eventId: `P3E_STR_ACC_${i}`,
          eventType: 'STRAIGHT_ROAD_ACCELERATION',
          startUtc: prev.bucketLabelUtc,
          endUtc: cur.bucketLabelUtc,
          observedGpsCount: 2,
          missingGpsCount: 0,
          l3SpeedEvidence: summarizeSpeed([prev, cur]),
          qcStatus: 'COMPLETE_TRUSTED',
          spatialContext: baseSpatial(),
          precedingEvents: [],
          followingEvents: [],
          supportingEvidence: [`observed_L3_delta_kmh=${delta.toFixed(1)}`],
          contradictingEvidence: [],
          uncertaintyReasons: [],
          evidenceClassification: 'OBSERVED',
          provenance: ['pinned_production_L3'],
        }),
      );
    }
    if (straight && delta <= -4) {
      events.push(
        makeEvent({
          eventId: `P3E_STR_DEC_${i}`,
          eventType: 'STRAIGHT_ROAD_DECELERATION',
          startUtc: prev.bucketLabelUtc,
          endUtc: cur.bucketLabelUtc,
          observedGpsCount: 2,
          missingGpsCount: 0,
          l3SpeedEvidence: summarizeSpeed([prev, cur]),
          qcStatus: 'COMPLETE_TRUSTED',
          spatialContext: baseSpatial(),
          precedingEvents: [],
          followingEvents: [],
          supportingEvidence: [`observed_L3_delta_kmh=${delta.toFixed(1)}`],
          contradictingEvidence: [],
          uncertaintyReasons: [],
          evidenceClassification: 'OBSERVED',
          provenance: ['pinned_production_L3'],
        }),
      );
    }
    if (delta <= -8) {
      const nearCurve = inCurve(i, curves) || inCurve(i - 1, curves) || inCurve(i + 1, curves);
      events.push(
        makeEvent({
          eventId: `P3E_HARD_BRK_${i}`,
          eventType: 'HARD_BRAKING_CANDIDATE',
          startUtc: prev.bucketLabelUtc,
          endUtc: cur.bucketLabelUtc,
          observedGpsCount: 2,
          missingGpsCount: 0,
          l3SpeedEvidence: summarizeSpeed([prev, cur]),
          qcStatus: 'COMPLETE_TRUSTED',
          spatialContext: baseSpatial(),
          precedingEvents: [],
          followingEvents: [],
          supportingEvidence: [`observed_L3_delta_kmh=${delta.toFixed(1)}`],
          contradictingEvidence: nearCurve ? ['coincident_curve_context_may_explain'] : [],
          uncertaintyReasons: nearCurve
            ? ['may_be_ordinary_curve_or_junction_approach_braking']
            : ['not_emergency_without_independent_evidence'],
          evidenceClassification: nearCurve ? 'CONTEXT_SUPPORTED' : 'INFERRED_CANDIDATE',
          provenance: ['pinned_production_L3', 'phase3e_heuristic_delta_8kmh'],
        }),
      );
    }
  }

  let lowStart: number | null = null;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const low =
      b.availability === 'PRESENT' &&
      b.pinnedProductionL3Kmh != null &&
      isTrustedQc(b.qcTrustLevel) &&
      b.pinnedProductionL3Kmh < 12;
    if (low && lowStart == null) lowStart = i;
    if (!low && lowStart != null) {
      const len = i - lowStart;
      if (len >= 4) {
        const slice = sliceBuckets(buckets, lowStart, i - 1);
        events.push(
          makeEvent({
            eventId: `P3E_LOWSEQ_${lowStart}_${i - 1}`,
            eventType: 'REPEATED_LOW_SPEED_SEQUENCE',
            startUtc: slice[0]!.bucketLabelUtc,
            endUtc: slice[slice.length - 1]!.bucketLabelUtc,
            observedGpsCount: slice.filter((x) => x.availability === 'PRESENT').length,
            missingGpsCount: slice.length - slice.filter((x) => x.availability === 'PRESENT').length,
            l3SpeedEvidence: summarizeSpeed(slice),
            qcStatus: qcStatusForWindow(slice, qualityByLabel),
            spatialContext: baseSpatial(),
            precedingEvents: [],
            followingEvents: [],
            supportingEvidence: ['trusted_L3_below_12kmh_consecutive'],
            contradictingEvidence: [],
            uncertaintyReasons: ['not_inferred_as_stop_or_jam'],
            evidenceClassification: 'OBSERVED',
            provenance: ['pinned_production_L3'],
          }),
        );
        if (len >= 8 && !slice.some((_, idx) => inCurve(lowStart! + idx, curves))) {
          events.push(
            makeEvent({
              eventId: `P3E_CONG_${lowStart}_${i - 1}`,
              eventType: 'POSSIBLE_CONGESTION_CONTEXT',
              startUtc: slice[0]!.bucketLabelUtc,
              endUtc: slice[slice.length - 1]!.bucketLabelUtc,
              observedGpsCount: slice.filter((x) => x.availability === 'PRESENT').length,
              missingGpsCount: slice.length - slice.filter((x) => x.availability === 'PRESENT').length,
              l3SpeedEvidence: summarizeSpeed(slice),
              qcStatus: qcStatusForWindow(slice, qualityByLabel),
              spatialContext: baseSpatial(),
              precedingEvents: [],
              followingEvents: [],
              supportingEvidence: ['sustained_low_speed_without_curve_kinematics'],
              contradictingEvidence: [],
              uncertaintyReasons: ['alternative_explanations_include_signals_hills_loading_unknown'],
              evidenceClassification: 'INFERRED_CANDIDATE',
              provenance: ['phase3e_congestion_context_v1'],
            }),
          );
        }
      }
      lowStart = null;
    }
  }

  for (let i = 2; i < buckets.length - 2; i++) {
    if (inCurve(i, curves)) continue;
    const window = sliceBuckets(buckets, i - 2, i + 2);
    const speeds = window.map((b) => b.pinnedProductionL3Kmh);
    if (speeds.some((s) => s == null)) continue;
    const mid = speeds[2]!;
    const before = speeds[0]! - speeds[1]!;
    const after = speeds[4]! - speeds[3]!;
    const headingStable = perSecond
      .slice(i - 2, i + 2)
      .every((s) => s.heading.deltaFromPrevDeg == null || s.heading.deltaFromPrevDeg < 15);
    if (mid < 25 && before < -3 && after > 3 && headingStable) {
      events.push(
        makeEvent({
          eventId: `P3E_JUNC_APP_${i}`,
          eventType: 'JUNCTION_APPROACH',
          startUtc: window[0]!.bucketLabelUtc,
          endUtc: window[2]!.bucketLabelUtc,
          observedGpsCount: window.filter((b) => b.availability === 'PRESENT').length,
          missingGpsCount: window.length - window.filter((b) => b.availability === 'PRESENT').length,
          l3SpeedEvidence: summarizeSpeed(window.slice(0, 3)),
          qcStatus: qcStatusForWindow(window, qualityByLabel),
          spatialContext: baseSpatial(),
          precedingEvents: [],
          followingEvents: [],
          supportingEvidence: ['kinematic_decel_low_speed_valley'],
          contradictingEvidence: ['no_osm_junction_association_on_tesla_route'],
          uncertaintyReasons: ['junction_not_confirmed_without_topology'],
          evidenceClassification: 'INFERRED_CANDIDATE',
          provenance: ['phase3e_kinematic_junction_proxy_v1'],
        }),
      );
      events.push(
        makeEvent({
          eventId: `P3E_JUNC_EXIT_${i}`,
          eventType: 'JUNCTION_EXIT',
          startUtc: window[2]!.bucketLabelUtc,
          endUtc: window[4]!.bucketLabelUtc,
          observedGpsCount: window.filter((b) => b.availability === 'PRESENT').length,
          missingGpsCount: window.length - window.filter((b) => b.availability === 'PRESENT').length,
          l3SpeedEvidence: summarizeSpeed(window.slice(2)),
          qcStatus: qcStatusForWindow(window, qualityByLabel),
          spatialContext: baseSpatial(),
          precedingEvents: [],
          followingEvents: [],
          supportingEvidence: ['kinematic_accel_after_low_speed_valley'],
          contradictingEvidence: ['no_osm_junction_association_on_tesla_route'],
          uncertaintyReasons: ['exit_not_confirmed_without_topology'],
          evidenceClassification: 'INFERRED_CANDIDATE',
          provenance: ['phase3e_kinematic_junction_proxy_v1'],
        }),
      );
    }
  }

  events.push(
    makeEvent({
      eventId: 'P3E_UNKNOWN_ROAD_CTX_TRIP',
      eventType: 'UNKNOWN_ROAD_CONTEXT',
      startUtc: buckets[0]!.bucketLabelUtc,
      endUtc: buckets[buckets.length - 1]!.bucketLabelUtc,
      observedGpsCount: buckets.filter((b) => b.availability === 'PRESENT').length,
      missingGpsCount: buckets.filter((b) => b.availability === 'ROW_ABSENT').length,
      l3SpeedEvidence: summarizeSpeed(buckets),
      qcStatus: 'PARTIAL',
      spatialContext: baseSpatial(),
      precedingEvents: [],
      followingEvents: [],
      supportingEvidence: ['verified_osm_sha256', 'tesla_bbox_outside_frozen_osm_nodes'],
      contradictingEvidence: [],
      uncertaintyReasons: ['114_ambiguous_junctions_apply_to_ldi08_pin_only'],
      evidenceClassification: 'UNKNOWN',
      provenance: ['LDI10D_OSM_FROZEN_SNAPSHOT.json', 'TESLA_POSITION_GRID.json'],
    }),
  );

  events.sort((a, b) => labelMs(a.startUtc) - labelMs(b.startUtc));
  linkPrecedingFollowing(events);
  return dedupeOverlappingSameType(events);
}

function linkPrecedingFollowing(events: ContextualDrivingEvent[]): void {
  const byTime = [...events].sort((a, b) => labelMs(a.startUtc) - labelMs(b.startUtc));
  for (let i = 0; i < byTime.length; i++) {
    const cur = byTime[i];
    if (i > 0) cur.precedingEvents = [byTime[i - 1].eventId];
    if (i < byTime.length - 1) cur.followingEvents = [byTime[i + 1].eventId];
  }
}

function dedupeOverlappingSameType(events: ContextualDrivingEvent[]): ContextualDrivingEvent[] {
  const keep: ContextualDrivingEvent[] = [];
  const byType = new Map<ContextualEventType, ContextualDrivingEvent[]>();
  for (const e of events) {
    const list = byType.get(e.eventType) ?? [];
    list.push(e);
    byType.set(e.eventType, list);
  }
  for (const [type, list] of byType) {
    if (type === 'UNKNOWN_ROAD_CONTEXT') {
      keep.push(list[0]!);
      continue;
    }
    const sorted = list.sort((a, b) => labelMs(a.startUtc) - labelMs(b.startUtc));
    let cur = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const n = sorted[i];
      if (labelMs(n.startUtc) <= labelMs(cur.endUtc) + 1000) {
        cur = {
          ...cur,
          endUtc: n.endUtc > cur.endUtc ? n.endUtc : cur.endUtc,
          eventId: `${cur.eventId}_merged`,
        };
      } else {
        keep.push(cur);
        cur = n;
      }
    }
    if (cur) keep.push(cur);
  }
  return keep.sort((a, b) => labelMs(a.startUtc) - labelMs(b.startUtc));
}

export type EventGraph = {
  schema: 'LDI10D_PHASE3E_EVENT_GRAPH_V1';
  nodes: Array<{ eventId: string; eventType: ContextualEventType }>;
  edges: Array<{
    fromEventId: string;
    toEventId: string;
    relationship: 'TEMPORAL_NEXT' | 'SEQUENCE_MEMBER';
    linkEvidence: 'OBSERVED' | 'INFERRED';
  }>;
  researchedSequences: Array<{
    template: string;
    eventIds: string[];
    observedTransitions: string[];
    inferredTransitions: string[];
    note: string;
  }>;
};

export function buildEventGraph(events: ContextualDrivingEvent[]): EventGraph {
  const nodes = events.map((e) => ({ eventId: e.eventId, eventType: e.eventType }));
  const edges: EventGraph['edges'] = [];
  for (const e of events) {
    for (const fid of e.followingEvents) {
      edges.push({
        fromEventId: e.eventId,
        toEventId: fid,
        relationship: 'TEMPORAL_NEXT',
        linkEvidence: 'OBSERVED',
      });
    }
  }

  const researchedSequences: EventGraph['researchedSequences'] = [];
  const templates = [
    'DECELERATION → JUNCTION_APPROACH → ACCELERATION',
    'DECELERATION → CURVE_TRAVERSAL → ACCELERATION',
    'HIGH_SPEED → STRONG_DECELERATION → LOW_SPEED → ACCELERATION',
    'REPEATED_DECELERATION → LOW_SPEED → ACCELERATION',
  ];

  for (const template of templates) {
    const match = findSequenceMatch(events, template);
    researchedSequences.push(match);
  }

  return { schema: 'LDI10D_PHASE3E_EVENT_GRAPH_V1', nodes, edges, researchedSequences };
}

function findSequenceMatch(
  events: ContextualDrivingEvent[],
  template: string,
): EventGraph['researchedSequences'][0] {
  const typesNeeded: ContextualEventType[] = [];
  if (template.includes('JUNCTION_APPROACH')) typesNeeded.push('JUNCTION_APPROACH');
  if (template.includes('CURVE_TRAVERSAL')) typesNeeded.push('CURVE_TRAVERSAL');
  if (template.includes('STRONG_DECELERATION')) typesNeeded.push('HARD_BRAKING_CANDIDATE');
  if (template.includes('LOW_SPEED')) typesNeeded.push('REPEATED_LOW_SPEED_SEQUENCE');
  if (template.includes('ACCELERATION') && template.includes('CURVE')) {
    typesNeeded.push('CURVE_EXIT_ACCELERATION');
  } else if (template.includes('ACCELERATION')) {
    typesNeeded.push('STRAIGHT_ROAD_ACCELERATION', 'JUNCTION_EXIT', 'CURVE_EXIT_ACCELERATION');
  }
  if (template.includes('DECELERATION') && !template.includes('STRONG')) {
    typesNeeded.push('STRAIGHT_ROAD_DECELERATION', 'CURVE_APPROACH', 'JUNCTION_APPROACH');
  }

  const ordered = events.filter((e) => typesNeeded.includes(e.eventType));
  const eventIds = ordered.slice(0, 8).map((e) => e.eventId);
  return {
    template,
    eventIds,
    observedTransitions: eventIds.length >= 2 ? ['temporal_order_on_timeline'] : [],
    inferredTransitions:
      eventIds.length >= 2 ? ['semantic_template_fit_not_validated_as_single_maneuver'] : [],
    note: 'Sequence membership is research-only; gaps may contain untrusted seconds.',
  };
}

export type Phase3eQualitySummary = {
  eventsTotal: number;
  completeEvidence: number;
  partialEvidence: number;
  qcBlocked: number;
  spatiallyAmbiguous: number;
  contextSupported: number;
  unassessable: number;
  byClassification: Record<EvidenceClassification, number>;
};

export function summarizeEvidenceQuality(events: ContextualDrivingEvent[]): Phase3eQualitySummary {
  const byClassification: Record<EvidenceClassification, number> = {
    OBSERVED: 0,
    CONTEXT_SUPPORTED: 0,
    INFERRED_CANDIDATE: 0,
    UNKNOWN: 0,
  };
  let complete = 0;
  let partial = 0;
  let qcBlocked = 0;
  let spatial = 0;
  let unassessable = 0;
  let contextSupported = 0;
  for (const e of events) {
    byClassification[e.evidenceClassification] += 1;
    if (e.qcStatus === 'COMPLETE_TRUSTED') complete += 1;
    else if (e.qcStatus === 'PARTIAL') partial += 1;
    else if (e.qcStatus === 'QC_BLOCKED') qcBlocked += 1;
    else unassessable += 1;
    if (e.spatialContext.roadAssociation === 'UNSUPPORTED_OUT_OF_FROZEN_BBOX') spatial += 1;
    if (e.evidenceClassification === 'CONTEXT_SUPPORTED') contextSupported += 1;
  }
  return {
    eventsTotal: events.length,
    completeEvidence: complete,
    partialEvidence: partial,
    qcBlocked,
    spatiallyAmbiguous: spatial,
    contextSupported,
    unassessable,
    byClassification,
  };
}

export function runPhase3eAnalysis(repoRoot: string): {
  preflight: ReturnType<typeof verifyPhase3ePreflight>;
  perSecond: SecondTimelineRecord[];
  events: ContextualDrivingEvent[];
  graph: EventGraph;
  quality: Phase3eQualitySummary;
  l3BaselineDrift: 'NONE' | 'DRIFT';
  phase3aPreserved: boolean;
} {
  const preflight = verifyPhase3ePreflight(repoRoot);
  const p3d = runPhase3dAnalysis(repoRoot);
  const p2b = runPhase2bTopologyAudit(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const junctionResearch = {
    confirmed: p2b.counts.drivableIntersectionsConfirmed,
    ambiguous: p2b.counts.intersectionsAmbiguous,
    signalized: p2b.counts.signalizedConfirmed,
  };
  const perSecond = buildPerSecondTimeline(fixture.buckets, p3d.records, junctionResearch);
  const events = detectContextualEvents(fixture.buckets, p3d.records, perSecond);
  const graph = buildEventGraph(events);
  const quality = summarizeEvidenceQuality(events);
  const l3BaselineDrift = p3d.l3BaselineDrift;
  const p3a = buildPhase3aTimeline(repoRoot);
  return {
    preflight,
    perSecond,
    events,
    graph,
    quality,
    l3BaselineDrift,
    phase3aPreserved: p3a.events.length === PHASE3A_EXPECTED.eventsTotal,
  };
}

export function timelineJsonSha256(perSecond: SecondTimelineRecord[]): string {
  return crypto.createHash('sha256').update(JSON.stringify(perSecond)).digest('hex');
}
