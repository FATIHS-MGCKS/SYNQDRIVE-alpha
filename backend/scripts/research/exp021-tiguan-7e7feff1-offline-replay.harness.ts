/**
 * EXP021 — Trip 7e7feff1 evening offline S4 replay (read-only inputs, no production writes).
 *
 * cd backend && npx ts-node --transpile-only scripts/research/exp021-tiguan-7e7feff1-offline-replay.harness.ts
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  buildDirectedCarRoutingGraph,
  buildRoadContextFromOverpass,
  buildStrictNodeIdWayAdjacency,
  buildViterbiMatchesBacktrackR1,
  buildViterbiMatchesRouteAwareR4_1,
  resetRouteQueryRuntimeProfile,
  type ResearchGpsBucket,
  type ResearchOsmWay,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research';
import { buildBaselineMatches } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/baseline-matching';
import {
  buildViterbiMatches,
  headingsFromBaseline,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching';
import { buildViterbiMatchesDirectionAwareEmissionP1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/viterbi-matching-direction-aware-p1';
import { buildWayAdjacency, nearestWayCandidates } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4-research/osm-parse';
import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';

const PRODUCTION_SHA = 'aeb7234fbb76b4a80a3238e5860c6a140862a735';
const TRIP_ID = '7e7feff1-4203-4b8e-8fca-95b55a3f6f6a';
const VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

const repoRoot = path.resolve(__dirname, '../../..');
const waypointsCsv =
  process.env.TIGUAN_WAYPOINTS_CSV ?? '/opt/cursor/artifacts/tiguan_waypoints_raw.csv';
const routeV2Geo =
  process.env.TIGUAN_ROUTE_V2_GEOJSON ?? '/opt/cursor/artifacts/tiguan_matched_geometry.json';
const routeV2Diag =
  process.env.TIGUAN_ROUTE_V2_DIAG ?? '/opt/cursor/artifacts/tiguan_route_diagnostics.json';
const outRoot =
  process.env.TIGUAN_RESEARCH_OUT ??
  path.join(repoRoot, 'architecture/drivingintelligence/evidence/exp021-tiguan-7e7feff1-20261019');

function sha256Utf8(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
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

function pgTsToIsoUtc(ts: string): string {
  const t = ts.trim().replace(' ', 'T');
  return t.includes('Z') || t.includes('+') ? t : `${t}Z`;
}

function marginDegrees(lat: number, marginM: number): { dLat: number; dLon: number } {
  const dLat = marginM / 111_320;
  const dLon = marginM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { dLat, dLon };
}

function bboxFromBuckets(buckets: ResearchGpsBucket[], marginM: number) {
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
  const mid = (minLat + maxLat) / 2;
  const { dLat, dLon } = marginDegrees(mid, marginM);
  return { south: minLat - dLat, north: maxLat + dLat, west: minLon - dLon, east: maxLon + dLon };
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
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SynqDrive-EXP021-Tiguan-Offline-Replay/1.0',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.ok) return await res.json();
    if ([429, 502, 503].includes(res.status)) {
      await new Promise((r) => setTimeout(r, attempt * 6000));
      continue;
    }
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  throw new Error('Overpass failed');
}

function loadWaypoints(): Array<{
  recordedAtIso: string;
  lat: number;
  lon: number;
  speedKmh: number | null;
  heading: number | null;
}> {
  const raw = fs.readFileSync(waypointsCsv, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.trim().split('\n');
  const header = parseCsvLine(lines[0]);
  const idx = (n: string) => header.indexOf(n);
  const rows: ReturnType<typeof loadWaypoints> = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]);
    const speedRaw = c[idx('speed_kmh')];
    rows.push({
      recordedAtIso: pgTsToIsoUtc(c[idx('recorded_at')]),
      lat: Number(c[idx('latitude')]),
      lon: Number(c[idx('longitude')]),
      speedKmh: speedRaw === '' ? null : Number(speedRaw),
      heading: c[idx('heading')] === '' ? null : Number(c[idx('heading')]),
    });
  }
  return rows;
}

function toBuckets(wps: ReturnType<typeof loadWaypoints>): ResearchGpsBucket[] {
  return wps.map((w) => ({
    bucketLabelUtc: w.recordedAtIso,
    sourceTimestampUtc: w.recordedAtIso,
    availability: 'PRESENT',
    latitude: w.lat,
    longitude: w.lon,
    l3SpeedKmh: w.speedKmh,
    motionState: w.speedKmh != null && w.speedKmh <= 1 ? 'STOPPED' : w.speedKmh != null && w.speedKmh < 8 ? 'CREEP' : 'MOVING',
  }));
}

function wayLabel(waysById: Map<number, ResearchOsmWay>, wayId: number | null): string {
  if (wayId == null) return 'UNKNOWN';
  const w = waysById.get(wayId);
  const name = w?.tags?.name ?? w?.tags?.['name:de'] ?? '';
  return name || 'UNKNOWN';
}

function wayCentroid(w: ResearchOsmWay): { lat: number; lon: number } {
  const n = w.nodes;
  if (!n.length) return { lat: 0, lon: 0 };
  let lat = 0;
  let lon = 0;
  for (const p of n) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / n.length, lon: lon / n.length };
}

function gpsPathDistanceM(wps: ReturnType<typeof loadWaypoints>): number {
  let d = 0;
  for (let i = 1; i < wps.length; i++) {
    d += haversineMeters(wps[i - 1].lat, wps[i - 1].lon, wps[i].lat, wps[i].lon);
  }
  return d;
}

function detectStops(wps: ReturnType<typeof loadWaypoints>) {
  const stops: Array<{ start: string; end: string; durationS: number; lat: number; lon: number }> = [];
  let i = 0;
  while (i < wps.length) {
    const w = wps[i];
    const stopped =
      (w.speedKmh != null && w.speedKmh <= 1) ||
      (i > 0 && haversineMeters(wps[i - 1].lat, wps[i - 1].lon, w.lat, w.lon) < 4);
    if (!stopped) {
      i++;
      continue;
    }
    const start = w.recordedAtIso;
    let j = i + 1;
    while (j < wps.length) {
      const wj = wps[j];
      const still =
        (wj.speedKmh != null && wj.speedKmh <= 1) ||
        haversineMeters(wps[j - 1].lat, wps[j - 1].lon, wj.lat, wj.lon) < 4;
      if (!still) break;
      j++;
    }
    const endWp = wps[j - 1];
    const t0 = Date.parse(start);
    const t1 = Date.parse(endWp.recordedAtIso);
    stops.push({
      start,
      end: endWp.recordedAtIso,
      durationS: Math.max(0, Math.round((t1 - t0) / 1000)),
      lat: w.lat,
      lon: w.lon,
    });
    i = j;
  }
  return stops;
}

function roadSegmentsFromMatches(
  matches: Array<{ bucketLabelUtc: string; osmWayId: number | null; outcome: string }>,
  waysById: Map<number, ResearchOsmWay>,
) {
  const segs: Array<{
    fromUtc: string;
    toUtc: string;
    osmWayId: number | '';
    roadName: string;
    outcome: string;
  }> = [];
  let curWay: number | null = null;
  let segStart = matches[0]?.bucketLabelUtc ?? '';
  for (const m of matches) {
    if (m.osmWayId !== curWay) {
      if (curWay != null || m.osmWayId != null) {
        segs.push({
          fromUtc: segStart,
          toUtc: m.bucketLabelUtc,
          osmWayId: curWay ?? '',
          roadName: wayLabel(waysById, curWay),
          outcome: m.outcome,
        });
      }
      curWay = m.osmWayId;
      segStart = m.bucketLabelUtc;
    }
  }
  const last = matches[matches.length - 1];
  if (last) {
    segs.push({
      fromUtc: segStart,
      toUtc: last.bucketLabelUtc,
      osmWayId: curWay ?? '',
      roadName: wayLabel(waysById, curWay),
      outcome: last.outcome,
    });
  }
  return segs;
}

function countDecoderDiffs(
  a: Array<{ bucketLabelUtc: string; osmWayId: number | null }>,
  b: Array<{ bucketLabelUtc: string; osmWayId: number | null }>,
): number {
  const bm = new Map(b.map((x) => [x.bucketLabelUtc, x.osmWayId]));
  let n = 0;
  for (const row of a) {
    if (bm.get(row.bucketLabelUtc) !== row.osmWayId) n++;
  }
  return n;
}

async function main(): Promise<void> {
  fs.mkdirSync(outRoot, { recursive: true });
  fs.mkdirSync(path.join(outRoot, 'replay'), { recursive: true });

  const wps = loadWaypoints();
  const buckets = toBuckets(wps);
  const manifest = {
    schema: 'EXP021_TIGUAN_7E7FEFF1_INPUT_MANIFEST_V1',
    productionSha: PRODUCTION_SHA,
    tripId: TRIP_ID,
    vehicleId: VEHICLE_ID,
    organizationId: ORG_ID,
    gpsObservationCount: wps.length,
    acquisitionWindowUtc: { from: wps[0]?.recordedAtIso, to: wps[wps.length - 1]?.recordedAtIso },
    s4EvidenceSnapshotsOnProduction: 0,
    inputProvenance: {
      waypointsCsv,
      waypointsSha256: sha256Utf8(fs.readFileSync(waypointsCsv, 'utf8')),
      routeV2Geo,
      routeV2Diag,
      note: 'One ResearchGpsBucket per DIMO waypoint (irregular ~7s cadence). No per-second grid; no invented channels.',
    },
    productionMutations: 'NONE',
  };
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_INPUT_MANIFEST.json'), JSON.stringify(manifest, null, 2));

  const osmPath = path.join(outRoot, 'TIGUAN_OSM_FROZEN_SNAPSHOT.json');
  const bb = bboxFromBuckets(buckets, 120);
  const queryText = overpassQueryForBbox(bb);
  let overpassBody: { elements?: Array<Record<string, unknown>> };
  if (process.env.TIGUAN_SKIP_OSM_FETCH === '1' && fs.existsSync(osmPath)) {
    overpassBody = (JSON.parse(fs.readFileSync(osmPath, 'utf8')) as { overpassResponse: typeof overpassBody })
      .overpassResponse;
  } else {
    const response = (await fetchOverpass(queryText)) as typeof overpassBody;
    fs.writeFileSync(
      osmPath,
      JSON.stringify(
        {
          schema: 'EXP021_TIGUAN_7E7FEFF1_OSM_V1',
          tripId: TRIP_ID,
          fetchedAtUtc: new Date().toISOString(),
          boundingBox: { ...bb, marginM: 120 },
          querySha256: sha256Utf8(queryText),
          overpassResponse: response,
          productionMutations: 'NONE',
        },
        null,
        2,
      ),
    );
    overpassBody = response;
  }

  const roadContext = buildRoadContextFromOverpass(overpassBody, { buckets, corridorMarginM: 120 });
  const waysById = new Map(roadContext.ways.map((w) => [w.osmWayId, w]));
  const baseline = buildBaselineMatches(buckets, roadContext, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG);
  const headings = headingsFromBaseline(baseline);
  const roundedAdj = buildWayAdjacency(roadContext.ways);
  const strict = buildStrictNodeIdWayAdjacency(overpassBody, roadContext.ways, roundedAdj);
  const directed = buildDirectedCarRoutingGraph(overpassBody, roadContext.ways);

  const forwardV2 = buildViterbiMatches(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
    wayAdjacency: roundedAdj,
  });
  const backtrack = buildViterbiMatchesBacktrackR1(
    buckets,
    roadContext.ways,
    headings,
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    { wayAdjacency: roundedAdj },
  ).matches;
  const strictFwd = buildViterbiMatches(buckets, roadContext.ways, headings, DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG, {
    wayAdjacency: strict.undirectedAdj,
  });
  const strictBt = buildViterbiMatchesBacktrackR1(
    buckets,
    roadContext.ways,
    headings,
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    { wayAdjacency: strict.undirectedAdj },
  ).matches;
  resetRouteQueryRuntimeProfile();
  const routeAware = buildViterbiMatchesRouteAwareR4_1(
    buckets,
    roadContext.ways,
    headings,
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    directed,
  ).matches;
  const p1 = buildViterbiMatchesDirectionAwareEmissionP1(
    buckets,
    roadContext.ways,
    headings,
    DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
    { wayAdjacency: roundedAdj },
  );

  const replayDir = path.join(outRoot, 'replay');
  fs.writeFileSync(path.join(replayDir, 'forward_v2.json'), JSON.stringify(forwardV2, null, 2));
  fs.writeFileSync(path.join(replayDir, 'backtrack_r1.json'), JSON.stringify(backtrack, null, 2));
  fs.writeFileSync(path.join(replayDir, 'strict_node_fwd.json'), JSON.stringify(strictFwd, null, 2));
  fs.writeFileSync(path.join(replayDir, 'strict_node_backtrack.json'), JSON.stringify(strictBt, null, 2));
  fs.writeFileSync(path.join(replayDir, 'route_aware_r41.json'), JSON.stringify(routeAware, null, 2));
  fs.writeFileSync(path.join(replayDir, 'direction_aware_p1.json'), JSON.stringify(p1, null, 2));

  const routeV2Coords = JSON.parse(fs.readFileSync(routeV2Geo, 'utf8')) as number[][];
  const routeDiag = JSON.parse(fs.readFileSync(routeV2Diag, 'utf8')) as {
    r3?: { persistedMatchResult?: { confidence?: number; totalDistance?: number; matchingStatus?: string } };
  };

  const gaps: Array<{ afterUtc: string; beforeUtc: string; gapS: number }> = [];
  for (let i = 1; i < wps.length; i++) {
    const gapS = (Date.parse(wps[i].recordedAtIso) - Date.parse(wps[i - 1].recordedAtIso)) / 1000;
    if (gapS > 10) gaps.push({ afterUtc: wps[i - 1].recordedAtIso, beforeUtc: wps[i].recordedAtIso, gapS });
  }

  const stops = detectStops(wps);
  const speedPeak = wps.reduce(
    (best, w) => (w.speedKmh != null && (best == null || w.speedKmh > best.speedKmh) ? w : best),
    null as (typeof wps)[0] | null,
  );

  const timelineHeader =
    'utc,lat,lon,speed_kmh_observed,heading_deg,forward_v2_way,forward_v2_road,backtrack_way,route_r41_way,p1_way,forward_outcome,evidence_class\n';
  const timelineLines: string[] = [timelineHeader];
  const btMap = new Map(backtrack.map((r) => [r.bucketLabelUtc, r]));
  const r41Map = new Map(routeAware.map((r) => [r.bucketLabelUtc, r]));
  const p1Map = new Map(p1.map((r) => [r.bucketLabelUtc, r]));
  for (let i = 0; i < wps.length; i++) {
    const w = wps[i];
    const iso = w.recordedAtIso;
    const fv = forwardV2[i];
    const bt = btMap.get(iso);
    const r41 = r41Map.get(iso);
    const p1r = p1Map.get(iso);
    timelineLines.push(
      [
        iso,
        w.lat,
        w.lon,
        w.speedKmh ?? '',
        w.heading ?? '',
        fv?.osmWayId ?? '',
        wayLabel(waysById, fv?.osmWayId ?? null),
        bt?.osmWayId ?? '',
        r41?.osmWayId ?? '',
        p1r?.osmWayId ?? '',
        fv?.outcome ?? '',
        'OBSERVED_GPS',
      ].join(','),
    );
  }
  const timelinePath = path.join(outRoot, 'TIGUAN_7e7feff1_TIMELINE.csv');
  fs.writeFileSync(timelinePath, timelineLines.join('\n'));

  const roadSegs = roadSegmentsFromMatches(forwardV2, waysById);
  const segCsv = [
    'from_utc,to_utc,osm_way_id,road_name,identification_basis,uncertainty',
    ...roadSegs.map((s) =>
      [s.fromUtc, s.toUtc, s.osmWayId, `"${s.roadName.replace(/"/g, '""')}"`, 'S4_FORWARD_V2_OFFLINE', s.roadName === 'UNKNOWN' ? 'NO_OSM_NAME' : 'OSM_TAG'].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_7e7feff1_ROAD_SEGMENTS.csv'), segCsv);

  const algoCompare = {
    bucketCount: buckets.length,
    osmWayCount: roadContext.ways.length,
    forwardVsBacktrackDiffBuckets: countDecoderDiffs(forwardV2, backtrack),
    forwardVsStrictDiffBuckets: countDecoderDiffs(forwardV2, strictFwd),
    forwardVsRouteAwareDiffBuckets: countDecoderDiffs(forwardV2, routeAware),
    forwardVsP1DiffBuckets: countDecoderDiffs(forwardV2, p1),
    routeAwareVsP1DiffBuckets: countDecoderDiffs(routeAware, p1),
    forwardUnknownBuckets: forwardV2.filter((r) => r.outcome !== 'ASSOCIATED' && r.osmWayId == null).length,
    routeAwareUnknownBuckets: routeAware.filter((r) => r.osmWayId == null).length,
  };
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_ALGORITHM_COMPARISON.json'), JSON.stringify(algoCompare, null, 2));

  const fwdLine: number[][] = [];
  for (const m of forwardV2) {
    if (m.osmWayId == null) continue;
    const w = waysById.get(m.osmWayId);
    if (!w) continue;
    const c = wayCentroid(w);
    fwdLine.push([c.lon, c.lat]);
  }
  const r41Line: number[][] = [];
  for (const m of routeAware) {
    if (m.osmWayId == null) continue;
    const w = waysById.get(m.osmWayId);
    if (!w) continue;
    const c = wayCentroid(w);
    r41Line.push([c.lon, c.lat]);
  }

  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { layer: 'gps_observed', tripId: TRIP_ID, pointCount: wps.length },
        geometry: {
          type: 'LineString',
          coordinates: wps.map((w) => [w.lon, w.lat]),
        },
      },
      {
        type: 'Feature',
        properties: {
          layer: 'route_v2_mapbox',
          confidence: routeDiag?.r3?.persistedMatchResult?.confidence,
          distanceM: routeDiag?.r3?.persistedMatchResult?.totalDistance,
        },
        geometry: { type: 'LineString', coordinates: routeV2Coords },
      },
      {
        type: 'Feature',
        properties: { layer: 's4_forward_v2_offline_centroids' },
        geometry: { type: 'LineString', coordinates: fwdLine },
      },
      {
        type: 'Feature',
        properties: { layer: 's4_route_aware_r41_offline_centroids' },
        geometry: { type: 'LineString', coordinates: r41Line },
      },
      ...stops.map((s, idx) => ({
        type: 'Feature',
        properties: { layer: 'stop', index: idx, durationS: s.durationS },
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      })),
    ],
  };
  const geoPath = path.join(outRoot, 'TIGUAN_7e7feff1_ROUTE.geojson');
  fs.writeFileSync(geoPath, JSON.stringify(geojson, null, 2));

  const mapHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Tiguan 7e7feff1 Offline Replay</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body{margin:0;font-family:system-ui,sans-serif}#map{height:100vh}</style></head><body>
<div id="map"></div><script>
const geo=${JSON.stringify(geojson)};
const map=L.map('map').setView([${wps[0].lat},${wps[0].lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
function line(f,color,w,dash){const c=f.geometry.coordinates.map(p=>[p[1],p[0]]);return L.polyline(c,{color,weight:w,opacity:0.85,dashArray:dash}).addTo(map).bindPopup(f.properties.layer);}
for(const f of geo.features){if(f.geometry.type==='LineString'){const col=f.properties.layer.includes('route_v2')?'#16a34a':f.properties.layer.includes('forward')?'#7c3aed':f.properties.layer.includes('route_aware')?'#ea580c':'#2563eb';line(f,col,f.properties.layer.includes('gps')?4:3,f.properties.layer.includes('route_v2')?'6 4':null);} else if(f.properties.layer==='stop'){L.circleMarker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{radius:7,color:'#b45309',fillColor:'#fbbf24',fillOpacity:0.9}).addTo(map).bindPopup('Stop '+f.properties.durationS+'s');}}
map.fitBounds(L.geoJSON(geo).getBounds(),{padding:[30,30]});
</script></body></html>`;
  const mapPath = path.join(outRoot, 'TIGUAN_7e7feff1_ROUTE_MAP.html');
  fs.writeFileSync(mapPath, mapHtml);

  const report = `# Tiguan Trip 7e7feff1 — Offline S4 Replay

## Scope
- **Production SHA:** \`${PRODUCTION_SHA}\` (algorithms from repo checkout; not executed on production)
- **Trip:** \`${TRIP_ID}\` | **Vehicle:** \`${VEHICLE_ID}\`
- **Window:** ${wps[0]?.recordedAtIso} – ${wps[wps.length - 1]?.recordedAtIso} (145 DIMO waypoints, irregular cadence)
- **Production S4 evidence snapshots:** **0** — replay uses **waypoints + Route V2 exports** only

## Input validity
- Each waypoint → one \`ResearchGpsBucket\` with \`l3SpeedKmh\` from DIMO when present.
- **No** S4 POSITION/L3 channel reconstruction; **no** per-second synthetic measurements.
- Comparisons between decoders are **relative** (no independent video/OSM ground-truth for this evening trip).

## Route V2 (production Mapbox)
- Status: **${routeDiag?.r3?.persistedMatchResult?.matchingStatus ?? 'unknown'}**
- Confidence: **${((routeDiag?.r3?.persistedMatchResult?.confidence ?? 0) * 100).toFixed(1)}%**
- Matched distance: **${((routeDiag?.r3?.persistedMatchResult?.totalDistance ?? 0) / 1000).toFixed(2)} km**
- Geometry: external matched polyline (not OSM way IDs)

## Offline S4 research decoders (isolated)
| Decoder | Buckets with OSM way | UNKNOWN / null way |
|---------|---------------------|-------------------|
| Forward V2 (rounded adj) | ${forwardV2.filter((r) => r.osmWayId != null).length} | ${forwardV2.filter((r) => r.osmWayId == null).length} |
| Backtrack R1 | ${backtrack.filter((r) => r.osmWayId != null).length} | ${backtrack.filter((r) => r.osmWayId == null).length} |
| Strict node-ID fwd | ${strictFwd.filter((r) => r.osmWayId != null).length} | ${strictFwd.filter((r) => r.osmWayId == null).length} |
| Route-Aware R4.1 | ${routeAware.filter((r) => r.osmWayId != null).length} | ${routeAware.filter((r) => r.osmWayId == null).length} |
| Direction-Aware P1 | ${p1.filter((r) => r.osmWayId != null).length} | ${p1.filter((r) => r.osmWayId == null).length} |

### Cross-decoder disagreement (bucket-level way ID)
- Forward vs Backtrack: **${algoCompare.forwardVsBacktrackDiffBuckets}** / ${buckets.length}
- Forward vs Route-Aware R4.1: **${algoCompare.forwardVsRouteAwareDiffBuckets}** / ${buckets.length}
- Forward vs P1: **${algoCompare.forwardVsP1DiffBuckets}** / ${buckets.length}
- Route-Aware vs P1: **${algoCompare.routeAwareVsP1DiffBuckets}** / ${buckets.length}

## Stops & dynamics
- GPS path distance (Haversine sum, raw waypoints): **${(gpsPathDistanceM(wps) / 1000).toFixed(2)} km**
- Canonical trip \`distance_km\`: **10.0**
- Detected stop clusters: **${stops.length}** (see GeoJSON \`stop\` points)
- GPS inter-sample gaps >10s: **${gaps.length}** ${gaps.length ? `(max ${Math.max(...gaps.map((g) => g.gapS))}s)` : ''}

## Speed discrepancy (70 km/h vs trip max 52 km/h)
| Source | Value | Timestamp / note |
|--------|-------|------------------|
| \`vehicle_trip_waypoints.speed_kmh\` | **70** | **2026-10-19T17:53:14Z** @ (51.3485533, 9.51729) |
| Next highest waypoint | 69 | 2026-10-19T17:52:25Z |
| \`vehicle_trips.max_speed_kmh\` | **52** | Trip aggregate field (production read-only query) |
| \`vehicle_trips.avg_speed_kmh\` | **32.5** | Trip aggregate |

**Interpretation:** The **70 km/h** value is a **single DIMO waypoint observation** on a ~7s sampling grid. The trip-level **52 km/h** maximum is a **separate canonical aggregate** (likely filtered/duration-weighted enrichment), not the raw waypoint max. **Do not treat 70 km/h as certified trip max without defining the aggregation policy.**

## Confidence & limitations
- OSM names: **UNKNOWN** when \`name\` tag missing (see road segments CSV).
- No production S4 Forward V2 shadow run — offline Forward V2 is **research replay**, not verified production output.
- Route V2 vs S4: different engines (Mapbox vs OSM Viterbi); divergence expected — **no accuracy score** claimed.

## Artifacts
- \`TIGUAN_7e7feff1_ROUTE_MAP.html\`
- \`TIGUAN_7e7feff1_ROUTE.geojson\`
- \`TIGUAN_7e7feff1_TIMELINE.csv\` (observation times only)
- \`TIGUAN_7e7feff1_ROAD_SEGMENTS.csv\`
- \`TIGUAN_ALGORITHM_COMPARISON.json\`
- \`replay/*.json\`

**PRODUCTION_MUTATIONS=NONE**
`;
  const reportPath = path.join(outRoot, 'TIGUAN_7e7feff1_OFFLINE_REPLAY_REPORT.md');
  fs.writeFileSync(reportPath, report);

  const summary = {
    TRIP_ID,
    GPS_POINTS: wps.length,
    ROUTE_V2_RESULT: `${(routeDiag?.r3 as { matchingStatus?: string })?.matchingStatus ?? routeDiag?.r3?.persistedMatchResult?.matchingStatus ?? 'UNKNOWN'} conf=${routeDiag?.r3?.persistedMatchResult?.confidence ?? 'n/a'}`,
    S4_FORWARD_V2_RESULT: `ASSOCIATED=${forwardV2.filter((r) => r.osmWayId != null).length} UNKNOWN=${forwardV2.filter((r) => r.osmWayId == null).length}`,
    S4_DIRECTION_AWARE_P1_RESULT: `ASSOCIATED=${p1.filter((r) => r.osmWayId != null).length} diff_vs_forward=${algoCompare.forwardVsP1DiffBuckets}`,
    S4_ROUTE_AWARE_R41_RESULT: `ASSOCIATED=${routeAware.filter((r) => r.osmWayId != null).length} diff_vs_forward=${algoCompare.forwardVsRouteAwareDiffBuckets}`,
    ROADS_IDENTIFIED: `${new Set(forwardV2.map((r) => r.osmWayId).filter(Boolean)).size} unique OSM ways (Forward V2 offline); named segments in CSV`,
    TOTAL_DISTANCE_KM: `${(gpsPathDistanceM(wps) / 1000).toFixed(2)} GPS raw; 10.0 trip; ${((routeDiag?.r3?.persistedMatchResult?.totalDistance ?? 0) / 1000).toFixed(2)} Route V2`,
    STOPS_DETECTED: stops.length,
    SPEED_DISCREPANCY: 'WAYPOINT_70_AT_2026-10-19T17:53:14Z vs TRIP_MAX_52_AGGREGATE',
    UNRESOLVED_GPS_GAPS: gaps.length,
    MAP_FILE: mapPath,
    GEOJSON_FILE: geoPath,
    REPORT_FILE: reportPath,
    PRODUCTION_MUTATIONS: 'NONE',
    FINAL_VERDICT: 'OFFLINE_REPLAY_COMPLETE_NO_PRODUCTION_S4_EVIDENCE',
  };
  fs.writeFileSync(path.join(outRoot, 'TIGUAN_REPLAY_SUMMARY.json'), JSON.stringify(summary, null, 2));

  // Mirror to artifacts for delivery
  const mirror = '/opt/cursor/artifacts/exp021-tiguan-7e7feff1-replay';
  fs.mkdirSync(mirror, { recursive: true });
  for (const f of [
    'TIGUAN_7e7feff1_ROUTE_MAP.html',
    'TIGUAN_7e7feff1_ROUTE.geojson',
    'TIGUAN_7e7feff1_TIMELINE.csv',
    'TIGUAN_7e7feff1_ROAD_SEGMENTS.csv',
    'TIGUAN_7e7feff1_OFFLINE_REPLAY_REPORT.md',
    'TIGUAN_ALGORITHM_COMPARISON.json',
    'TIGUAN_REPLAY_SUMMARY.json',
    'TIGUAN_INPUT_MANIFEST.json',
  ]) {
    fs.copyFileSync(path.join(outRoot, f), path.join(mirror, f));
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
