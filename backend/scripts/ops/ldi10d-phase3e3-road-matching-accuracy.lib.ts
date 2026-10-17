/**
 * LDI-10D Phase 3E.3 — road matching ground truth & accuracy forensics (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sha256File } from './ldi10a-longitudinal-candidate-forensics.lib';
import { POSITION_PAYLOAD_SHA256 } from './ldi10d-phase3c1-tesla-gps-comparative-replay.lib';
import { loadCommittedFixture, type FixtureBucket } from './ldi10d-phase3c2-tesla-gps-fixture.lib';
import {
  BEARING_COMPAT_DEG,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  nearestWayCandidates,
  type OsmWay,
} from './ldi10d-phase2-osm-road-context.lib';
import {
  BASELINE_AMBIGUOUS,
  BASELINE_ASSOCIATED,
  BASELINE_UNKNOWN,
  EXPECTED_TESLA_OSM_SHA256,
  buildWayAdjacency,
  loadTeslaOsmDoc,
  viterbiForwardAssociation,
} from './ldi10d-phase3e2-spatial-forensics.lib';
import {
  EVIDENCE_DIR_REL,
  TESLA_OSM_SNAPSHOT_FILENAME,
  type RoadAssociationOutcome,
  type TeslaBucketAssociation,
  buildTeslaBucketAssociations,
  buildTeslaTopologyContext,
} from './ldi10d-phase3e1-tesla-osm-spatial.lib';
import type { ContextualDrivingEvent } from './ldi10d-phase3e-contextual-events.lib';
import { runPhase3dAnalysis, verifyPhase3dPreflight } from './ldi10d-phase3d-gps-evidence-quality.lib';
import { auditOsmTopology, auditTrafficSignals } from './ldi10d-phase3e2-spatial-forensics.lib';

export { EXPECTED_TESLA_OSM_SHA256, BASELINE_ASSOCIATED, BASELINE_AMBIGUOUS, BASELINE_UNKNOWN };

export type MatrixLabel = 'ASSOCIATED' | 'AMBIGUOUS' | 'UNKNOWN';

export function normalizeOutcome(o: RoadAssociationOutcome | string): MatrixLabel {
  if (o === 'CONFIRMED' || o === 'ASSOCIATED') return 'ASSOCIATED';
  if (o === 'AMBIGUOUS') return 'AMBIGUOUS';
  return 'UNKNOWN';
}

export function verifyPhase3e3Preflight(repoRoot: string): {
  ok: boolean;
  errors: string[];
  inputIntegrity: 'PASS' | 'FAIL';
  gpsBuckets: number;
  present: number;
  rowAbsent: number;
  teslaOsmSha256: string;
  baselineCounts: { associated: number; ambiguous: number; unknown: number };
  candidateCounts: { associated: number; ambiguous: number; unknown: number };
} {
  const errors: string[] = [];
  const p3d = verifyPhase3dPreflight(repoRoot);
  if (!p3d.ok) errors.push(...p3d.errors);

  const fixture = loadCommittedFixture(repoRoot);
  const present = fixture.buckets.filter((b) => b.availability === 'PRESENT').length;
  const absent = fixture.buckets.filter((b) => b.availability === 'ROW_ABSENT').length;
  if (fixture.bucketCount !== 1136) errors.push('buckets');
  if (present !== 867) errors.push(`present ${present}`);
  if (absent !== 269) errors.push(`absent ${absent}`);
  if (fixture.positionPayloadSha256 !== POSITION_PAYLOAD_SHA256) errors.push('position hash');

  const osmPath = path.join(repoRoot, EVIDENCE_DIR_REL, TESLA_OSM_SNAPSHOT_FILENAME);
  const sha = sha256File(osmPath);
  if (sha !== EXPECTED_TESLA_OSM_SHA256) errors.push('tesla osm sha');

  const perSecPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E2_PER_SECOND_SPATIAL.json');
  if (!fs.existsSync(perSecPath)) errors.push('missing 3e2 per-second');
  const perSec = JSON.parse(fs.readFileSync(perSecPath, 'utf8')) as {
    buckets: Array<{ baselineOutcome: string; candidateOutcome: string }>;
  };
  const countOutcomes = (prefix: 'baseline' | 'candidate') => {
    let a = 0;
    let amb = 0;
    let u = 0;
    for (const b of perSec.buckets) {
      const n = normalizeOutcome(prefix === 'baseline' ? b.baselineOutcome : b.candidateOutcome);
      if (n === 'ASSOCIATED') a += 1;
      else if (n === 'AMBIGUOUS') amb += 1;
      else u += 1;
    }
    return { associated: a, ambiguous: amb, unknown: u };
  };
  const baselineCounts = countOutcomes('baseline');
  const candidateCounts = countOutcomes('candidate');
  if (baselineCounts.associated !== BASELINE_ASSOCIATED) errors.push('baseline associated');
  if (baselineCounts.ambiguous !== BASELINE_AMBIGUOUS) errors.push('baseline ambiguous');
  if (baselineCounts.unknown !== BASELINE_UNKNOWN) errors.push('baseline unknown');
  if (candidateCounts.associated !== 300) errors.push('candidate associated');
  if (candidateCounts.ambiguous !== 357) errors.push('candidate ambiguous');
  if (candidateCounts.unknown !== 479) errors.push('candidate unknown');

  return {
    ok: errors.length === 0,
    errors,
    inputIntegrity: errors.length === 0 ? 'PASS' : 'FAIL',
    gpsBuckets: fixture.bucketCount,
    present,
    rowAbsent: absent,
    teslaOsmSha256: sha,
    baselineCounts,
    candidateCounts,
  };
}

export type TransitionMatrix = Record<MatrixLabel, Record<MatrixLabel, number>>;

export function buildTransitionMatrix(
  baseline: MatrixLabel[],
  candidate: MatrixLabel[],
): {
  matrix: TransitionMatrix;
  grossChanges: number;
  netAssociatedDelta: number;
  netAmbiguousDelta: number;
  netUnknownDelta: number;
} {
  const matrix: TransitionMatrix = {
    ASSOCIATED: { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 },
    AMBIGUOUS: { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 },
    UNKNOWN: { ASSOCIATED: 0, AMBIGUOUS: 0, UNKNOWN: 0 },
  };
  for (let i = 0; i < baseline.length; i++) {
    matrix[baseline[i]][candidate[i]] += 1;
  }
  let gross = 0;
  for (const from of Object.keys(matrix) as MatrixLabel[]) {
    for (const to of Object.keys(matrix[from]) as MatrixLabel[]) {
      if (from !== to) gross += matrix[from][to];
    }
  }
  const baseAssoc = baseline.filter((x) => x === 'ASSOCIATED').length;
  const candAssoc = candidate.filter((x) => x === 'ASSOCIATED').length;
  const baseAmb = baseline.filter((x) => x === 'AMBIGUOUS').length;
  const candAmb = candidate.filter((x) => x === 'AMBIGUOUS').length;
  const baseUnk = baseline.filter((x) => x === 'UNKNOWN').length;
  const candUnk = candidate.filter((x) => x === 'UNKNOWN').length;
  return {
    matrix,
    grossChanges: gross,
    netAssociatedDelta: candAssoc - baseAssoc,
    netAmbiguousDelta: candAmb - baseAmb,
    netUnknownDelta: candUnk - baseUnk,
  };
}

function headingDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function graphReachable(adj: Map<number, Set<number>>, a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  return adj.get(a)?.has(b) ?? false;
}

export type BucketChangeRecord = {
  bucketLabelUtc: string;
  baselineOutcome: MatrixLabel;
  candidateOutcome: MatrixLabel;
  baselineWayId: number | null;
  candidateWayId: number | null;
  qcTrustLevel: string;
  l3Kmh: number | null;
  lat: number | null;
  lon: number | null;
  headingDeg: number | null;
  candidateWayIds: number[];
  competingWithin5m: boolean;
  nearestDistanceM: number | null;
  graphContinuityFromPrev: boolean | null;
  ambiguityReasons: string[];
  riskNote: string | null;
};

export function buildBucketChangeLog(params: {
  buckets: FixtureBucket[];
  baselineAssoc: TeslaBucketAssociation[];
  candidateAssoc: TeslaBucketAssociation[];
  ways: OsmWay[];
  adj: Map<number, Set<number>>;
}): BucketChangeRecord[] {
  const changes: BucketChangeRecord[] = [];
  for (let i = 0; i < params.buckets.length; i++) {
    const b = params.buckets[i];
    const bl = params.baselineAssoc[i];
    const ca = params.candidateAssoc[i];
    const bo = normalizeOutcome(bl.outcome);
    const co = normalizeOutcome(ca.outcome);
    if (bo === co && bl.osmWayId === ca.osmWayId) continue;

    let nearestDistanceM: number | null = null;
    let competingWithin5m = false;
    if (b.latitude != null && b.longitude != null) {
      const hits = nearestWayCandidates(b.latitude, b.longitude, params.ways, DEFAULT_UNCERTAINTY_RADIUS_M);
      nearestDistanceM = hits[0]?.distanceM ?? null;
      competingWithin5m = hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5;
    }
    const prevWay = i > 0 ? params.candidateAssoc[i - 1].osmWayId : null;
    let riskNote: string | null = null;
    if (co === 'ASSOCIATED' && bo !== 'ASSOCIATED') riskNote = 'POTENTIAL_FALSE_POSITIVE_ASSOCIATION';
    if (bo === 'ASSOCIATED' && co !== 'ASSOCIATED') riskNote = 'POTENTIAL_OVER_CONSERVATIVE_REJECTION';

    changes.push({
      bucketLabelUtc: b.bucketLabelUtc,
      baselineOutcome: bo,
      candidateOutcome: co,
      baselineWayId: bl.osmWayId,
      candidateWayId: ca.osmWayId,
      qcTrustLevel: b.qcTrustLevel,
      l3Kmh: b.pinnedProductionL3Kmh,
      lat: b.latitude,
      lon: b.longitude,
      headingDeg: bl.headingDeg,
      candidateWayIds: ca.candidateWayIds,
      competingWithin5m,
      nearestDistanceM,
      graphContinuityFromPrev: graphReachable(params.adj, prevWay, ca.osmWayId),
      ambiguityReasons: [...new Set([...bl.ambiguityReasons, ...ca.ambiguityReasons])],
      riskNote,
    });
  }
  return changes;
}

/** Research-only: heading-gated single-step pick (no Viterbi). */
export function greedyHeadingGatedAssociation(
  buckets: FixtureBucket[],
  ways: OsmWay[],
  headings: (number | null)[],
): TeslaBucketAssociation[] {
  const out: TeslaBucketAssociation[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      out.push({
        bucketLabelUtc: b.bucketLabelUtc,
        lat: b.latitude,
        lon: b.longitude,
        gpsStatus: b.availability === 'ROW_ABSENT' ? 'ROW_ABSENT' : 'OTHER',
        headingDeg: null,
        outcome: 'UNKNOWN',
        osmWayId: null,
        candidateWayIds: [],
        ambiguityReasons: ['NO_GPS'],
        nearestConfirmedJunctionM: null,
        confirmedJunctionNodeId: null,
        trafficSignalNodeId: null,
        trafficSignalDistanceM: null,
        temporalContinuityWayId: null,
        provenance: ['phase3e3_greedy_heading_gated_v1'],
      });
      continue;
    }
    const hits = nearestWayCandidates(b.latitude!, b.longitude!, ways, DEFAULT_UNCERTAINTY_RADIUS_M);
    let outcome: RoadAssociationOutcome = 'UNKNOWN';
    let wayId: number | null = null;
    const reasons: string[] = [];
    if (hits.length === 0) reasons.push('NO_WAY');
    else if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5) {
      outcome = 'AMBIGUOUS';
      reasons.push('COMPETING_5M');
    } else {
      const top = hits[0];
      if (headings[i] != null && top.segmentBearingDeg != null) {
        const d = headingDelta(headings[i]!, top.segmentBearingDeg!);
        if (d > BEARING_COMPAT_DEG) {
          outcome = 'AMBIGUOUS';
          reasons.push(`BEARING_${d.toFixed(0)}`);
        } else {
          outcome = 'CONFIRMED';
          wayId = top.way.osmId;
        }
      } else {
        outcome = 'AMBIGUOUS';
        reasons.push('NO_HEADING');
      }
    }
    out.push({
      bucketLabelUtc: b.bucketLabelUtc,
      lat: b.latitude,
      lon: b.longitude,
      gpsStatus: 'PRESENT',
      headingDeg: headings[i],
      outcome,
      osmWayId: wayId,
      candidateWayIds: hits.map((h) => h.way.osmId),
      ambiguityReasons: reasons,
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
      temporalContinuityWayId: wayId,
      provenance: ['phase3e3_greedy_heading_gated_v1'],
    });
  }
  return out;
}

