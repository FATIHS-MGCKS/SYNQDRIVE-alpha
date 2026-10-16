#!/usr/bin/env ts-node
/**
 * LDI-10C Phase 1 — spatial-temporal trip reconstruction (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { LDI08_TRIP_ID, LDI08_VEHICLE_ID } from './ldi08-r1-fusion-replay.lib';
import { runLdi10cReconstruction } from './ldi10c-spatial-trip-reconstruction.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-10c');
  }
  return path.resolve(argv[i + 1]);
}

function main(): void {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI10C_REPO_ROOT
    ? path.resolve(process.env.LDI10C_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const result = runLdi10cReconstruction(repoRoot);
  if (!result.provenance.ok) {
    console.error(JSON.stringify({ ok: false, errors: result.provenance.errors }));
    process.exit(1);
  }

  fs.writeFileSync(path.join(outDir, 'LDI10C_ROUTE.geojson'), JSON.stringify(result.geojson, null, 2));

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_MANEUVER_TIMELINE.json'),
    JSON.stringify(
      {
        schema: 'LDI10C_MANEUVER_TIMELINE_V1',
        headSha,
        tripId: LDI08_TRIP_ID,
        vehicleId: LDI08_VEHICLE_ID,
        productionMutations: 'NONE',
        provenance: result.provenance,
        tolerances: {
          temporal: result.geojson.properties.provenance.temporalMatch,
          spatial: result.geojson.properties.provenance.spatialMatch,
        },
        sequentialPatterns: result.sequentialPatterns,
        maneuvers: result.maneuverTimeline,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_SPATIAL_CONTEXT.md'),
    [
      '# LDI10C — Spatial context',
      '',
      `**Trip:** \`${LDI08_TRIP_ID}\` · **Phase:** 1 (offline reconstruction)`,
      '',
      '## Map-data provenance',
      '',
      `- **Frozen OSM in PR #2051 LDI chain:** **${result.mapContext.frozenOsmArtifactInPr2051 ? 'yes' : 'no'}**`,
      `- **Blocker:** ${result.mapContext.blocker}`,
      `- **BBox (observed GPS):** south=${result.mapContext.bboxFromObservedGps.south}, west=${result.mapContext.bboxFromObservedGps.west}, north=${result.mapContext.bboxFromObservedGps.north}, east=${result.mapContext.bboxFromObservedGps.east}`,
      '',
      '## Verified from pin (not map)',
      '',
      `- GPS polyline points: **${result.mapContext.verifiedFromPinOnly.gpsPolylinePointCount}**`,
      `- Curvature proxies (bearing Δ≥25° between consecutive segments): **${result.mapContext.verifiedFromPinOnly.curvatureBearingProxyCount}** — *hypothesis: turn segment; not OSM-verified curve*`,
      `- Low-speed L3 buckets (≤5 km/h): **${result.mapContext.verifiedFromPinOnly.lowSpeedL3StopCandidateCount}** — *stopping candidate from speed only*`,
      `- Native corner event buckets: **${result.mapContext.verifiedFromPinOnly.nativeCornerEventBuckets.length}** — ${result.mapContext.verifiedFromPinOnly.nativeCornerEventBuckets.join(', ') || 'none'}`,
      '',
      '## Not claimed',
      '',
      result.mapContext.hypothesesNotVerified.map((h) => `- ${h}`).join('\n'),
      '',
      '## Sequential patterns (kinematic only)',
      '',
      '| Pattern | Groups | Note |',
      '|---------|--------|------|',
      ...result.sequentialPatterns.slice(0, 40).map(
        (p) => `| ${p.type} | ${p.groupIds.join(' → ')} | ${p.note.slice(0, 80)}… |`,
      ),
      '',
      result.sequentialPatterns.length > 40 ? `_(${result.sequentialPatterns.length - 40} more in JSON)_` : '',
      '',
      '**No road context proves braking cause or driver intent.**',
    ].join('\n'),
  );

  const auditLines = [
    '# LDI10C — Per-group audit',
    '',
    `**Groups:** ${result.summary.groupCount} · **Candidates traced:** ${result.summary.candidateCount}`,
    '',
  ];
  for (const a of result.groupAudits) {
    const g = a as {
      groupId: string;
      evidence: Record<string, unknown>;
      spatialContext: Record<string, unknown>;
      unresolvedQuestions: string[];
    };
    auditLines.push(`## ${g.groupId}`, '');
    auditLines.push('### Evidence', '', '```json', JSON.stringify(g.evidence, null, 2), '```', '');
    auditLines.push('### Spatial context', '', '```json', JSON.stringify(g.spatialContext, null, 2), '```', '');
    auditLines.push('### Unresolved', '', ...g.unresolvedQuestions.map((q) => `- ${q}`), '');
  }
  fs.writeFileSync(path.join(outDir, 'LDI10C_GROUP_AUDIT.md'), auditLines.join('\n'));

  fs.writeFileSync(
    path.join(outDir, 'LDI10C_RESULT.md'),
    [
      '# LDI10C Phase 1 — Result',
      '',
      '## Provenance verification',
      '',
      `- Status: **${result.provenance.ok ? 'PASS' : 'FAIL'}**`,
      `- LDI08 snapshot SHA-256: \`${result.provenance.hashes.ldi08CombinedSnapshotSha256}\``,
      `- LDI10B physics SHA-256: \`${result.provenance.hashes.ldi10bManeuverPhysicsSha256}\``,
      '',
      '## Acceptance',
      '',
      `- Maneuver groups accounted: **${result.summary.groupCount}/32**`,
      `- Candidates traceable: **${result.summary.candidateCount}/75**`,
      `- Plausible / unclear preserved: **${result.summary.plausibleGroups}** / **${result.summary.unclearGroups}**`,
      `- Groups touching UNTRUSTED QC: **${result.summary.untrustedTouchingGroups}** (flagged in timeline + GeoJSON)`,
      `- Route GPS points: **${result.route.pointCount}** (no coordinate interpolation)`,
      '- Frozen OSM for intersections/signals: **unavailable** — see `LDI10C_SPATIAL_CONTEXT.md`',
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi10c:spatial-trip-reconstruction',
      '```',
      '',
      '```',
      'LDI10C_PHASE=1',
      'LDI10C_RESULT=SPATIAL_TEMPORAL_RECONSTRUCTION_COMPLETE',
      `GROUPS_ACCOUNTED=${result.summary.groupCount}`,
      `CANDIDATES_TRACED=${result.summary.candidateCount}`,
      `PLAUSIBLE_GROUPS=${result.summary.plausibleGroups}`,
      `UNCLEAR_GROUPS=${result.summary.unclearGroups}`,
      `UNTRUSTED_TOUCHING_GROUPS=${result.summary.untrustedTouchingGroups}`,
      `ROUTE_GPS_POINTS=${result.route.pointCount}`,
      'MAP_CONTEXT_FROZEN_OSM=UNAVAILABLE',
      'PRODUCTION_MUTATIONS=NONE',
      'STOP=LDI10C_phase1_complete_no_phase2_no_deploy',
      '```',
    ].join('\n'),
  );

  console.log(
    JSON.stringify({
      ok: true,
      groups: result.summary.groupCount,
      routePoints: result.route.pointCount,
      untrustedTouching: result.summary.untrustedTouchingGroups,
    }),
  );
}

main();
