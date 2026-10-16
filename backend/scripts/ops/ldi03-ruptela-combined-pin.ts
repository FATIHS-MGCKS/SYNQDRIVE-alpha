#!/usr/bin/env ts-node
/**
 * LDI-03 — Ruptela combined multi-stream evidence pin (read-only DB).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import {
  LDI03_ORG_ID,
  buildCombinedSnapshotRows,
  buildCoverageReport,
  buildEventOverlapTable,
  buildLdi03ResultLines,
  buildTemporalAlignment,
  bucketForNativeTimestamp,
  loadFrozenManifestRuptelaTrips,
  normalizeNativeRecordedAt,
  scoreRuptelaCandidateFromContext,
  type Ldi03NativeRow,
} from './ldi03-ruptela-combined-pin.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-03');
  }
  return path.resolve(argv[i + 1]);
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function countNativeEvents(
  prisma: PrismaClient,
  tripId: string,
  vehicleId: string,
  windowStart: string,
  windowEnd: string,
): Promise<number> {
  return prisma.drivingEvent.count({
    where: {
      vehicleId,
      organizationId: LDI03_ORG_ID,
      recordedAt: { gte: new Date(windowStart), lte: new Date(windowEnd) },
      OR: [{ tripId }, { tripId: null }],
    },
  });
}

async function loadNativeEvents(
  prisma: PrismaClient,
  tripId: string,
  vehicleId: string,
  windowStart: string,
  windowEnd: string,
): Promise<Ldi03NativeRow[]> {
  const rows = await prisma.drivingEvent.findMany({
    where: {
      vehicleId,
      organizationId: LDI03_ORG_ID,
      recordedAt: { gte: new Date(windowStart), lte: new Date(windowEnd) },
      OR: [{ tripId }, { tripId: null }],
    },
    orderBy: { recordedAt: 'asc' },
    select: {
      id: true,
      eventType: true,
      providerEventName: true,
      recordedAt: true,
      speedKmh: true,
      deltaKmh: true,
      source: true,
    },
  });
  return rows.map((r) => {
    const recordedAtUtc = normalizeNativeRecordedAt(r.recordedAt);
    return {
      id: r.id,
      eventType: String(r.eventType),
      providerEventName: r.providerEventName,
      recordedAtUtc,
      normalizedBucketUtc: bucketForNativeTimestamp(recordedAtUtc),
      speedKmh: r.speedKmh,
      deltaKmh: r.deltaKmh,
      source: String(r.source),
    };
  });
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI03_REPO_ROOT
    ? path.resolve(process.env.LDI03_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = require('node:child_process').execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const orgId = process.env.EXP021_P21_ORG_ID ?? LDI03_ORG_ID;
  const ruptelaManifest = loadFrozenManifestRuptelaTrips(repoRoot);
  const prisma = new PrismaClient();
  const selectionCandidates: Array<{
    tripId: string;
    vehicleId: string;
    workItemId: string;
    score: number;
    rationale: string[];
    nativeCount: number;
  }> = [];

  try {
    for (const binding of ruptelaManifest) {
      const probeCtx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
        organizationId: orgId,
        tripId: binding.tripId,
        workItemId: binding.workItemId,
      });
      const nativeCount = await countNativeEvents(
        prisma,
        binding.tripId,
        binding.vehicleId,
        probeCtx.acquisitionWindow.startLabel,
        probeCtx.acquisitionWindow.endLabel,
      );
      const { score, rationale } = scoreRuptelaCandidateFromContext(probeCtx, nativeCount);
      selectionCandidates.push({
        tripId: binding.tripId,
        vehicleId: binding.vehicleId,
        workItemId: binding.workItemId,
        score,
        rationale,
        nativeCount,
      });
    }

    selectionCandidates.sort((a, b) => b.score - a.score);
    const selected = selectionCandidates[0];
    if (!selected) throw new Error('No Ruptela manifest bindings found');

    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId: orgId,
      tripId: selected.tripId,
      workItemId: selected.workItemId,
    });

    const snapshotRows = await prisma.$queryRaw<
      Array<{
        channel_manifest: unknown;
        payload_gzip: Buffer;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
      }>
    >`
      SELECT channel_manifest, payload_gzip, acquisition_window_start, acquisition_window_end
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${ctx.workItem.organization_id}
        AND trip_id = ${ctx.workItem.trip_id}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;

    const snap = snapshotRows[0];
    let r1Payload: string | undefined;
    if (snap) {
      const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(
        {
          organization_id: ctx.workItem.organization_id,
          vehicle_id: ctx.workItem.vehicle_id,
          trip_id: ctx.workItem.trip_id,
          boundary_fingerprint: ctx.workItem.boundary_fingerprint,
          acquisition_window_start: snap.acquisition_window_start,
          acquisition_window_end: snap.acquisition_window_end,
          channel_manifest: snap.channel_manifest,
          payload_gzip: snap.payload_gzip,
          uncompressed_bytes: 0,
        },
        {
          organizationId: ctx.workItem.organization_id,
          vehicleId: ctx.workItem.vehicle_id,
          tripId: ctx.workItem.trip_id,
          boundaryFingerprint: ctx.workItem.boundary_fingerprint,
          snapshotHash: ctx.pinnedSnapshotHash,
          sourceFamily: ctx.workItem.source_family as never,
        },
      );
      if (verified.ok) r1Payload = verified.parsed.channelPayloads.R1_OBD;
    }

    const utcFrom = ctx.acquisitionWindow.startLabel;
    const utcTo = ctx.acquisitionWindow.endLabel;

    const natives = await loadNativeEvents(
      prisma,
      selected.tripId,
      selected.vehicleId,
      utcFrom,
      utcTo,
    );
    const rows = buildCombinedSnapshotRows(ctx, natives, r1Payload);
    const overlap = buildEventOverlapTable(rows, natives, r1Payload, ctx);
    const temporal = buildTemporalAlignment(rows, natives);
    const coverage = buildCoverageReport(rows, natives, overlap);

    const snapshotPayload = {
      schema: 'LDI03_COMBINED_SNAPSHOT_V1',
      headSha,
      exportMode: 'READ_ONLY_DB_PIN',
      productionMutations: 'NONE',
      organizationId: orgId,
      vehicleId: selected.vehicleId,
      tripId: selected.tripId,
      workItemId: selected.workItemId,
      pinnedSnapshotHash: ctx.pinnedSnapshotHash,
      integrationFamily: 'RUPTELA_LTE_R1',
      acquisitionWindowUtc: { from: utcFrom, to: utcTo },
      rowCount: rows.length,
      rows,
    };

    fs.writeFileSync(path.join(outDir, 'LDI03_COMBINED_SNAPSHOT.json'), JSON.stringify(snapshotPayload, null, 2));
    fs.writeFileSync(path.join(outDir, 'LDI03_TEMPORAL_ALIGNMENT.json'), JSON.stringify(temporal, null, 2));
    fs.writeFileSync(path.join(outDir, 'LDI03_EVENT_OVERLAP.json'), JSON.stringify({ schema: 'LDI03_EVENT_OVERLAP_V1', overlap }, null, 2));

    const tripSelectionMd = [
      '# LDI03 — Trip selection',
      '',
      `**HEAD:** \`${headSha}\` · **Mode:** read-only · **Org:** \`${orgId}\``,
      '',
      '## Active Ruptela R1 vehicles (frozen manifest cohort)',
      '',
      '| Vehicle ID | Integration |',
      '|------------|-------------|',
      '| `19fedd4b-c4e8-4de8-a125-dab293326e7e` | RUPTELA_LTE_R1 |',
      '| `c10351f8-b6a2-4258-947f-631aeaa6d359` | RUPTELA_LTE_R1 |',
      '| `8c850ff1-4201-432b-af2e-2711dbc7ca48` | RUPTELA_LTE_R1 |',
      '',
      '## Selected trip',
      '',
      `- **Vehicle:** \`${selected.vehicleId}\``,
      `- **Trip:** \`${selected.tripId}\``,
      `- **Work item:** \`${selected.workItemId}\``,
      `- **Pinned snapshot:** \`${ctx.pinnedSnapshotHash}\``,
      `- **UTC window:** \`${utcFrom}\` → \`${utcTo}\``,
      '',
      '### Selection rationale',
      '',
      ...selected.rationale.map((r) => `- ${r}`),
      '',
      'Scored against all manifest Ruptela trips (position fraction, OBD numeric density, native `DrivingEvent` count, gap penalty).',
      '',
      '### Candidate ranking',
      '',
      '| Rank | Trip | Score | Native events |',
      '|------|------|-------|---------------|',
      ...selectionCandidates.map((c, i) => `| ${i + 1} | \`${c.tripId.slice(0, 8)}…\` | ${c.score.toFixed(4)} | ${c.nativeCount} |`),
      '',
      '### Missing streams (if any)',
      '',
      natives.length === 0
        ? '- **Native DrivingEvents:** none persisted for trip — overlap table uses HF/L3 kinematics only'
        : '- Native events present',
      (coverage as { hfCoverage: { fractionOfShadowGrid: number } }).hfCoverage.fractionOfShadowGrid < 0.5
        ? '- **HF/OBD 1 Hz subset:** sparse vs shadow grid (see coverage report) — not a full-second HF lattice'
        : '- HF/OBD subset meets moderate density',
      '',
      '## Repro',
      '',
      '```bash',
      'cd backend && npm run ldi03:ruptela-combined-pin',
      '```',
      '',
      'Requires read-only `DATABASE_URL` to org production/staging clone with pinned S4 snapshots.',
    ].join('\n');

    fs.writeFileSync(path.join(outDir, 'LDI03_TRIP_SELECTION.md'), tripSelectionMd);

    const coverageMd = [
      '# LDI03 — Coverage report',
      '',
      'Separate numeric speed coverage vs event assessability (no additive fusion score).',
      '',
      '```json',
      JSON.stringify(coverage, null, 2),
      '```',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'LDI03_COVERAGE_REPORT.md'), coverageMd);

    const nextDecision = [
      '# LDI03 — Next decision',
      '',
      '1. Review `LDI03_EVENT_OVERLAP.json` — native rows are **not** ground truth.',
      '2. If multi-stream overlap < 15%, prefer a different manifest trip or extend pin with owner-approved DB export only.',
      '3. LDI-04: draft fusion policy using overlap verdicts without changing production harsh thresholds.',
      '',
      'Large snapshot: full per-second grid stored in `LDI03_COMBINED_SNAPSHOT.json` (git). Re-export via npm script if hash drifts.',
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'LDI03_NEXT_DECISION.md'), nextDecision);

    const resultLines = buildLdi03ResultLines({
      vehicleId: selected.vehicleId,
      tripId: selected.tripId,
      utcFrom,
      utcTo,
      coverage,
      overlap,
      temporal,
    });
    fs.writeFileSync(path.join(outDir, 'LDI03_RESULT.txt'), resultLines.join('\n') + '\n');

    const checksums = [
      `LDI03_COMBINED_SNAPSHOT.json ${sha256File(path.join(outDir, 'LDI03_COMBINED_SNAPSHOT.json'))}`,
      `LDI03_TEMPORAL_ALIGNMENT.json ${sha256File(path.join(outDir, 'LDI03_TEMPORAL_ALIGNMENT.json'))}`,
      `LDI03_EVENT_OVERLAP.json ${sha256File(path.join(outDir, 'LDI03_EVENT_OVERLAP.json'))}`,
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), checksums + '\n');

    console.log(JSON.stringify({ ok: true, outDir, selectedTrip: selected.tripId, rowCount: rows.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