export type ManualReviewCase = {
  caseId: string;
  bucketLabelUtc: string;
  selectionReason: string;
  baselineOutcome: MatrixLabel;
  candidateOutcome: MatrixLabel;
  independentLabel: 'NOT_AVAILABLE';
  reviewStatus: 'QUEUED_FOR_OWNER';
  evidence: Record<string, unknown>;
};

export function buildManualReviewDataset(
  changes: BucketChangeRecord[],
  buckets: FixtureBucket[],
  extra: BucketChangeRecord[],
): ManualReviewCase[] {
  const cases: ManualReviewCase[] = [];
  const seen = new Set<string>();
  const priority = [...changes, ...extra.filter((e) => !changes.some((c) => c.bucketLabelUtc === e.bucketLabelUtc))];
  priority.sort((a, b) => {
    const score = (r: BucketChangeRecord) =>
      (r.riskNote ? 10 : 0) + (r.competingWithin5m ? 5 : 0) + (r.baselineOutcome !== r.candidateOutcome ? 3 : 0);
    return score(b) - score(a);
  });

  for (let i = 0; i < priority.length && cases.length < 40; i++) {
    const c = priority[i];
    if (seen.has(c.bucketLabelUtc)) continue;
    seen.add(c.bucketLabelUtc);
    const b = buckets.find((x) => x.bucketLabelUtc === c.bucketLabelUtc);
    cases.push({
      caseId: `MR_${i + 1}_${c.bucketLabelUtc.replace(/[:]/g, '')}`,
      bucketLabelUtc: c.bucketLabelUtc,
      selectionReason: c.riskNote ?? 'OUTCOME_OR_WAY_CHANGE',
      baselineOutcome: c.baselineOutcome,
      candidateOutcome: c.candidateOutcome,
      independentLabel: 'NOT_AVAILABLE',
      reviewStatus: 'QUEUED_FOR_OWNER',
      evidence: { ...c, rowAbsent: b?.availability === 'ROW_ABSENT' },
    });
  }
  return cases;
}

