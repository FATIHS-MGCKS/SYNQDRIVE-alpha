#!/usr/bin/env ts-node
/**
 * EXP021 P22C — RD003 session-to-trip alignment audit (read-only DB + repo artifacts).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import {
  RD003_SESSION_ID,
  buildP22CPayload,
  loadClipSyncRows,
  queryTripCandidates,
} from './exp021-p22c-rd003-session-trip-audit.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <dir> [--pr 2051]');
  return path.resolve(argv[i + 1]);
}

function parsePr(argv: string[]): number {
  const i = argv.indexOf('--pr');
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 2051;
}

function renderReport(payload: ReturnType<typeof buildP22CPayload>): string {
  const lines = [
    '# EXP021 P22C — RD003 Session-to-Trip Alignment',
    '',
    `**Result:** \`${payload.p22cResult}\` · PR #${payload.prNumber} · HEAD \`${payload.headSha}\``,
    '',
    '## Trip binding',
    '',
    `- RC session found: **${payload.sessionToTrip.rd003SessionFound}**`,
    `- Window: ${payload.sessionToTrip.sessionWindowUtc.from} → ${payload.sessionToTrip.sessionWindowUtc.to}`,
    `- Candidate trips (±5 min pad): **${payload.sessionToTrip.candidateTripCount}**`,
    `- **Unique binding:** \`${payload.sessionToTrip.uniqueTripBinding ?? 'NONE'}\``,
    `- Basis: ${payload.sessionToTrip.bindingBasis}`,
    '',
    '## UTC sync (9 clips)',
    '',
    '| Clip | Candidate UTC | Aligned UTC (HF fit) | Residual s | MAE km/h | Cov | UTC gate |',
    '|------|---------------|----------------------|------------|----------|-----|----------|',
  ];
  for (const c of payload.synchronization.clips) {
    lines.push(
      `| ${c.clipId} | ${c.candidateStartUtc ?? '—'} | ${c.alignedClipStartUtcHfHistorical ?? '—'} | ${c.alignmentResidualSeconds ?? '—'} | ${c.speedMaeKmh?.toFixed?.(1) ?? '—'} | ${c.matchCoverageRatio != null ? (c.matchCoverageRatio * 100).toFixed(0) + '%' : '—'} | ${c.utcGate} |`,
    );
  }
  lines.push(
    '',
    `**Validated UTC clips:** ${payload.synchronization.clipsWithValidatedUtc} · **Offset confidence:** ${payload.synchronization.utcOffsetConfidence}`,
    '',
    '## Case gates',
    '',
  );
  for (const c of payload.caseRecovery) {
    lines.push(`### ${c.caseType} — **${c.gate}**`, '', c.videoEvidence, '', '');
  }
  lines.push('## v0_2', '', `Hash \`${payload.v0_2.parameterSnapshotHash}\` unchanged.`, '');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const pr = parsePr(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  let dbEvidence;
  try {
    dbEvidence = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL transaction_read_only = on');
      const rc = await tx.referenceCaptureSession.findUnique({ where: { id: RD003_SESSION_ID } });
      if (!rc) {
        return {
          rcSessionFound: false,
          sessionStartedAt: null,
          sessionStoppedAt: null,
          candidateTrips: [],
          uniqueTripId: null,
          p21WorkItemCount: 0,
          rcObservationCount: 0,
          gpsObservationCount: 0,
        };
      }
      const startedAt = rc.startedAt!;
      const stoppedAt = rc.stoppedAt!;
      const candidates = await queryTripCandidates(tx as unknown as PrismaClient, startedAt, stoppedAt);
      const containing = candidates.filter((t) => t.containsSession);
      const uniqueTripId = containing.length === 1 ? containing[0].id : null;
      let p21WorkItemCount = 0;
      if (uniqueTripId) {
        const wi = await tx.$queryRawUnsafe<Array<{ c: number }>>(
          'SELECT COUNT(*)::int AS c FROM di_v0_s4_work_items WHERE trip_id = $1',
          uniqueTripId,
        );
        p21WorkItemCount = wi[0]?.c ?? 0;
      }
      const obs = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        'SELECT COUNT(*)::int AS c FROM reference_capture_observations WHERE session_id = $1',
        RD003_SESSION_ID,
      );
      const gps = await tx.$queryRawUnsafe<Array<{ c: number }>>(
        "SELECT COUNT(*)::int AS c FROM reference_capture_observations WHERE session_id = $1 AND provider_field = 'currentLocationCoordinates'",
        RD003_SESSION_ID,
      );
      return {
        rcSessionFound: true,
        sessionStartedAt: startedAt.toISOString(),
        sessionStoppedAt: stoppedAt.toISOString(),
        candidateTrips: candidates.map((t) => ({
          id: t.id,
          start_time: t.start_time.toISOString(),
          end_time: t.end_time?.toISOString() ?? null,
          containsSession: t.containsSession,
          dimo_segment_id: t.dimo_segment_id,
        })),
        uniqueTripId,
        p21WorkItemCount,
        rcObservationCount: obs[0]?.c ?? 0,
        gpsObservationCount: gps[0]?.c ?? 0,
      };
    });
  } finally {
    await prisma.$disconnect();
  }

  const payload = buildP22CPayload(repoRoot, headSha, pr, dbEvidence);
  fs.writeFileSync(path.join(outDir, 'P22C_RD003_SESSION_TRIP_AUDIT.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'P22C_AUDIT_REPORT.md'), renderReport(payload));
  fs.writeFileSync(
    path.join(outDir, 'P22C_CLIP_SYNC_TABLE.md'),
    `# RD003 clip sync table\n\n${loadClipSyncRows(repoRoot)
      .map(
        (c) =>
          `- **${c.clipId}** (${c.fileName}): candidate=${c.candidateStartUtc ?? 'n/a'} aligned=${c.alignedClipStartUtcHfHistorical ?? 'n/a'} status=${c.alignmentStatus}`,
      )
      .join('\n')}\n`,
  );

  console.log(JSON.stringify({ ok: true, p22cResult: payload.p22cResult, uniqueTrip: payload.sessionToTrip.uniqueTripBinding, outDir }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
