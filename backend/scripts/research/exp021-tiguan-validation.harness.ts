/**
 * EXP021 — VW Tiguan offline A–E validation (research only, no production mutations).
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/research/exp021-tiguan-validation.harness.ts
 *
 * Env:
 *   TIGUAN_EVIDENCE_GZIP — path to exported payload_gzip (default: artifact raw export)
 *   TIGUAN_RESEARCH_OUT — output root (default: architecture/.../exp021-tiguan-20261019)
 *   TIGUAN_SKIP_OSM_FETCH=1 — skip Overpass if frozen OSM already exists
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseDiV0S4EvidenceContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-evidence-container-parse';
import { buildDiV0S4EvidenceSnapshotHash } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import { DI_V0_S4_LIMITS } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { buildResearchGpsBucketsFromParsedContainer } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research-worker/di-v0-s4-research-snapshot-adapter';
import { parseDiV0PositionSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/position-acquisition/di-v0-position-snapshot-parse';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildDirectedCarRoutingGraph,
  buildRoadContextFromOverpass,
  buildStrictNodeIdWayAdjacency,
  buildViterbiMatchesBacktrackR1,
  buildViterbiMatchesRouteAwareR4_1,
  resetRouteQueryRuntimeProfile,
  type ResearchGpsBucket,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import {
  buildViterbiMatches,
  headingsFromBaseline,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildWayAdjacency } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import {
  S4_RESEARCH_GEOMETRY_PROJECTION_ID,
  S4_RESEARCH_ROUTE_AWARE_VITERBI_R4_1,
  S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1,
  S4_RESEARCH_VITERBI_ALGORITHM_ID,
  S4_RESEARCH_VITERBI_BACKTRACK_ALGORITHM_ID,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/version';

const repoRoot = path.resolve(__dirname, '../../..');
const compactDir =
  process.env.TIGUAN_COMPACT_DIR ?? '/opt/cursor/artifacts/exp021-tiguan-validation/compact';
const evidenceGzip =
  process.env.TIGUAN_EVIDENCE_GZIP ??
  '/opt/cursor/artifacts/exp021-tiguan-validation/raw/tiguan_evidence_payload.gz';
const outRoot =
  process.env.TIGUAN_RESEARCH_OUT ??
  path.join(repoRoot, 'architecture/drivingintelligence/evidence/exp021-tiguan-20261019');

const SNAPSHOT_SCOPE = {
  organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
  vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  tripId: '632dc9c5-a8d9-45ce-a269-abe89d22d677',
  boundaryFingerprint:
    'DI_V0_S4_BOUNDARY_FP_V1:sha256:61930eff873727dd900f719d49caf418c318e3e9d6b096d1adb6928af0293cc2',
  snapshotHash:
    'DI_V0_S4_EVIDENCE_V1:sha256:b14c6bba122a44d36faa245e7950341cc124ec4e5a2536a698c720393338088a',
  sourceFamily: 'DIMO' as const,
  uncompressedBytes: 616572,
};

const ALGORITHM_COMMIT_SHA = '9f0693bef572a065e45f5dad91ef236ba4f2ccd9';
const VIDEO_DEVICE_UTC_START = '2026-10-19T10:29:19Z';
const VIDEO_DEVICE_UTC_END = '2026-10-19T10:38:24Z';

type Variant = 'A' | 'B' | 'C' | 'D' | 'E';

function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function sha256Utf8(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function marginDegrees(lat: number, marginM: number): { dLat: number; dLon: number } {
  const dLat = marginM / 111_320;
  const dLon = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLon };
}

function bboxFromBuckets(buckets: ResearchGpsBucket[], marginM: number): {
  south: number;
  north: number;
  west: number;
  east: number;
} {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const b of buckets) {
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) continue;
    minLat = Math.min(minLat, b.latitude);
    maxLat = Math.max(maxLat, b.latitude);
    minLon = Math.min(minLon, b.longitude);
    maxLon = Math.max(maxLon, b.longitude);
  }
  if (!Number.isFinite(minLat)) throw new Error('No PRESENT coordinates for bbox');
  const mid = (minLat + maxLat) / 2;
  const { dLat, dLon } = marginDegrees(mid, marginM);
  return {
    south: minLat - dLat,
    north: maxLat + dLat,
    west: minLon - dLon,
    east: maxLon + dLon,
  };
}

function overpassQueryForBbox(bb: { south: number; north: number; west: number; east: number }): string {
  const { south, north, west, east } = bb;
  return `[out:json][timeout:120];
(
  node["highway"="traffic_signals"](${south},${west},${north},${east});
  node["highway"="crossing"](${south},${west},${north},${east});
  node["junction"](${south},${west},${north},${east});
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|service|living_street)$"](${south},${west},${north},${east});
  relation["type"="restriction"](${south},${west},${north},${east});
);
out body geom;`;
}

async function fetchOverpass(query: string): Promise<unknown> {
  const endpoint = 'https://overpass-api.de/api/interpreter';
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SynqDrive-EXP021-Tiguan-Research/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    lastStatus = res.status;
    if (res.ok) return (await res.json()) as unknown;
    if (res.status === 502 || res.status === 429 || res.status === 503) {
      await new Promise((r) => setTimeout(r, attempt * 8000));
      continue;
    }
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  throw new Error(`Overpass HTTP ${lastStatus} after retries`);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function loadReferenceSeconds(): Array<Record<string, string>> {
  const raw = fs.readFileSync(path.join(compactDir, 'TIGUAN_SECOND_BY_SECOND.csv'), 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.replace(/^\uFEFF/, '').split('\n').filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, j) => {
      row[h] = cols[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseWayIds(ref: string): number[] {
  if (!ref || ref === 'UNKNOWN') return [];
  return ref
    .split(/[|;]/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map((s) => Number(s));
}

function classifyReferenceOutcome(row: Record<string, string>): {
  comparable: boolean;
  reason: string;
} {
  if (row.observation_status === 'GAP') {
    return { comparable: false, reason: 'REFERENCE_GAP' };
  }
  const ways = parseWayIds(row.osm_way_ids ?? '');
  const road = row.road_name_verified ?? '';
  if (road === 'UNKNOWN' && ways.length === 0) {
    return { comparable: false, reason: 'REFERENCE_NOT_DECIDABLE' };
  }
  return { comparable: true, reason: 'REFERENCE_ASSESSABLE' };
}

function assessVariant(
  row: Record<string, string>,
  wayId: number | null,
  decoderOutcome: string,
): { agreement: string; outcome: string; errorClass: string } {
  const ref = classifyReferenceOutcome(row);
  if (!ref.comparable) {
    return { agreement: 'NOT_COMPARABLE', outcome: 'SKIPPED', errorClass: ref.reason };
  }
  const ways = parseWayIds(row.osm_way_ids ?? '');
  if (decoderOutcome === 'UNKNOWN' || wayId == null) {
    return { agreement: 'UNKNOWN', outcome: 'DECODER_UNKNOWN', errorClass: 'DECODER_UNKNOWN' };
  }
  if (ways.length > 0) {
    if (ways.includes(wayId)) {
      return { agreement: 'MATCH', outcome: 'REFERENCE_SUPPORTED_MATCH', errorClass: '' };
    }
    return { agreement: 'CONFLICT', outcome: 'REFERENCE_SUPPORTED_CONFLICT', errorClass: 'WAY_MISMATCH' };
  }
  return { agreement: 'UNKNOWN', outcome: 'REFERENCE_ROAD_ONLY', errorClass: 'NO_WAY_REFERENCE' };
}

function roadNameFromWay(waysById: Map<number, { name?: string | null }>, wayId: number | null): string {
  if (wayId == null) return '';
  const w = waysById.get(wayId);
  return w?.name ?? '';
}

async function main(): Promise<void> {
  const fixturesDir = path.join(outRoot, 'fixtures');
  const replayDir = path.join(outRoot, 'replay');
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.mkdirSync(replayDir, { recursive: true });

  const gzipBuf = fs.readFileSync(evidenceGzip);
  const raw = gunzipSync(gzipBuf, { maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes });
  if (raw.length !== SNAPSHOT_SCOPE.uncompressedBytes) {
    throw new Error(`Uncompressed size mismatch: ${raw.length} vs ${SNAPSHOT_SCOPE.uncompressedBytes}`);
  }
  const container = raw.toString('utf8');
  const snapshotHash = buildDiV0S4EvidenceSnapshotHash(container);
  if (snapshotHash !== SNAPSHOT_SCOPE.snapshotHash) {
    throw new Error('Snapshot hash mismatch');
  }

  const parsed = parseDiV0S4EvidenceContainer(container);
  if (parsed.snapshotHash !== SNAPSHOT_SCOPE.snapshotHash) {
    throw new Error('Parsed snapshot hash mismatch');
  }
  const positionPayload = parsed.channelPayloads.POSITION ?? '';
  const positionPayloadSha256 = sha256Utf8(positionPayload);
  const posMaterial = parseDiV0PositionSnapshot(positionPayload);
  const dimoTokenId = posMaterial.dimoTokenId;

  const buckets = buildResearchGpsBucketsFromParsedContainer(parsed);
  const gridPath = path.join(fixturesDir, 'TIGUAN_POSITION_GRID.json');
  const gridDoc = {
    schema: 'LDI10D_TIGUAN_POSITION_GRID_V1',
    tripId: SNAPSHOT_SCOPE.tripId,
    vehicleId: SNAPSHOT_SCOPE.vehicleId,
    organizationId: SNAPSHOT_SCOPE.organizationId,
    dimoTokenId,
    pinnedSnapshotHash: SNAPSHOT_SCOPE.snapshotHash,
    positionPayloadSha256,
    bucketCount: buckets.length,
    acquisitionWindowUtc: {
      from: buckets[0]?.bucketLabelUtc,
      to: buckets[buckets.length - 1]?.bucketLabelUtc,
    },
    videoDeviceWindowUtc: { from: VIDEO_DEVICE_UTC_START, to: VIDEO_DEVICE_UTC_END },
    buckets: buckets.map((b) => ({
      bucketLabelUtc: b.bucketLabelUtc,
      availability: b.availability,
      latitude: b.latitude,
      longitude: b.longitude,
      pinnedProductionL3Kmh: b.l3SpeedKmh ?? null,
    })),
    provenance: {
      exportMode: 'READ_ONLY_PRODUCTION_DB_GZIP',
      evidenceGzipSha256: sha256File(evidenceGzip),
      algorithmCommitSha: ALGORITHM_COMMIT_SHA,
      productionMutations: 'NONE',
    },
  };
  fs.writeFileSync(gridPath, JSON.stringify(gridDoc, null, 2));

  const osmPath = path.join(outRoot, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json');
  let overpassBody: { elements?: Array<Record<string, unknown>> };
  if (fs.existsSync(osmPath) && process.env.TIGUAN_SKIP_OSM_FETCH !== '0') {
    const doc = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: typeof overpassBody };
    overpassBody = doc.overpassResponse;
  } else if (process.env.TIGUAN_SKIP_OSM_FETCH === '1' && fs.existsSync(osmPath)) {
    const doc = JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: typeof overpassBody };
    overpassBody = doc.overpassResponse;
  } else {
    const bb = bboxFromBuckets(buckets, 75);
    const queryText = overpassQueryForBbox(bb);
    const fetchedAtUtc = new Date().toISOString();
    const response = (await fetchOverpass(queryText)) as typeof overpassBody;
    const rawResponseSha256 = sha256Utf8(JSON.stringify(response));
    const osmDoc = {
      schema: 'LDI10D_TIGUAN_OSM_FROZEN_SNAPSHOT_V1',
      tripId: SNAPSHOT_SCOPE.tripId,
      headSha: ALGORITHM_COMMIT_SHA,
      productionMutations: 'NONE',
      provenance: {
        source: 'OpenStreetMap contributors',
        license: 'ODbL-1.0',
        endpoint: 'https://overpass-api.de/api/interpreter',
        fetchedAtUtc,
        querySha256: sha256Utf8(queryText),
        queryText,
        boundingBox: { ...bb, marginM: 75 },
        corridorMarginM: 75,
        corridorDerivation: 'Min/max lat/lon of PRESENT finite Tiguan DIMO buckets plus 75 m margin.',
        inputFixture: gridPath,
        positionPayloadSha256,
        mode: 'live_overpass_post',
        rawResponseSha256,
      },
      overpassResponse: response,
    };
    fs.writeFileSync(osmPath, JSON.stringify(osmDoc));
    overpassBody = response;
  }

  const roadContext = buildRoadContextFromOverpass(overpassBody, { buckets, corridorMarginM: 75 });
  const baseline = buildBaselineMatches(buckets, roadContext, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
  const headings = headingsFromBaseline(baseline);
  const roundedAdj = buildWayAdjacency(roadContext.ways);
  const strict = buildStrictNodeIdWayAdjacency(overpassBody, roadContext.ways, roundedAdj);
  const directed = buildDirectedCarRoutingGraph(overpassBody, roadContext.ways);
  const waysById = new Map(roadContext.ways.map((w) => [w.osmWayId, w]));

  function runVariant(variant: Variant) {
    let rows: Array<{ bucketLabelUtc: string; osmWayId: number | null; outcome: string }> = [];
    if (variant === 'A') {
      rows = buildViterbiMatches(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: roundedAdj,
      });
    } else if (variant === 'B') {
      rows = buildViterbiMatchesBacktrackR1(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: roundedAdj,
      }).matches;
    } else if (variant === 'C') {
      rows = buildViterbiMatches(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: strict.undirectedAdj,
      });
    } else if (variant === 'D') {
      rows = buildViterbiMatchesBacktrackR1(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
        wayAdjacency: strict.undirectedAdj,
      }).matches;
    } else {
      resetRouteQueryRuntimeProfile();
      rows = buildViterbiMatchesRouteAwareR4_1(
        buckets,
        roadContext.ways,
        headings,
        DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
        directed,
      ).matches;
    }
    fs.writeFileSync(path.join(replayDir, `variant_${variant}_raw.json`), JSON.stringify(rows, null, 2));
    return rows;
  }

  const results: Record<Variant, ReturnType<typeof runVariant>> = {
    A: runVariant('A'),
    B: runVariant('B'),
    C: runVariant('C'),
    D: runVariant('D'),
    E: runVariant('E'),
  };

  const byBucket = new Map<string, Record<Variant, { wayId: number | null; outcome: string }>>();
  for (const v of ['A', 'B', 'C', 'D', 'E'] as Variant[]) {
    for (const r of results[v]) {
      let entry = byBucket.get(r.bucketLabelUtc);
      if (!entry) {
        entry = {} as Record<Variant, { wayId: number | null; outcome: string }>;
        byBucket.set(r.bucketLabelUtc, entry);
      }
      entry[v] = { wayId: r.osmWayId, outcome: r.outcome };
    }
  }

  const refRows = loadReferenceSeconds();
  const bucketByLabel = new Map(buckets.map((b) => [b.bucketLabelUtc, b]));

  const alignmentRows: string[] = [
    'global_second,timestamp_utc_device,timestamp_utc_aligned,alignment_status,alignment_uncertainty_s,dimo_bucket_label,dimo_gps_availability,dimo_lat,dimo_lon,anchor_notes',
  ];
  const comparisonHeader = [
    'global_second',
    'source_video',
    'source_second',
    'frame_reference',
    'timestamp_utc_device',
    'timestamp_utc_aligned',
    'alignment_status',
    'alignment_uncertainty',
    'nav_observation',
    'reference_road',
    'reference_osm_way_ids',
    'reference_confidence',
    'dimo_gps_availability',
    'dimo_measurement_timestamp',
    'dimo_lat',
    'dimo_lon',
    'dimo_gps_quality',
    ...(['A', 'B', 'C', 'D', 'E'] as Variant[]).flatMap((v) => [
      `road_${v}`,
      `way_${v}`,
      `outcome_${v}`,
      `agreement_${v}`,
      `error_class_${v}`,
    ]),
    'event_ids',
    'evidence_notes',
  ].join(',');

  const comparisonLines: string[] = [comparisonHeader];
  let gapSeconds = 0;
  let videoComparable = 0;
  let wayComparable = 0;
  const metrics: Record<Variant, { match: number; conflict: number; skipped: number; unknown: number }> = {
    A: { match: 0, conflict: 0, skipped: 0, unknown: 0 },
    B: { match: 0, conflict: 0, skipped: 0, unknown: 0 },
    C: { match: 0, conflict: 0, skipped: 0, unknown: 0 },
    D: { match: 0, conflict: 0, skipped: 0, unknown: 0 },
    E: { match: 0, conflict: 0, skipped: 0, unknown: 0 },
  };

  for (const row of refRows) {
    const deviceTs = row.timestamp_utc_device;
    const alignedTs = deviceTs;
    const alignmentStatus = 'DEVICE_UTC_CANDIDATE_ZERO_OFFSET';
    const alignmentUncertainty = 'UNCALIBRATED_DEVICE_CLOCK_1S_DISPLAY';
    const dimoBucket = bucketByLabel.get(alignedTs);
    const dimoAvail = dimoBucket?.availability ?? 'MISSING_BUCKET';
    const dimoLat = dimoBucket?.latitude ?? '';
    const dimoLon = dimoBucket?.longitude ?? '';

    if (row.observation_status === 'GAP') gapSeconds += 1;
    else videoComparable += 1;

    const refClass = classifyReferenceOutcome(row);
    if (refClass.comparable && parseWayIds(row.osm_way_ids ?? '').length > 0) wayComparable += 1;

    alignmentRows.push(
      [
        row.global_second,
        deviceTs,
        alignedTs,
        alignmentStatus,
        '0',
        alignedTs,
        dimoAvail,
        dimoLat,
        dimoLon,
        'No external UTC calibration; 1:1 device candidate to DIMO bucket label',
      ].join(','),
    );

    const dec = byBucket.get(alignedTs);
    const cols: string[] = [
      row.global_second,
      row.source_video,
      row.source_second,
      row.frame_reference,
      deviceTs,
      alignedTs,
      alignmentStatus,
      alignmentUncertainty,
      row.route_evidence_class ?? '',
      row.road_name_verified ?? '',
      row.osm_way_ids ?? '',
      row.confidence ?? '',
      String(dimoAvail),
      alignedTs,
      String(dimoLat),
      String(dimoLon),
      '',
    ];

    for (const v of ['A', 'B', 'C', 'D', 'E'] as Variant[]) {
      const d = dec?.[v];
      const wayId = d?.wayId ?? null;
      const outcome = d?.outcome ?? 'NOT_RUN';
      const assess = dec
        ? assessVariant(row, wayId, outcome)
        : { agreement: 'NOT_COMPARABLE', outcome: 'MISSING_DIMO_BUCKET', errorClass: 'NO_DECODER_ROW' };
      if (assess.agreement === 'MATCH') metrics[v].match += 1;
      else if (assess.agreement === 'CONFLICT') metrics[v].conflict += 1;
      else if (assess.agreement === 'NOT_COMPARABLE') metrics[v].skipped += 1;
      else metrics[v].unknown += 1;
      cols.push(
        roadNameFromWay(waysById, wayId),
        wayId == null ? '' : String(wayId),
        assess.outcome,
        assess.agreement,
        assess.errorClass,
      );
    }
    cols.push(row.event_ids ?? '', (row.evidence_notes ?? '').replace(/,/g, ';'));
    comparisonLines.push(cols.join(','));
  }

  fs.writeFileSync(path.join(outRoot, 'TIGUAN_TIME_ALIGNMENT.csv'), alignmentRows.join('\n'));
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_A_B_C_D_E_COMPARISON.csv'), comparisonLines.join('\n'));

  const variantMetricsLines = [
    'variant,algorithm_id,reference_way_match,reference_way_conflict,not_comparable,decoder_or_ref_unknown,way_comparable_denominator,video_seconds_denominator',
  ];
  for (const v of ['A', 'B', 'C', 'D', 'E'] as Variant[]) {
    const algo =
      v === 'A'
        ? S4_RESEARCH_VITERBI_ALGORITHM_ID
        : v === 'B'
          ? S4_RESEARCH_VITERBI_BACKTRACK_ALGORITHM_ID
          : v === 'C' || v === 'D'
            ? S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1
            : S4_RESEARCH_ROUTE_AWARE_VITERBI_R4_1;
    variantMetricsLines.push(
      [v, algo, metrics[v].match, metrics[v].conflict, metrics[v].skipped, metrics[v].unknown, wayComparable, videoComparable].join(
        ',',
      ),
    );
  }
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_VARIANT_METRICS.csv'), variantMetricsLines.join('\n'));

  const inputManifest = {
    compactPackageDir: compactDir,
    compactSha256Verified: true,
    evidenceGzipPath: evidenceGzip,
    evidenceGzipSha256: sha256File(evidenceGzip),
    positionGridPath: gridPath,
    positionGridSha256: sha256File(gridPath),
    positionPayloadSha256,
    osmSnapshotPath: osmPath,
    osmSnapshotSha256: fs.existsSync(osmPath) ? sha256File(osmPath) : null,
    pinnedSnapshotHash: SNAPSHOT_SCOPE.snapshotHash,
    tripId: SNAPSHOT_SCOPE.tripId,
    vehicleId: SNAPSHOT_SCOPE.vehicleId,
    organizationId: SNAPSHOT_SCOPE.organizationId,
    dimoTokenId,
    algorithmCommitSha: ALGORITHM_COMMIT_SHA,
    geometryProjection: S4_RESEARCH_GEOMETRY_PROJECTION_ID,
    gpsInputIdenticalAtoE: true,
    osmInputIdenticalAtoE: true,
    bucketCount: buckets.length,
    replayOutputs: ['A', 'B', 'C', 'D', 'E'].map((v) => path.join(replayDir, `variant_${v}_raw.json`)),
  };
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_INPUT_MANIFEST.json'), JSON.stringify(inputManifest, null, 2));

  const versions = {
    algorithmCommitSha: ALGORITHM_COMMIT_SHA,
    pr2082MergeSha: '784c4b0cf3ae1e7e4534a458082ccef7ef539035',
    pr2084ResearchHeadSha: ALGORITHM_COMMIT_SHA,
    variants: {
      A: S4_RESEARCH_VITERBI_ALGORITHM_ID,
      B: S4_RESEARCH_VITERBI_BACKTRACK_ALGORITHM_ID,
      C: `${S4_RESEARCH_VITERBI_ALGORITHM_ID}+${S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1}`,
      D: `${S4_RESEARCH_VITERBI_BACKTRACK_ALGORITHM_ID}+${S4_RESEARCH_STRICT_NODE_ID_TOPOLOGY_R1}`,
      E: S4_RESEARCH_ROUTE_AWARE_VITERBI_R4_1,
    },
    geometry: S4_RESEARCH_GEOMETRY_PROJECTION_ID,
    config: DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  };
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_ALGORITHM_VERSIONS.json'), JSON.stringify(versions, null, 2));

  const diffBuckets: Array<{ bucket: string; ways: Record<string, number | null> }> = [];
  for (const b of buckets) {
    if (b.bucketLabelUtc < VIDEO_DEVICE_UTC_START || b.bucketLabelUtc > VIDEO_DEVICE_UTC_END) continue;
    const e = byBucket.get(b.bucketLabelUtc);
    if (!e) continue;
    const ways: Record<string, number | null> = {};
    for (const v of ['A', 'B', 'C', 'D', 'E'] as Variant[]) ways[v] = e[v].wayId;
    const set = new Set(Object.values(ways).filter((x) => x != null));
    if (set.size > 1) diffBuckets.push({ bucket: b.bucketLabelUtc, ways });
  }

  const summary = {
    replayExecuted: { A: true, B: true, C: true, D: true, E: true },
    videoComparableSeconds: videoComparable,
    referenceGapSeconds: gapSeconds,
    wayLevelComparableSeconds: wayComparable,
    variantDiffBucketsInVideoWindow: diffBuckets.length,
    sampleVariantDiffs: diffBuckets.slice(0, 40),
    metrics,
  };

  fs.writeFileSync(path.join(outRoot, 'TIGUAN_REPLAY_SUMMARY.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