export function investigateIndependentGroundTruth(repoRoot: string): {
  available: false;
  status: 'NOT_ASSESSABLE';
  sourcesInspected: string[];
  acquisitionPlan: string[];
} {
  const sources = [
    'TESLA_POSITION_GRID.json (observed GPS — not independent road ID)',
    'VIDEO_TACHO_REFERENCE.json (speed witness — not road identity)',
    'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json (same OSM used by matcher — not independent GT)',
    'LDI10D_PHASE3E2 contextual reassessment (algorithm output)',
  ];
  const plan = [
    'Owner manual map review with dashcam frame ↔ OSM way ID labels',
    'Independent survey-grade trace or third-party map matching export',
    'Documented route plan with named waypoints external to SynqDrive',
  ];
  return { available: false, status: 'NOT_ASSESSABLE', sourcesInspected: sources, acquisitionPlan: plan };
}

export type FailureModeCount = { mode: string; bucketHits: number; layer: string };

export function spatialFailureModeAnalysis(
  changes: BucketChangeRecord[],
  buckets: FixtureBucket[],
): FailureModeCount[] {
  const modes: FailureModeCount[] = [];
  const add = (mode: string, layer: string, n: number) => modes.push({ mode, layer, bucketHits: n });

  add('PARALLEL_OR_SERVICE_ROADS', 'ASSOCIATION', changes.filter((c) => c.competingWithin5m).length);
  add('ROW_ABSENT_GPS', 'GPS', buckets.filter((b) => b.availability === 'ROW_ABSENT').length);
  add('QC_UNTRUSTED', 'QC', buckets.filter((b) => b.qcTrustLevel !== 'TRUSTED' && b.qcTrustLevel !== 'TRUSTED_LIMITED').length);
  add('BEARING_MISMATCH', 'ASSOCIATION', changes.filter((c) => c.ambiguityReasons.some((r) => r.includes('BEARING'))).length);
  add('NO_WAY_IN_RADIUS', 'OSM_OR_GPS', changes.filter((c) => c.nearestDistanceM == null).length);
  add('GRAPH_DISCONTINUITY', 'ASSOCIATION', changes.filter((c) => c.graphContinuityFromPrev === false).length);
  return modes;
}

