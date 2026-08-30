#!/usr/bin/env ts-node
/**
 * Phase C calibration gate — read-only resolver evaluation against live OSM data.
 * Usage: npm run fuel-station:calibrate
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FuelStationCandidateRepository } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-candidate.repository';
import { FuelStationLocationResolverService } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-location-resolver.service';
import {
  buildResolveDiagnostics,
  scoreFuelStationCandidates,
} from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-resolve.pipeline';
import { dedupeFuelStationCandidates } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-dedupe';
import { decideFuelStationMatch } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-match-decision';
import {
  MAX_CANDIDATES,
  PRIMARY_SEARCH_RADIUS_METERS,
} from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-location.constants';
import type { FuelStationResolveResult } from '../../src/modules/vehicle-intelligence/fuel-stations/fuel-station-location.types';

interface CalibrationStation {
  id: string;
  label: string;
  region: string;
  topology: string;
  osmType: string;
  osmId: string;
  name: string | null;
  brand: string | null;
  geometryType: string;
  latitude: number;
  longitude: number;
}

interface OffsetProbe {
  stationId: string;
  offsetMeters: number;
  latitude: number;
  longitude: number;
  offsetKind: string;
  expectedOsmKey: string;
  shouldResolve: boolean;
}

interface ProbeOutcome {
  stationId: string;
  offsetMeters: number;
  offsetKind: string;
  latitude: number;
  longitude: number;
  expectedOsmKey: string;
  shouldResolve: boolean;
  status: string;
  confidence?: string;
  score?: number;
  matchedOsmKey?: string;
  matchedName?: string;
  matchedBrand?: string;
  geometryDistanceM?: number;
  pointDistanceM?: number;
  topScore?: number;
  secondScore?: number;
  outcome: 'MATCHED_CORRECT' | 'MATCHED_WRONG' | 'AMBIGUOUS' | 'NOT_FOUND' | 'ERROR' | 'INVALID';
  physicalEquivalent?: boolean;
}

const EARTH_RADIUS_M = 6_371_000;

function offsetCoordinate(lat: number, lon: number, bearingDeg: number, distanceM: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brng = toRad(bearingDeg);
  const angDist = distanceM / EARTH_RADIUS_M;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { latitude: toDeg(lat2), longitude: toDeg(lon2) };
}

function osmKey(type: string, id: string | number | bigint): string {
  return `${type}/${String(id)}`;
}

async function assessPhysicalEquivalence(
  prisma: PrismaClient,
  expectedKey: string,
  matchedKey: string | undefined,
): Promise<boolean> {
  if (!matchedKey || expectedKey === matchedKey) return true;
  const [eType, eId] = expectedKey.split('/');
  const [mType, mId] = matchedKey.split('/');
  const rows = await prisma.$queryRaw<Array<{ same_brand: boolean; sep_m: number; covers: boolean }>>`
    SELECT
      COALESCE(e.brand, '') <> '' AND COALESCE(e.brand, '') = COALESCE(m.brand, '') AS same_brand,
      ST_Distance(e.centroid, m.centroid)::float8 AS sep_m,
      ST_Covers(e.geom, m.geom) OR ST_Covers(m.geom, e.geom) AS covers
    FROM osm.fuel_stations e
    JOIN osm.fuel_stations m
      ON e.osm_type = ${eType} AND e.osm_id = ${BigInt(eId)}
     AND m.osm_type = ${mType} AND m.osm_id = ${BigInt(mId)}
  `;
  const row = rows[0];
  if (!row) return false;
  return row.covers || (row.same_brand && row.sep_m <= 20);
}

function bucketDistance(m: number): string {
  if (m <= 20) return '0-20m';
  if (m <= 50) return '20-50m';
  if (m <= 100) return '50-100m';
  if (m <= 150) return '100-150m';
  if (m <= 250) return '150-250m';
  return '>250m';
}

async function loadCalibrationStations(prisma: PrismaClient): Promise<CalibrationStation[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      label: string;
      region: string;
      topology: string;
      osm_type: string;
      osm_id: bigint;
      name: string | null;
      brand: string | null;
      geometry_type: string;
      latitude: number;
      longitude: number;
    }>
  >`
    WITH ranked AS (
      SELECT
        fs.osm_type,
        fs.osm_id,
        fs.name,
        fs.brand,
        GeometryType(fs.geom) AS geometry_type,
        ST_Y(fs.centroid::geometry)::float8 AS latitude,
        ST_X(fs.centroid::geometry)::float8 AS longitude,
        CASE
          WHEN fs.city ILIKE '%Kassel%' OR fs.postcode LIKE '34%' THEN 'kassel'
          WHEN fs.city ILIKE '%Berlin%' OR fs.postcode LIKE '10%' OR fs.postcode LIKE '12%' THEN 'berlin'
          WHEN fs.city ILIKE '%Hamburg%' OR fs.postcode LIKE '20%' OR fs.postcode LIKE '22%' THEN 'hamburg'
          WHEN fs.city ILIKE '%München%' OR fs.city ILIKE '%Muenchen%' OR fs.postcode LIKE '80%' THEN 'munich'
          WHEN fs.city ILIKE '%Frankfurt%' OR fs.postcode LIKE '60%' THEN 'frankfurt'
          WHEN fs.tags::text ILIKE '%motorway%' OR fs.name ILIKE '%Autobahn%' OR fs.name ILIKE '%Raststätte%' OR fs.name ILIKE '%Raststaette%' THEN 'motorway'
          ELSE 'rural'
        END AS region,
        CASE
          WHEN GeometryType(fs.geom) = 'POLYGON' AND fs.name IS NOT NULL THEN 'polygon_named'
          WHEN GeometryType(fs.geom) = 'POLYGON' AND fs.brand IS NOT NULL AND fs.name IS NULL THEN 'polygon_brand_only'
          WHEN GeometryType(fs.geom) = 'POINT' AND fs.name IS NOT NULL THEN 'point_named'
          WHEN GeometryType(fs.geom) = 'POINT' AND fs.brand IS NOT NULL AND fs.name IS NULL THEN 'point_brand_only'
          WHEN fs.name IS NULL AND fs.brand IS NULL THEN 'weak_metadata'
          ELSE 'ordinary'
        END AS topology,
        ROW_NUMBER() OVER (
          PARTITION BY CASE
            WHEN fs.city ILIKE '%Kassel%' OR fs.postcode LIKE '34%' THEN 'kassel'
            WHEN fs.city ILIKE '%Berlin%' OR fs.postcode LIKE '10%' OR fs.postcode LIKE '12%' THEN 'berlin'
            WHEN fs.city ILIKE '%Hamburg%' OR fs.postcode LIKE '20%' OR fs.postcode LIKE '22%' THEN 'hamburg'
            WHEN fs.city ILIKE '%München%' OR fs.city ILIKE '%Muenchen%' OR fs.postcode LIKE '80%' THEN 'munich'
            WHEN fs.city ILIKE '%Frankfurt%' OR fs.postcode LIKE '60%' THEN 'frankfurt'
            WHEN fs.tags::text ILIKE '%motorway%' OR fs.name ILIKE '%Autobahn%' OR fs.name ILIKE '%Raststätte%' OR fs.name ILIKE '%Raststaette%' THEN 'motorway'
            ELSE 'rural'
          END,
          CASE
            WHEN GeometryType(fs.geom) = 'POLYGON' AND fs.name IS NOT NULL THEN 'polygon_named'
            WHEN GeometryType(fs.geom) = 'POLYGON' AND fs.brand IS NOT NULL AND fs.name IS NULL THEN 'polygon_brand_only'
            WHEN GeometryType(fs.geom) = 'POINT' AND fs.name IS NOT NULL THEN 'point_named'
            WHEN GeometryType(fs.geom) = 'POINT' AND fs.brand IS NOT NULL AND fs.name IS NULL THEN 'point_brand_only'
            WHEN fs.name IS NULL AND fs.brand IS NULL THEN 'weak_metadata'
            ELSE 'ordinary'
          END
          ORDER BY fs.brand NULLS LAST, fs.name NULLS LAST, fs.osm_id
        ) AS rn
      FROM osm.fuel_stations fs
    )
    SELECT
      region || '-' || topology || '-' || rn::text AS id,
      COALESCE(name, brand, 'unnamed') || ' (' || region || ')' AS label,
      region,
      topology,
      osm_type,
      osm_id,
      name,
      brand,
      geometry_type,
      latitude,
      longitude
    FROM ranked
    WHERE rn = 1
    ORDER BY region, topology
  `;

  const selected: CalibrationStation[] = rows.map((r) => ({
    id: r.id,
    label: r.label,
    region: r.region,
    topology: r.topology,
    osmType: r.osm_type,
    osmId: String(r.osm_id),
    name: r.name,
    brand: r.brand,
    geometryType: r.geometry_type,
    latitude: r.latitude,
    longitude: r.longitude,
  }));

  const adversarial = await prisma.$queryRaw<
    Array<{
      id: string;
      label: string;
      region: string;
      topology: string;
      osm_type: string;
      osm_id: bigint;
      name: string | null;
      brand: string | null;
      geometry_type: string;
      latitude: number;
      longitude: number;
    }>
  >`
    WITH pairs AS (
      SELECT
        a.osm_type AS a_type,
        a.osm_id AS a_id,
        a.name AS a_name,
        a.brand AS a_brand,
        GeometryType(a.geom) AS a_geom,
        ST_Y(a.centroid::geometry)::float8 AS a_lat,
        ST_X(a.centroid::geometry)::float8 AS a_lon,
        b.osm_type AS b_type,
        b.osm_id AS b_id,
        b.name AS b_name,
        b.brand AS b_brand,
        ST_Distance(a.centroid, b.centroid)::float8 AS sep_m
      FROM osm.fuel_stations a
      JOIN osm.fuel_stations b
        ON a.osm_id < b.osm_id
       AND ST_DWithin(a.centroid, b.centroid, 100)
      WHERE ST_Distance(a.centroid, b.centroid) BETWEEN 30 AND 55
      ORDER BY sep_m
      LIMIT 3
    )
    SELECT 'adv-close-pair-a-' || a_id::text AS id,
           COALESCE(a_name, a_brand, 'station-a') || ' close pair A' AS label,
           'adversarial' AS region,
           'dense_cluster' AS topology,
           a_type AS osm_type,
           a_id AS osm_id,
           a_name AS name,
           a_brand AS brand,
           a_geom AS geometry_type,
           a_lat AS latitude,
           a_lon AS longitude
    FROM pairs
    UNION ALL
    SELECT 'adv-close-pair-b-' || b_id::text,
           COALESCE(b_name, b_brand, 'station-b') || ' close pair B',
           'adversarial',
           'dense_cluster',
           b_type,
           b_id,
           b_name,
           b_brand,
           'POINT',
           ST_Y((SELECT centroid FROM osm.fuel_stations WHERE osm_id = b_id)::geometry)::float8,
           ST_X((SELECT centroid FROM osm.fuel_stations WHERE osm_id = b_id)::geometry)::float8
    FROM pairs
  `;

  const dedupeCases = await prisma.$queryRaw<
    Array<{
      id: string;
      label: string;
      osm_type: string;
      osm_id: bigint;
      name: string | null;
      brand: string | null;
      geometry_type: string;
      latitude: number;
      longitude: number;
    }>
  >`
    SELECT
      'dedupe-node-' || n.osm_id::text AS id,
      COALESCE(n.brand, n.name, 'node') || ' node-in-polygon' AS label,
      n.osm_type,
      n.osm_id,
      n.name,
      n.brand,
      GeometryType(n.geom) AS geometry_type,
      ST_Y(n.centroid::geometry)::float8 AS latitude,
      ST_X(n.centroid::geometry)::float8 AS longitude
    FROM osm.fuel_stations n
    JOIN osm.fuel_stations p
      ON GeometryType(p.geom) = 'POLYGON'
     AND ST_Covers(p.geom, n.geom)
     AND n.osm_id <> p.osm_id
     AND COALESCE(n.brand, '') <> '' AND COALESCE(n.brand, '') = COALESCE(p.brand, '')
    LIMIT 2
  `;

  for (const row of adversarial) {
    selected.push({
      id: row.id,
      label: row.label,
      region: row.region,
      topology: row.topology,
      osmType: row.osm_type,
      osmId: String(row.osm_id),
      name: row.name,
      brand: row.brand,
      geometryType: row.geometry_type,
      latitude: row.latitude,
      longitude: row.longitude,
    });
  }

  for (const row of dedupeCases) {
    selected.push({
      id: row.id,
      label: row.label,
      region: 'adversarial',
      topology: 'node_in_polygon',
      osmType: row.osm_type,
      osmId: String(row.osm_id),
      name: row.name,
      brand: row.brand,
      geometryType: row.geometry_type,
      latitude: row.latitude,
      longitude: row.longitude,
    });
  }

  const unique = new Map<string, CalibrationStation>();
  for (const s of selected) unique.set(s.id, s);
  return [...unique.values()].slice(0, 28);
}

async function polygonInteriorPoint(
  prisma: PrismaClient,
  osmType: string,
  osmId: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const rows = await prisma.$queryRaw<Array<{ latitude: number; longitude: number }>>`
    SELECT
      ST_Y(ST_PointOnSurface(geom)::geometry)::float8 AS latitude,
      ST_X(ST_PointOnSurface(geom)::geometry)::float8 AS longitude
    FROM osm.fuel_stations
    WHERE osm_type = ${osmType} AND osm_id = ${BigInt(osmId)}
      AND GeometryType(geom) = 'POLYGON'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function buildOffsetProbes(
  prisma: PrismaClient,
  stations: CalibrationStation[],
): Promise<OffsetProbe[]> {
  const offsets = [0, 5, 10, 20, 30, 50, 75, 100, 150, 200, 250, 300];
  const probes: OffsetProbe[] = [];

  for (const station of stations) {
    const expectedKey = osmKey(station.osmType, station.osmId);
    let anchorLat = station.latitude;
    let anchorLon = station.longitude;
    let anchorKind = 'centroid';

    if (station.geometryType === 'POLYGON') {
      const interior = await polygonInteriorPoint(prisma, station.osmType, station.osmId);
      if (interior) {
        anchorLat = interior.latitude;
        anchorLon = interior.longitude;
        anchorKind = 'polygon_interior';
      }
    }

    for (const offset of offsets) {
      const shouldResolve = offset <= 250;
      if (offset === 0) {
        probes.push({
          stationId: station.id,
          offsetMeters: 0,
          latitude: anchorLat,
          longitude: anchorLon,
          offsetKind: anchorKind,
          expectedOsmKey: expectedKey,
          shouldResolve,
        });
        continue;
      }

      const bearings = offset <= 30 ? [0, 90, 180, 270] : [0];
      for (const bearing of bearings) {
        const point = offsetCoordinate(anchorLat, anchorLon, bearing, offset);
        probes.push({
          stationId: station.id,
          offsetMeters: offset,
          latitude: point.latitude,
          longitude: point.longitude,
          offsetKind: offset <= 30 ? `offset_${offset}m_b${bearing}` : `offset_${offset}m`,
          expectedOsmKey: expectedKey,
          shouldResolve: offset <= 250 && offset <= 150,
        });
      }
    }
  }

  return probes;
}

function classifyOutcome(probe: OffsetProbe, result: FuelStationResolveResult): ProbeOutcome {
  const matchedOsmKey = result.station
    ? osmKey(result.station.osmType, result.station.osmId)
    : undefined;
  const top = result.candidates?.[0];
  const second = result.candidates?.[1];

  let outcome: ProbeOutcome['outcome'] = 'NOT_FOUND';
  if (result.status === 'ERROR') outcome = 'ERROR';
  else if (result.status === 'INVALID_COORDINATES') outcome = 'INVALID';
  else if (result.status === 'AMBIGUOUS') outcome = 'AMBIGUOUS';
  else if (result.status === 'MATCHED') {
    outcome = matchedOsmKey === probe.expectedOsmKey ? 'MATCHED_CORRECT' : 'MATCHED_WRONG';
  } else outcome = 'NOT_FOUND';

  return {
    stationId: probe.stationId,
    offsetMeters: probe.offsetMeters,
    offsetKind: probe.offsetKind,
    latitude: probe.latitude,
    longitude: probe.longitude,
    expectedOsmKey: probe.expectedOsmKey,
    shouldResolve: probe.shouldResolve,
    status: result.status,
    confidence: result.confidence,
    score: result.score,
    matchedOsmKey,
    matchedName: result.station?.name ?? result.station?.brand,
    matchedBrand: result.station?.brand,
    geometryDistanceM: top?.features.geometryDistanceMeters,
    pointDistanceM: top?.features.pointDistanceMeters,
    topScore: result.diagnostics?.topScore,
    secondScore: result.diagnostics?.secondScore,
    outcome,
  };
}

async function resolveWithRadii(
  repository: FuelStationCandidateRepository,
  datasetVersion: string,
  latitude: number,
  longitude: number,
  primary: number,
  fallback: number,
): Promise<FuelStationResolveResult> {
  let usedFallbackRadius = false;
  let searchRadiusMeters = primary;
  let rawRows = await repository.findCandidatesNear(latitude, longitude, primary, MAX_CANDIDATES);
  if (rawRows.length === 0) {
    usedFallbackRadius = true;
    searchRadiusMeters = fallback;
    rawRows = await repository.findCandidatesNear(latitude, longitude, fallback, MAX_CANDIDATES);
  }
  const scored = scoreFuelStationCandidates(rawRows);
  const { candidates: deduped, mergedCount } = dedupeFuelStationCandidates(scored);
  const diagnostics = buildResolveDiagnostics({
    searchRadiusMeters,
    usedFallbackRadius,
    rawCandidateCount: rawRows.length,
    dedupedCandidateCount: deduped.length,
    queryLatencyMs: 0,
    dedupeMergedCount: mergedCount,
  });
  return decideFuelStationMatch(deduped, datasetVersion, diagnostics);
}

async function simulateRadius(
  repository: FuelStationCandidateRepository,
  datasetVersion: string,
  probes: OffsetProbe[],
  primary: number,
  fallback: number,
): Promise<{ matchedCorrect: number; matchedWrong: number; ambiguous: number; notFound: number }> {
  let matchedCorrect = 0;
  let matchedWrong = 0;
  let ambiguous = 0;
  let notFound = 0;

  const sample = probes.filter((p) => p.offsetMeters <= fallback && p.offsetKind !== 'offset_300m_b0');
  for (const probe of sample) {
    const result = await resolveWithRadii(
      repository,
      datasetVersion,
      probe.latitude,
      probe.longitude,
      primary,
      fallback,
    );
    const classified = classifyOutcome(probe, result);
    if (classified.outcome === 'MATCHED_CORRECT') matchedCorrect += 1;
    else if (classified.outcome === 'MATCHED_WRONG') matchedWrong += 1;
    else if (classified.outcome === 'AMBIGUOUS') ambiguous += 1;
    else notFound += 1;
  }

  return { matchedCorrect, matchedWrong, ambiguous, notFound };
}

async function explainAnalyze(
  prisma: PrismaClient,
  label: string,
  lat: number,
  lon: number,
): Promise<string> {
  const rows = await prisma.$queryRaw<Array<Record<string, string>>>`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    WITH query AS (
      SELECT
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326) AS q_geom,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography AS q_geog
    )
    SELECT fs.osm_id
    FROM osm.fuel_stations fs
    CROSS JOIN query q
    WHERE ST_DWithin(fs.centroid, q.q_geog, ${PRIMARY_SEARCH_RADIUS_METERS})
    ORDER BY fs.centroid <-> q.q_geog
    LIMIT 10
  `;
  return `=== ${label} ===\n${rows.map((r) => r.plan ?? r['QUERY PLAN'] ?? Object.values(r)[0] ?? '').join('\n')}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  const prisma = new PrismaClient();
  const repository = new FuelStationCandidateRepository(prisma as unknown as PrismaService);
  const resolver = new FuelStationLocationResolverService(repository);

  try {
    const datasetRows = await prisma.$queryRaw<Array<{ dataset_version: string }>>`
      SELECT dataset_version FROM osm.dataset_metadata WHERE is_current = true LIMIT 1
    `;
    const datasetVersion = datasetRows[0]?.dataset_version ?? 'unknown';

    const stations = await loadCalibrationStations(prisma);
    const probes = await buildOffsetProbes(prisma, stations);
    const outcomes: ProbeOutcome[] = [];

    for (const [index, probe] of probes.entries()) {
      const result = await resolver.resolve({ latitude: probe.latitude, longitude: probe.longitude });
      outcomes.push(classifyOutcome(probe, result));
      if ((index + 1) % 50 === 0) {
        console.error(`[calibrate] resolved ${index + 1}/${probes.length} probes`);
      }
    }

    for (const outcome of outcomes) {
      if (outcome.outcome === 'MATCHED_WRONG') {
        outcome.physicalEquivalent = await assessPhysicalEquivalence(
          prisma,
          outcome.expectedOsmKey,
          outcome.matchedOsmKey,
        );
      }
    }

    const wrongMatches = outcomes.filter((o) => o.outcome === 'MATCHED_WRONG');
    const physicallyEquivalentWrong = wrongMatches.filter((o) => o.physicalEquivalent).length;
    const trueWrongMatches = wrongMatches.length - physicallyEquivalentWrong;
    const matchedCorrect = outcomes.filter((o) => o.outcome === 'MATCHED_CORRECT').length;
    const matchedWrong = outcomes.filter((o) => o.outcome === 'MATCHED_WRONG').length;
    const matched = outcomes.filter((o) => o.outcome === 'MATCHED_CORRECT' || o.outcome === 'MATCHED_WRONG');
    const ambiguous = outcomes.filter((o) => o.outcome === 'AMBIGUOUS').length;
    const notFound = outcomes.filter((o) => o.outcome === 'NOT_FOUND').length;
    const errors = outcomes.filter((o) => o.outcome === 'ERROR').length;

    const expectedResolvable = probes.filter((p) => p.shouldResolve).length;
    const precision = matched.length > 0 ? matchedCorrect / matched.length : 1;
    const physicalPrecision =
      matched.length > 0 ? (matchedCorrect + physicallyEquivalentWrong) / matched.length : 1;
    const coverage = expectedResolvable > 0 ? matchedCorrect / expectedResolvable : 0;
    const falsePositiveRate = probes.length > 0 ? matchedWrong / probes.length : 0;
    const falseNegativeRate =
      expectedResolvable > 0
        ? outcomes.filter((o) => !o.shouldResolve && o.outcome === 'MATCHED_WRONG').length / expectedResolvable
        : 0;
    const ambiguityRate = probes.length > 0 ? ambiguous / probes.length : 0;

    const byBucket: Record<string, { correct: number; wrong: number; ambiguous: number; notFound: number }> = {};
    for (const o of outcomes) {
      const bucket = bucketDistance(o.offsetMeters);
      byBucket[bucket] ??= { correct: 0, wrong: 0, ambiguous: 0, notFound: 0 };
      if (o.outcome === 'MATCHED_CORRECT') byBucket[bucket].correct += 1;
      else if (o.outcome === 'MATCHED_WRONG') byBucket[bucket].wrong += 1;
      else if (o.outcome === 'AMBIGUOUS') byBucket[bucket].ambiguous += 1;
      else byBucket[bucket].notFound += 1;
    }

    const contractGaps = outcomes.filter((o) => o.status === 'MATCHED' && !o.confidence);

    const radiusSample = probes.filter((p) =>
      [0, 20, 50, 100, 150, 200, 250].includes(p.offsetMeters) && p.offsetKind !== 'offset_300m_b0',
    );
    const radiusComparisons = [];
    for (const fallback of [150, 200, 250, 300]) {
      const stats = await simulateRadius(repository, datasetVersion, radiusSample, PRIMARY_SEARCH_RADIUS_METERS, fallback);
      const matched = stats.matchedCorrect + stats.matchedWrong;
      radiusComparisons.push({
        primary: PRIMARY_SEARCH_RADIUS_METERS,
        fallback,
        ...stats,
        precision: matched > 0 ? stats.matchedCorrect / matched : 1,
        coverage: expectedResolvable > 0 ? stats.matchedCorrect / expectedResolvable : 0,
      });
    }

    const explainPlans = [];
    const explainPoints = [
      ['kassel', 51.3127, 9.4797],
      ['berlin', 52.52, 13.405],
      ['munich', 48.1351, 11.582],
      ['hamburg', 53.5511, 9.9937],
      ['frankfurt', 50.1109, 8.6821],
      ['rural', 50.35, 6.95],
      ['dense', stations.find((s) => s.topology === 'dense_cluster')?.latitude ?? 52.5, stations.find((s) => s.topology === 'dense_cluster')?.longitude ?? 13.4],
    ] as const;

    for (const [label, lat, lon] of explainPoints) {
      explainPlans.push(await explainAnalyze(prisma, label, lat, lon));
    }

    const adversarialDetails = outcomes
      .filter((o) => o.stationId.startsWith('adv-') || o.stationId.startsWith('dedupe-'))
      .filter((o) => o.offsetMeters <= 50)
      .slice(0, 20);

    const report = {
      generatedAt: new Date().toISOString(),
      dataset: await prisma.$queryRaw`SELECT dataset_version, station_count FROM osm.dataset_metadata WHERE is_current = true`,
      stationCount: stations.length,
      probeCount: probes.length,
      metrics: {
        precision,
        physicalPrecision,
        trueWrongMatches,
        physicallyEquivalentWrong,
        coverage,
        falsePositiveRate,
        falseNegativeRate,
        ambiguityRate,
        matchedCorrect,
        matchedWrong,
        ambiguous,
        notFound,
        errors,
        expectedResolvable,
      },
      byDistanceBucket: byBucket,
      contractGaps,
      radiusComparisons,
      adversarialDetails,
      wrongMatches: wrongMatches.slice(0, 40),
      stations: stations.map((s) => ({
        id: s.id,
        label: s.label,
        region: s.region,
        topology: s.topology,
        osmKey: osmKey(s.osmType, s.osmId),
        geometryType: s.geometryType,
      })),
      explainPlans,
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
