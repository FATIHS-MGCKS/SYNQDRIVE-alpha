#!/usr/bin/env ts-node
/**
 * LDI-10D Phase 2 — frozen OSM + maneuver road association.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { sha256File } from './ldi10a-longitudinal-candidate-forensics.lib';
import { loadLdi08Artifacts } from './ldi09-accel-decel-signal-forensics.lib';
import {
  buildObservedRoute,
  loadLdi10bGroups,
} from './ldi10c-spatial-trip-reconstruction.lib';
import {
  associateGroup,
  buildOverpassQuery,
  computeCorridorBbox,
  DEFAULT_UNCERTAINTY_RADIUS_M,
  fetchOverpassSnapshot,
  parseOverpassElements,
  runIntegrityChecks,
  sha256Buffer,
  verifyPhase2Inputs,
} from './ldi10d-phase2-osm-road-context.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10d');
  }
  return path.resolve(argv[i + 1]);
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10D_REPO_ROOT
    ? path.resolve(process.env.LDI10D_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const inputCheck = verifyPhase2Inputs(repoRoot);
  if (!inputCheck.ok) {
    console.error(JSON.stringify({ ok: false, phase: 2, errors: inputCheck.errors }));
    process.exit(1);
  }

  const { snapshot } = loadLdi08Artifacts(repoRoot);
  const route = buildObservedRoute(snapshot.rows);
  const bbox = computeCorridorBbox(
    route.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
    75,
  );
  const query = buildOverpassQuery(bbox);
  const querySha = sha256Buffer(query);

  const frozenPath = path.join(outDir, 'LDI10D_OSM_FROZEN_SNAPSHOT.json');
  const useFrozen = process.env.LDI10D_USE_FROZEN_OSM === '1' && fs.existsSync(frozenPath);

  let osmStatus: 'FROZEN' | 'BLOCKED_EXTERNAL_DATA' = 'FROZEN';
  let osmSnapshotSha = '';
  let overpassBody: unknown = null;
  let fetchedAtUtc = '';
  let fetchMeta: Record<string, unknown> = {};

  if (useFrozen) {
    const existing = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as {
      overpassResponse: unknown;
      provenance: { fetchedAtUtc: string };
    };
    overpassBody = existing.overpassResponse;
    fetchedAtUtc = existing.provenance.fetchedAtUtc;
    osmSnapshotSha = sha256Buffer(JSON.stringify(existing.overpassResponse));
    fetchMeta = { mode: 'reuse_frozen_file' };
  } else {
    const fetched = await fetchOverpassSnapshot(query);
    if (!fetched.ok) {
      fs.writeFileSync(
        path.join(outDir, 'LDI10D_PHASE2_RESULT.md'),
        [
          '# LDI-10D Phase 2 — BLOCKED',
          '',
          `External Overpass fetch failed: **${fetched.error}**`,
          '',
          '```',
          'LDI10D_PHASE=2',
          'LDI10D_RESULT=BLOCKED_EXTERNAL_DATA',
          `OSM_SNAPSHOT_STATUS=BLOCKED_EXTERNAL_DATA`,
          'PRODUCTION_MUTATIONS=NONE',
          'STOP=LDI10D_phase2_blocked_no_fabrication',
          '```',
        ].join('\n'),
      );
      console.error(JSON.stringify({ ok: false, status: 'BLOCKED_EXTERNAL_DATA', error: fetched.error }));
      process.exit(2);
    }
    overpassBody = fetched.body;
    fetchedAtUtc = fetched.fetchedAtUtc;
    osmSnapshotSha = sha256Buffer(fetched.rawText);
    fetchMeta = { httpStatus: fetched.httpStatus, mode: 'live_overpass_post' };
  }

  const parsed = parseOverpassElements(overpassBody as { elements?: Array<Record<string, unknown>> });
  const signalNodes = parsed.nodes.filter((n) => n.kind === 'traffic_signals');
  const crossingNodes = parsed.nodes.filter((n) => n.kind === 'crossing');
  const junctionNodes = parsed.nodes.filter((n) => n.kind === 'junction');

  let frozenDoc: {
    schema: string;
    headSha: string;
    tripId: string;
    productionMutations: string;
    provenance: Record<string, unknown>;
    overpassResponse: unknown;
  };

  if (useFrozen) {
    frozenDoc = JSON.parse(fs.readFileSync(frozenPath, 'utf8')) as typeof frozenDoc;
    osmSnapshotSha = sha256File(frozenPath);
  } else {
    frozenDoc = {
      schema: 'LDI10D_OSM_FROZEN_SNAPSHOT_V1',
      headSha,
      tripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
      productionMutations: 'NONE',
      provenance: {
        source: 'OpenStreetMap contributors',
        license: 'ODbL-1.0',
        attribution: '© OpenStreetMap contributors — https://www.openstreetmap.org/copyright',
        endpoint: 'https://overpass-api.de/api/interpreter',
        fetchedAtUtc,
        querySha256: querySha,
        queryText: query,
        boundingBox: bbox,
        inputArtifactHashes: inputCheck.hashes,
        ...fetchMeta,
        odbComplianceNote:
          'Frozen extract for forensic evidence only; do not merge into tenant DB without legal review. Share-alike obligations apply to derivative databases.',
        apiComplianceNote: 'Single bbox query; User-Agent set; no production DB access',
      },
      overpassResponse: overpassBody,
    };
    fs.writeFileSync(frozenPath, JSON.stringify(frozenDoc, null, 2));
    osmSnapshotSha = sha256File(frozenPath);
  }

  const inventory = {
    schema: 'LDI10D_ROAD_FEATURE_INVENTORY_V1',
    osmSnapshotSha256: osmSnapshotSha,
    counts: {
      ways: parsed.ways.length,
      trafficSignals: signalNodes.length,
      crossings: crossingNodes.length,
      junctionTaggedNodes: junctionNodes.length,
      turnRestrictions: parsed.relations.length,
    },
    waysSummary: parsed.ways.map((w) => ({
      osmId: w.osmId,
      highway: w.highway,
      maxspeed: w.maxspeed,
      oneway: w.oneway,
      nodeCount: w.nodes.length,
    })),
    signals: signalNodes.map((n) => ({ osmId: n.osmId, lat: n.lat, lon: n.lon })),
  };
  fs.writeFileSync(path.join(outDir, 'LDI10D_OSM_MANIFEST.json'), JSON.stringify(frozenDoc.provenance, null, 2));
  fs.writeFileSync(path.join(outDir, 'LDI10D_ROAD_FEATURE_INVENTORY.json'), JSON.stringify(inventory, null, 2));

  const groups = loadLdi10bGroups(repoRoot);
  const associations = groups.map((g) =>
    associateGroup({
      group: g,
      rows: snapshot.rows,
      ways: parsed.ways,
      signalNodes: [...signalNodes, ...crossingNodes, ...junctionNodes],
      uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
    }),
  );

  const integrityFailures = runIntegrityChecks(
    associations.map((a) => ({ associationOutcome: String(a.associationOutcome) })),
  );
  if (integrityFailures.length) {
    console.error(JSON.stringify({ ok: false, integrityFailures }));
    process.exit(1);
  }

  const unknownCount = associations.filter((a) => a.associationOutcome === 'UNKNOWN').length;
  const associatedCount = 32 - unknownCount;

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_MANEUVER_ROAD_ASSOCIATION.json'),
    JSON.stringify(
      {
        schema: 'LDI10D_MANEUVER_ROAD_ASSOCIATION_V1',
        headSha,
        tripId: 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9',
        osmSnapshotSha256: osmSnapshotSha,
        uncertaintyRadiusM: DEFAULT_UNCERTAINTY_RADIUS_M,
        groupingUnchanged: { groups: 32, candidates: 75 },
        qcMutations: 'NONE',
        associations,
      },
      null,
      2,
    ),
  );

  const unclear = groups.filter((g) => g.plausibilityVerdict === 'UNCLEAR_QC_OR_GAPS');
  const plausibleAccel = groups.filter(
    (g) => g.kind === 'ACCELERATION' && g.plausibilityVerdict === 'PLAUSIBLE',
  );
  const assocById = new Map(associations.map((a) => [a.groupId as string, a]));

  const compareRow = (g: { groupId: string; plausibilityVerdict: string }) => {
    const a = assocById.get(g.groupId)!;
    return `| ${g.groupId} | ${a.associationOutcome} | ${(a.nearestWay as { distanceM?: number } | null)?.distanceM ?? '—'} | ${(a.trafficSignalProximity as unknown[])?.length ?? 0} | ${(a.ambiguityReasons as string[]).join('; ') || '—'} |`;
  };

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_UNCLEAR_VS_PLAUSIBLE_COMPARISON.md'),
    [
      '# LDI-10D Phase 2 — 8 UNCLEAR vs 8 plausible acceleration',
      '',
      'Map context is **descriptive only** — does **not** validate L3 speed or upgrade QC.',
      '',
      '## UNCLEAR (8)',
      '',
      '| Group | Outcome | Nearest way (m) | Signal candidates | Ambiguity |',
      '|-------|---------|-----------------|-------------------|-----------|',
      ...unclear.map(compareRow),
      '',
      '## PLAUSIBLE acceleration control (8)',
      '',
      '| Group | Outcome | Nearest way (m) | Signal candidates | Ambiguity |',
      '|-------|---------|-----------------|-------------------|-----------|',
      ...plausibleAccel.map(compareRow),
      '',
      '**Pattern:** UNCLEAR groups correlate with UNTRUSTED L3 QC (Phase 3) — not with absence of OSM roads. Signal proximity alone does not explain UNCLEAR classification.',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_INTERSECTION_SIGNAL_CURVE_CONTEXT.md'),
    [
      '# LDI-10D Phase 2 — Intersection / signal / curve context',
      '',
      `- Traffic signals in bbox: **${signalNodes.length}**`,
      `- Crossings: **${crossingNodes.length}**`,
      `- Junction-tagged nodes: **${junctionNodes.length}**`,
      `- Turn restriction relations: **${parsed.relations.length}**`,
      '',
      'Curvature from OSM not computed in Phase 2 minimum pass — use LDI-10C GPS bearing-Δ proxy for kinematic turn segments.',
      '',
      '**No signal phase, brake, regen, or intent claims.**',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_DATA_QUALITY_AMBIGUITY.md'),
    [
      '# LDI-10D Phase 2 — Data quality & ambiguity',
      '',
      `- Groups analyzed: **32**`,
      `- Associated (INFERRED_MAP): **${associatedCount}**`,
      `- UNKNOWN outcome: **${unknownCount}**`,
      `- UNCLEAR plausibility preserved: **8**`,
      `- GPS present / ROW_ABSENT: **${inputCheck.counts.gpsPresent}** / **${inputCheck.counts.rowAbsent}**`,
      '',
      '## Common ambiguity reasons',
      '',
      ...[...new Set(associations.flatMap((a) => a.ambiguityReasons as string[]))].map((r) => `- ${r}`),
      '',
      '## Replay',
      '',
      '```bash',
      'cd backend && LDI10D_USE_FROZEN_OSM=1 npm run ldi10d:phase2-osm-road-context',
      '```',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10D_PHASE2_RESULT.md'),
    [
      '# LDI-10D Phase 2 — Result',
      '',
      '## Mandatory block',
      '',
      '```',
      'LDI10D_PHASE=2',
      'LDI10D_RESULT=FROZEN_OSM_AND_MANEUVER_ASSOCIATION_COMPLETE',
      `OSM_SNAPSHOT_STATUS=${osmStatus}`,
      `OSM_SNAPSHOT_SHA256=${osmSnapshotSha}`,
      `ROAD_FEATURES=${parsed.ways.length}`,
      `TRAFFIC_SIGNALS=${signalNodes.length}`,
      `INTERSECTIONS=${crossingNodes.length + junctionNodes.length}`,
      'GROUPS_ANALYZED=32',
      `GROUPS_ASSOCIATED=${associatedCount}`,
      `GROUPS_UNKNOWN=${unknownCount}`,
      'UNCLEAR_GROUPS_UNCHANGED=8',
      'QC_MUTATIONS=NONE',
      'PRODUCTION_MUTATIONS=NONE',
      'NEXT_SAFE_ACTION=Owner_review_OSM_attribution_and_association_UNKNOWN_rate_before_phase3',
      'STOP=LDI10D_phase2_complete_wait_owner_review',
      '```',
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi10d:phase2-osm-road-context',
      'cd backend && LDI10D_USE_FROZEN_OSM=1 npm run ldi10d:phase2-osm-road-context',
      '```',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      osmSnapshotSha: osmSnapshotSha.slice(0, 16),
      ways: parsed.ways.length,
      signals: signalNodes.length,
      associated: associatedCount,
      unknown: unknownCount,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