export type ForensicFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
};

export function buildForensicGeoJson(params: {
  buckets: FixtureBucket[];
  baseline: TeslaBucketAssociation[];
  candidate: TeslaBucketAssociation[];
  junctions: Array<{ nodeId: number; lat: number; lon: number }>;
  signals: Array<{ osmNodeId: number; lat: number; lon: number }>;
  hardBrakeEvents: ContextualDrivingEvent[];
}): ForensicFeatureCollection {
  const features: ForensicFeatureCollection['features'] = [];
  for (let i = 0; i < params.buckets.length; i++) {
    const b = params.buckets[i];
    if (b.latitude == null || b.longitude == null) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.longitude!, b.latitude!] },
      properties: {
        layer: 'gps_observed',
        utc: b.bucketLabelUtc,
        baselineOutcome: normalizeOutcome(params.baseline[i].outcome),
        candidateOutcome: normalizeOutcome(params.candidate[i].outcome),
        baselineWayId: params.baseline[i].osmWayId,
        candidateWayId: params.candidate[i].osmWayId,
        qc: b.qcTrustLevel,
        l3Kmh: b.pinnedProductionL3Kmh,
      },
    });
  }
  for (const j of params.junctions.slice(0, 500)) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [j.lon, j.lat] },
      properties: { layer: 'junction_confirmed_sample', nodeId: j.nodeId },
    });
  }
  for (const s of params.signals.filter((x) => x.lat).slice(0, 200)) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: { layer: 'traffic_signal_sample', nodeId: s.osmNodeId },
    });
  }
  for (const ev of params.hardBrakeEvents) {
    const b = params.buckets.find((x) => x.bucketLabelUtc === ev.startUtc);
    if (b?.latitude == null) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.longitude!, b.latitude!] },
      properties: { layer: 'hard_braking', eventId: ev.eventId },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function buildOfflineHtmlMap(geojson: ForensicFeatureCollection): string {
  const data = JSON.stringify(geojson).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>LDI-10D Phase 3E.3 Forensic Map</title>
<style>body{font-family:system-ui;margin:0}#c{width:100vw;height:100vh;cursor:crosshair}#panel{position:fixed;top:8px;left:8px;background:#fff;padding:8px;border:1px solid #ccc;max-width:360px;font-size:12px;max-height:90vh;overflow:auto}</style>
</head><body>
<div id="panel"><strong>Offline forensic map</strong> (no tile server; observed points only)<br/>
<label><input type="checkbox" id="lgps" checked/> GPS</label>
<label><input type="checkbox" id="lj" checked/> Junctions (sample)</label>
<label><input type="checkbox" id="ls" checked/> Signals (sample)</label>
<label><input type="checkbox" id="lb" checked/> Hard braking</label>
<div id="info">Click a point</div></div>
<canvas id="c"></canvas>
<script>
const FC=${data};
const colors={gps_observed:'#2563eb',junction_confirmed_sample:'#16a34a',traffic_signal_sample:'#dc2626',hard_braking:'#9333ea'};
let bounds=null;
for(const f of FC.features){const [lon,lat]=f.geometry.coordinates;if(!bounds)bounds={minLon:lon,maxLon:lon,minLat:lat,maxLat:lat};bounds.minLon=Math.min(bounds.minLon,lon);bounds.maxLon=Math.max(bounds.maxLon,lon);bounds.minLat=Math.min(bounds.minLat,lat);bounds.maxLat=Math.max(bounds.maxLat,lat);}
const canvas=document.getElementById('c');const ctx=canvas.getContext('2d');
function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;draw();}
function project(lon,lat){const pad=40;const w=canvas.width-pad*2,h=canvas.height-pad*2;const x=pad+((lon-bounds.minLon)/(bounds.maxLon-bounds.minLon||1))*w;const y=pad+h-((lat-bounds.minLat)/(bounds.maxLat-bounds.minLat||1))*h;return[x,y];}
function layerOn(l){if(l==='gps_observed')return document.getElementById('lgps').checked;if(l==='junction_confirmed_sample')return document.getElementById('lj').checked;if(l==='traffic_signal_sample')return document.getElementById('ls').checked;if(l==='hard_braking')return document.getElementById('lb').checked;return true;}
function draw(){ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.width,canvas.height);for(const f of FC.features){const l=f.properties.layer;if(!layerOn(l))continue;const [lon,lat]=f.geometry.coordinates;const [x,y]=project(lon,lat);ctx.fillStyle=colors[l]||'#000';ctx.beginPath();ctx.arc(x,y,l==='hard_braking'?6:3,0,Math.PI*2);ctx.fill();}}
window.addEventListener('resize',resize);resize();
canvas.addEventListener('click',e=>{const rect=canvas.getBoundingClientRect();let best=null,bd=1e9;for(const f of FC.features){if(!layerOn(f.properties.layer))continue;const [lon,lat]=f.geometry.coordinates;const [x,y]=project(lon,lat);const d=Math.hypot(e.clientX-rect.left-x,e.clientY-rect.top-y);if(d<bd&&d<12){bd=d;best=f;}}document.getElementById('info').textContent=best?JSON.stringify(best.properties,null,2):'No feature';});
</script></body></html>`;
}

export function runPhase3e3Analysis(repoRoot: string): {
  preflight: ReturnType<typeof verifyPhase3e3Preflight>;
  transition: ReturnType<typeof buildTransitionMatrix>;
  changeLog: BucketChangeRecord[];
  manualReview: ManualReviewCase[];
  groundTruth: ReturnType<typeof investigateIndependentGroundTruth>;
  greedyCounts: { associated: number; ambiguous: number; unknown: number };
  impossibleTransitions: number;
  failureModes: FailureModeCount[];
  contextualEvents: number;
  hardBrakingStudies: Array<Record<string, unknown>>;
  geojson: ForensicFeatureCollection;
  l3BaselineDrift: 'NONE' | 'DRIFT';
  runtimeMs: { viterbiReplay: number };
} {
  const preflight = verifyPhase3e3Preflight(repoRoot);
  const fixture = loadCommittedFixture(repoRoot);
  const p3d = runPhase3dAnalysis(repoRoot);
  const topoCtx = buildTeslaTopologyContext(loadTeslaOsmDoc(repoRoot).doc);
  const adj = buildWayAdjacency(topoCtx.ways);

  const assocPath = path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_TESLA_SPATIAL_ASSOCIATION.json');
  const baselineAssoc = (
    JSON.parse(fs.readFileSync(assocPath, 'utf8')) as { associations: TeslaBucketAssociation[] }
  ).associations;

  const tv0 = Date.now();
  const recomputed = buildTeslaBucketAssociations(fixture.buckets, topoCtx);
  const headings = recomputed.map((a) => a.headingDeg);
  const candidateAssoc = viterbiForwardAssociation(fixture.buckets, topoCtx.ways, headings);
  const runtimeMs = { viterbiReplay: Date.now() - tv0 };

  const greedy = greedyHeadingGatedAssociation(fixture.buckets, topoCtx.ways, headings);
  const greedyLabels = greedy.map((g) => normalizeOutcome(g.outcome));
  const greedyCounts = {
    associated: greedyLabels.filter((x) => x === 'ASSOCIATED').length,
    ambiguous: greedyLabels.filter((x) => x === 'AMBIGUOUS').length,
    unknown: greedyLabels.filter((x) => x === 'UNKNOWN').length,
  };

  const baselineLabels = baselineAssoc.map((b) => normalizeOutcome(b.outcome));
  const candidateLabels = candidateAssoc.map((c) => normalizeOutcome(c.outcome));
  const transition = buildTransitionMatrix(baselineLabels, candidateLabels);
  const changeLog = buildBucketChangeLog({
    buckets: fixture.buckets,
    baselineAssoc,
    candidateAssoc,
    ways: topoCtx.ways,
    adj,
  });

  let impossibleTransitions = 0;
  for (let i = 1; i < candidateAssoc.length; i++) {
    const a = candidateAssoc[i - 1];
    const b = candidateAssoc[i];
    if (
      a.osmWayId != null &&
      b.osmWayId != null &&
      a.osmWayId !== b.osmWayId &&
      !graphReachable(adj, a.osmWayId, b.osmWayId) &&
      normalizeOutcome(b.outcome) === 'ASSOCIATED'
    ) {
      impossibleTransitions += 1;
    }
  }

  const extraInformative: BucketChangeRecord[] = [];
  for (let i = 0; i < fixture.buckets.length; i++) {
    const b = fixture.buckets[i];
    if (b.latitude == null) continue;
    const hits = nearestWayCandidates(b.latitude!, b.longitude!, topoCtx.ways, DEFAULT_UNCERTAINTY_RADIUS_M);
    if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < 5) {
      extraInformative.push({
        bucketLabelUtc: b.bucketLabelUtc,
        baselineOutcome: normalizeOutcome(baselineAssoc[i].outcome),
        candidateOutcome: normalizeOutcome(candidateAssoc[i].outcome),
        baselineWayId: baselineAssoc[i].osmWayId,
        candidateWayId: candidateAssoc[i].osmWayId,
        qcTrustLevel: b.qcTrustLevel,
        l3Kmh: b.pinnedProductionL3Kmh,
        lat: b.latitude,
        lon: b.longitude,
        headingDeg: baselineAssoc[i].headingDeg,
        candidateWayIds: baselineAssoc[i].candidateWayIds,
        competingWithin5m: true,
        nearestDistanceM: hits[0]?.distanceM ?? null,
        graphContinuityFromPrev: null,
        ambiguityReasons: baselineAssoc[i].ambiguityReasons,
        riskNote: 'PARALLEL_ROAD_CONTEXT',
      });
    }
  }
  const manualReview = buildManualReviewDataset(changeLog, fixture.buckets, extraInformative);
  const groundTruth = investigateIndependentGroundTruth(repoRoot);
  const failureModes = spatialFailureModeAnalysis(changeLog, fixture.buckets);

  const ev = JSON.parse(
    fs.readFileSync(path.join(repoRoot, EVIDENCE_DIR_REL, 'LDI10D_PHASE3E1_CONTEXTUAL_EVENTS.json'), 'utf8'),
  ) as { events: ContextualDrivingEvent[] };

  const topology = auditOsmTopology(repoRoot);
  const signals = auditTrafficSignals(repoRoot);
  const hardEvents = ev.events.filter((e) => e.eventType === 'HARD_BRAKING_CANDIDATE');

  const hardBrakingStudies = hardEvents.map((evn) => {
    const idx = fixture.buckets.findIndex((b) => b.bucketLabelUtc === evn.startUtc);
    const prev = idx > 0 ? fixture.buckets[idx - 1] : null;
    const cur = fixture.buckets[idx];
    const next = idx >= 0 ? fixture.buckets[idx + 1] : null;
    return {
      eventId: evn.eventId,
      startUtc: evn.startUtc,
      endUtc: evn.endUtc,
      speedBeforeKmh: prev?.pinnedProductionL3Kmh ?? null,
      speedAfterKmh: cur?.pinnedProductionL3Kmh ?? null,
      deltaKmh:
        prev?.pinnedProductionL3Kmh != null && cur?.pinnedProductionL3Kmh != null
          ? cur.pinnedProductionL3Kmh - prev.pinnedProductionL3Kmh
          : null,
      minObservedSpeedKmh: evn.l3SpeedEvidence.minKmh,
      subsequentAcceleration: next?.pinnedProductionL3Kmh != null && cur?.pinnedProductionL3Kmh != null
        ? next.pinnedProductionL3Kmh - cur.pinnedProductionL3Kmh
        : null,
      baselineAssociation: baselineAssoc[idx],
      candidateAssociation: candidateAssoc[idx],
      junctionProximityM: baselineAssoc[idx]?.nearestConfirmedJunctionM,
      signalDistanceM: baselineAssoc[idx]?.trafficSignalDistanceM,
      notEmergencyNotRedLight: true,
      competingExplanations: evn.uncertaintyReasons,
    };
  });

  const geojson = buildForensicGeoJson({
    buckets: fixture.buckets,
    baseline: baselineAssoc,
    candidate: candidateAssoc,
    junctions: topology.records
      .filter((r) => r.forensicClass === 'CONFIRMED_DRIVABLE_INTERSECTION')
      .slice(0, 500)
      .map((r) => ({ nodeId: r.nodeId, lat: r.lat, lon: r.lon })),
    signals: signals.records
      .filter((r) => r.classification === 'VEHICLE_RELEVANT_ROUTE')
      .map((r) => ({ osmNodeId: r.osmNodeId, lat: r.lat, lon: r.lon })),
    hardBrakeEvents: hardEvents,
  });

  return {
    preflight,
    transition,
    changeLog,
    manualReview,
    groundTruth,
    greedyCounts,
    impossibleTransitions,
    failureModes,
    contextualEvents: ev.events.length,
    hardBrakingStudies,
    geojson,
    l3BaselineDrift: p3d.l3BaselineDrift,
    runtimeMs,
  };
}
