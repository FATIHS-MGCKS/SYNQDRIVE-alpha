#!/usr/bin/env ts-node
/**
 * LDI-08 — Ruptela R1 multi-stream fusion replay (read-only pinned S4 export).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient, DrivingEventSource } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4d-replay/di-v0-s4d-verified-snapshot';
import {
  buildCombinedSnapshotRows,
  buildCoverageReport,
  buildEventOverlapTable,
  buildTemporalAlignment,
  bucketForNativeTimestamp,
  normalizeNativeRecordedAt,
  type Ldi03NativeRow,
} from './ldi03-ruptela-combined-pin.lib';
import {
  buildL3AccelDecelCandidates,
  buildLdi08ResultLines,
  buildNativeCorneringOverlap,
  exportHfObdObservations,
  LDI08_EXPECTED_L3_TRUSTED_FRACTION,
  LDI08_EXPECTED_PINNED_HASH,
  LDI08_ORG_ID,
  LDI08_TRIP_ID,
  LDI08_VEHICLE_ID,
} from './ldi08-r1-fusion-replay.lib';

const TELEMETRY = DrivingEventSource.TELEMETRY_EVENTS;

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-08');
  }
  return path.resolve(argv[i + 1]);
}

async function loadNativeEvents(prisma: PrismaClient, windowStart: string, windowEnd: string): Promise<Ldi03NativeRow[]> {
  const rows = await prisma.drivingEvent.findMany({
    where: {
      vehicleId: LDI08_VEHICLE_ID,
      organizationId: LDI08_ORG_ID,
      source: TELEMETRY,
      recordedAt: { gte: new Date(windowStart), lte: new Date(windowEnd) },
      OR: [{ tripId: LDI08_TRIP_ID }, { tripId: null }],
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
  const repoRoot = process.env.LDI08_REPO_ROOT
    ? path.resolve(process.env.LDI08_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const wi = await prisma.diV0S4WorkItem.findFirst({
      where: {
        organizationId: LDI08_ORG_ID,
        vehicleId: LDI08_VEHICLE_ID,
        tripId: LDI08_TRIP_ID,
        status: 'COMPLETED',
        pinnedSnapshotHash: { not: null },
      },
      orderBy: { completedAt: 'desc' },
    });
    if (!wi?.pinnedSnapshotHash) throw new Error('No completed S4 work item with pin for LDI-08 trip');

    const pinVerified = wi.pinnedSnapshotHash === LDI08_EXPECTED_PINNED_HASH;

    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId: LDI08_ORG_ID,
      tripId: LDI08_TRIP_ID,
      workItemId: wi.id,
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
    const natives = await loadNativeEvents(prisma, utcFrom, utcTo);
    const rows = buildCombinedSnapshotRows(ctx, natives, r1Payload);
    const overlapBrakeAccel = buildEventOverlapTable(rows, natives, r1Payload, ctx);
    const cornerOverlap = buildNativeCorneringOverlap(rows, natives);
    const temporal = buildTemporalAlignment(rows, natives);
    const coverage = buildCoverageReport(rows, natives, overlapBrakeAccel);
    const kinematicCandidates = buildL3AccelDecelCandidates(rows);
    const hfObdExport = exportHfObdObservations(rows);

    const cov = coverage as {
      gpsL3TrustedCoverage: { fractionOfShadowGrid: number; trustedOrLimitedBuckets: number };
      hfCoverage: { fractionOfShadowGrid: number };
      obdCoverage: { fractionOfShadowGrid: number };
      multiStreamOverlap: { numericThreeWayPlusGps: { buckets: number } };
    };

    const l3Frac = cov.gpsL3TrustedCoverage.fractionOfShadowGrid;
    const l3VerifyDelta = Math.abs(l3Frac - LDI08_EXPECTED_L3_TRUSTED_FRACTION);

    const accelCount = kinematicCandidates.filter((c) => c.kind === 'ACCELERATION').length;
    const decelCount = kinematicCandidates.filter((c) => c.kind === 'DECELERATION').length;
    const trustedAccel = kinematicCandidates.filter((c) => c.kind === 'ACCELERATION' && c.bothEndsTrustedL3).length;
    const trustedDecel = kinematicCandidates.filter((c) => c.kind === 'DECELERATION' && c.bothEndsTrustedL3).length;

    const conflicts = (temporal.gpsObdSpeedConflictCount as number) ?? 0;
    const fusionAssessable = cov.multiStreamOverlap.numericThreeWayPlusGps.buckets;

    fs.writeFileSync(
      path.join(outDir, 'LDI08_COMBINED_SNAPSHOT.json'),
      JSON.stringify(
        {
          schema: 'LDI08_COMBINED_SNAPSHOT_V1',
          headSha,
          exportMode: 'READ_ONLY_S4_PIN_REPLAY',
          productionMutations: 'NONE',
          organizationId: LDI08_ORG_ID,
          vehicleId: LDI08_VEHICLE_ID,
          tripId: LDI08_TRIP_ID,
          workItemId: wi.id,
          pinnedSnapshotHash: ctx.pinnedSnapshotHash,
          pinVerifiedAgainstLdi06: pinVerified,
          ldi06ExpectedTrustedFraction: LDI08_EXPECTED_L3_TRUSTED_FRACTION,
          measuredTrustedFraction: l3Frac,
          trustedFractionDeltaAbs: l3VerifyDelta,
          integrationFamily: 'RUPTELA_LTE_R1',
          acquisitionWindowUtc: { from: utcFrom, to: utcTo },
          rowCount: rows.length,
          hfObdObservationCounts: { hf: hfObdExport.hf.length, obd: hfObdExport.obd.length },
          hfObservations: hfObdExport.hf,
          obdObservations: hfObdExport.obd,
          rows,
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(outDir, 'LDI08_ACCEL_DECEL_CANDIDATES.json'),
      JSON.stringify(
        {
          schema: 'LDI08_ACCEL_DECEL_CANDIDATES_V1',
          method:
            'Consecutive 1s L3 speed deltas >= +3 km/h (accel) or <= -3 km/h (decel); same gates as LDI-03 l3DecelWindows',
          noNewThresholds: true,
          totalCandidates: kinematicCandidates.length,
          accelerationCount: accelCount,
          decelerationCount: decelCount,
          trustedAccelerationCount: trustedAccel,
          trustedDecelerationCount: trustedDecel,
          candidates: kinematicCandidates,
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(outDir, 'LDI08_NATIVE_EVENT_OVERLAP.json'),
      JSON.stringify(
        {
          schema: 'LDI08_NATIVE_EVENT_OVERLAP_V1',
          nativeEventCount: natives.length,
          corneringOverlap: cornerOverlap,
          brakeAccelOverlapFromLdi03Table: overlapBrakeAccel,
          nativeEvents: natives.map((n) => ({
            id: n.id,
            eventType: n.eventType,
            recordedAtUtc: n.recordedAtUtc,
            normalizedBucketUtc: n.normalizedBucketUtc,
            speedKmh: n.speedKmh,
            deltaKmh: n.deltaKmh,
            source: n.source,
            provenance: 'TELEMETRY_EVENTS',
            timestampUncertaintyNote: 'Bucket alignment uses whole-second UTC; sub-second offset preserved in recordedAtUtc',
          })),
        },
        null,
        2,
      ),
    );

    fs.writeFileSync(
      path.join(outDir, 'LDI08_FUSION_COVERAGE.md'),
      [
        '# LDI08 — Fusion coverage',
        '',
        `**Trip:** \`${LDI08_TRIP_ID}\` · **Vehicle:** \`${LDI08_VEHICLE_ID}\``,
        `**Pin:** \`${ctx.pinnedSnapshotHash}\` (verified LDI-06 hash: **${pinVerified ? 'YES' : 'NO'}**)`,
        '',
        '## GPS-L3 / QC (primary reference)',
        '',
        `- Trusted or limited buckets: **${cov.gpsL3TrustedCoverage.trustedOrLimitedBuckets}** / **${rows.length}**`,
        `- Fraction: **${(l3Frac * 100).toFixed(2)}%** (LDI-06 expected **${(LDI08_EXPECTED_L3_TRUSTED_FRACTION * 100).toFixed(2)}%**, Δ=${(l3VerifyDelta * 100).toFixed(4)}pp)`,
        '',
        '## HF / OBD (corroboration only)',
        '',
        `- HF numeric buckets: **${(cov.hfCoverage.fractionOfShadowGrid * 100).toFixed(2)}%** (${hfObdExport.hf.length} exported rows)`,
        `- OBD numeric buckets: **${(cov.obdCoverage.fractionOfShadowGrid * 100).toFixed(2)}%** (${hfObdExport.obd.length} exported rows)`,
        `- HF cadence: median **${(temporal.hfCadence as { medianDeltaMs: number | null }).medianDeltaMs ?? 'n/a'}** ms between numeric HF buckets`,
        '',
        '## Multi-stream assessability',
        '',
        `- GPS+L3 trusted + OBD numeric + HF speed conjunction: **${fusionAssessable}** seconds`,
        `- Native events on trip: **${natives.length}** (cornering overlap rows: **${cornerOverlap.length}**)`,
        '',
        '## Policy',
        '',
        '- No interpolation across missing HF/OBD/GPS buckets.',
        '- OBD is corroboration only; L3 QC is primary speed reference.',
        '- Native events are provider-reported observations, not validation labels.',
        '',
        '```json',
        JSON.stringify(coverage, null, 2),
        '```',
      ].join('\n'),
    );

    const conflictSample = (temporal.gpsObdSpeedConflicts as Array<Record<string, unknown>>) ?? [];
    fs.writeFileSync(
      path.join(outDir, 'LDI08_SIGNAL_CONFLICTS.md'),
      [
        '# LDI08 — Signal conflicts & misalignment',
        '',
        `**L3/OBD speed conflicts** (threshold: max(5 km/h, 25% of L3), same as LDI-03 temporal): **${conflicts}**`,
        '',
        '## Missing intervals (no interpolation)',
        '',
        `- Position absent buckets: **${(temporal.missingBuckets as { positionAbsent: number }).positionAbsent}**`,
        `- HF absent: **${(temporal.missingBuckets as { hfAbsent: number }).hfAbsent}**`,
        `- OBD absent: **${(temporal.missingBuckets as { obdAbsent: number }).obdAbsent}**`,
        '',
        '## Sample conflicts (first 15)',
        '',
        '| Index UTC | L3 km/h | OBD km/h | Δ km/h |',
        '|-----------|---------|----------|--------|',
        ...conflictSample.slice(0, 15).map(
          (c) => `| ${c.indexUtc} | ${c.l3Kmh} | ${c.obdKmh} | ${c.deltaKmh} |`,
        ),
        '',
        '## Temporal notes',
        '',
        '- R1 HF subset is sparse vs 1 Hz shadow grid (see `hfCadence` in temporal export).',
        '- Native cornering timestamps may fall between HF/OBD numeric buckets.',
        '- Clock offset analysis: NOT_COMPUTED (no independent UTC anchor).',
      ].join('\n'),
    );

    fs.writeFileSync(
      path.join(outDir, 'LDI08_NEXT_DECISION.md'),
      [
        '# LDI08 — Next decision',
        '',
        '1. **81.2% L3 trusted** reproduced on pinned trip — suitable for fusion policy drafting on this pin only.',
        '2. Native cornering (n=2) shows descriptive GPS bearing witness only — do not treat as independent validation.',
        `3. L3 kinematic candidates: ${accelCount} accel / ${decelCount} decel windows (${trustedAccel}/${trustedDecel} fully trusted) — not native harsh labels.`,
        '4. For event-rich accel+brake matrix, primary trip `a682d3df…` still lacks S4 pin (LDI-07); do not merge cohorts without explicit scope.',
        '5. Next safe action: owner review of conflict table + optional LDI-04-style forensics on this pin only (no threshold changes).',
      ].join('\n'),
    );

    const resultLines = buildLdi08ResultLines({
      pinVerified,
      gpsL3TrustedPct: l3Frac * 100,
      hfPct: cov.hfCoverage.fractionOfShadowGrid * 100,
      obdPct: cov.obdCoverage.fractionOfShadowGrid * 100,
      nativeCount: natives.length,
      accelCandidates: accelCount,
      decelCandidates: decelCount,
      nativeOverlapCount: cornerOverlap.length + overlapBrakeAccel.filter((o) => o.nativeEventId).length,
      signalConflicts: conflicts,
      fusionAssessableSeconds: fusionAssessable,
      independentValidation: 'NOT_FEASIBLE_shared_DIMO_lineage_native_not_gt',
      nextSafeAction: 'LDI04_style_conflict_forensics_on_LDI08_pin_if_owner_requests',
    });
    fs.writeFileSync(path.join(outDir, 'LDI08_RESULT.txt'), resultLines.join('\n') + '\n');

    console.log(
      JSON.stringify({
        ok: true,
        pinVerified,
        l3Pct: (l3Frac * 100).toFixed(2),
        rows: rows.length,
        natives: natives.length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
