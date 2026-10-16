#!/usr/bin/env ts-node
/**
 * EXP021 EV Ground Truth — forensic supplement v1 (does not modify v0 export artifacts).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { readRawDetectionMeta } from '../../src/modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { buildEvGroundTruthPerSecondReplay } from './exp021-ev-ground-truth-baseline.lib';
import { dateToBucketLabel } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-classify';
import type { DiV0TripSpeedQualityShadowRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/build-di-v0-trip-speed-quality-projection.v1';
import {
  BASELINE_EXECUTION_SHA,
  REF,
  VIDEO_ANCHOR,
  buildTachoZeroRowAbsentReport,
  decodeDimoSegmentId,
  loadKompaktTachoZeroSeconds,
  parsePinnedPositionBucketsFromSnapshotRow,
  segmentIdGenerationCodePath,
  sha256Hex,
} from './exp021-ev-ground-truth-forensic-supplement-v1.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(filePath: string): string {
  return sha256Hex(fs.readFileSync(filePath));
}

function gitExporterProvenance(repoRoot: string): Record<string, unknown> {
  const relScripts = [
    'backend/scripts/ops/exp021-ev-ground-truth-forensic-supplement-v1.ts',
    'backend/scripts/ops/exp021-ev-ground-truth-forensic-supplement-v1.lib.ts',
    'backend/scripts/ops/exp021-ev-ground-truth-forensic-export.ts',
    'backend/scripts/ops/exp021-ev-ground-truth-forensic-export.lib.ts',
  ];
  const head = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const porcelain = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf8' }).trim();
  const fileHashes: Record<string, string> = {};
  for (const rel of relScripts) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) fileHashes[rel] = sha256File(abs);
  }
  return {
    exporterGitHeadSha: { value: head, epistemic: 'CONFIRMED', source: 'git rev-parse HEAD at export time' },
    exporterWorkingTreePorcelain: {
      value: porcelain || '(clean)',
      epistemic: 'CONFIRMED',
      source: 'git status --porcelain at export time',
    },
    exporterScriptContentSha256: {
      value: fileHashes,
      epistemic: 'CONFIRMED',
      source: 'sha256 of exporter script files on disk at export time',
    },
  };
}

function readProductionRuntimeShaObservation(): Record<string, unknown> {
  try {
    const raw = execSync(
      "ssh -o BatchMode=yes synqdrive-admin@srv1374778.hstgr.cloud 'set -a && source /opt/synqdrive/shared/backend.env && set +a && printf %s \"${SYNQDRIVE_DEPLOYED_GIT_SHA:-}\"'",
      { encoding: 'utf8', timeout: 20000 },
    ).trim();
    const alt = execSync(
      "ssh -o BatchMode=yes synqdrive-admin@srv1374778.hstgr.cloud 'set -a && source /opt/synqdrive/shared/backend.env && set +a && printf %s \"${SYNQDRIVE_DEPLOY_GIT_SHA:-}\"'",
      { encoding: 'utf8', timeout: 20000 },
    ).trim();
    return {
      observedRuntimeDeployedGitSha: raw
        ? { value: raw, epistemic: 'CONFIRMED', source: 'Production VPS backend.env SYNQDRIVE_DEPLOYED_GIT_SHA (read-only SSH)' }
        : { value: null, epistemic: 'UNKNOWN', source: 'env empty' },
      observedRuntimeDeployGitShaAlt: alt
        ? { value: alt, epistemic: 'CONFIRMED', source: 'Production VPS backend.env SYNQDRIVE_DEPLOY_GIT_SHA (read-only SSH)' }
        : { value: null, epistemic: 'UNKNOWN', source: 'env empty' },
      publicHealthEndpointGitSha: {
        value: null,
        epistemic: 'UNKNOWN',
        source: 'https://app.synqdrive.eu/api/v1/health returns no git sha field (checked 2026-10-16)',
      },
    };
  } catch (e) {
    return {
      observedRuntimeDeployedGitSha: {
        value: null,
        epistemic: 'UNKNOWN',
        source: `SSH read failed: ${e instanceof Error ? e.message : String(e)}`,
      },
    };
  }
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const observedAtUtc = new Date().toISOString();
  const repoRoot = path.resolve(__dirname, '../../..');
  const organizationId = process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId;
  const tripId = process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId;
  const workItemId = process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId;

  const productionShaEnv = process.env.EXP021_EV_GT_PRODUCTION_SHA ?? null;

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

    const tripRows = await prisma.$queryRaw<
      Array<{
        start_time: Date;
        end_time: Date | null;
        dimo_segment_id: string | null;
        raw_detection_meta: unknown;
        start_detection_mode: string | null;
        created_at: Date;
      }>
    >`
      SELECT start_time, end_time, dimo_segment_id, raw_detection_meta, start_detection_mode, created_at
      FROM vehicle_trips WHERE id = ${tripId} LIMIT 1`;
    const trip = tripRows[0];
    if (!trip?.end_time || !trip.dimo_segment_id) throw new Error('trip row incomplete');

    const snapshotRows = await prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        boundary_fingerprint: string;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
        channel_manifest: unknown;
        payload_gzip: Buffer;
        uncompressed_bytes: number | bigint;
        snapshot_hash: string;
      }>
    >`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint,
        acquisition_window_start, acquisition_window_end, channel_manifest,
        payload_gzip, uncompressed_bytes, snapshot_hash
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;
    const snap = snapshotRows[0];
    if (!snap) throw new Error('pinned snapshot missing');

    const positionByLabel = parsePinnedPositionBucketsFromSnapshotRow(
      snap,
      ctx.pinnedSnapshotHash,
      ctx.workItem!.source_family as DiV0S4SourceFamily,
    );
    const rawMeta = readRawDetectionMeta(trip.raw_detection_meta);
    const decoded = decodeDimoSegmentId(trip.dimo_segment_id);

    const perSecond = buildEvGroundTruthPerSecondReplay(ctx);
    const posQc = new Map(ctx.evidence.positions.map((p) => [p.bucketLabel, p]));
    const shadowMap = new Map<string, DiV0TripSpeedQualityShadowRow>();
    for (const r of ctx.shadowIntervals) shadowMap.set(dateToBucketLabel(r.referenceTime), r);

    const tacho = loadKompaktTachoZeroSeconds(repoRoot);

    const segmentTrace = {
      schema: 'EXP021_EV_GT_DIMO_SEGMENT_TRACE_V1',
      observedAtUtc,
      persistedFacts: {
        dimoSegmentId: {
          value: trip.dimo_segment_id,
          epistemic: 'CONFIRMED',
          source: 'vehicle_trips.dimo_segment_id (Production read-only)',
        },
        tripStartUtc: {
          value: trip.start_time.toISOString(),
          epistemic: 'CONFIRMED',
          source: 'vehicle_trips.start_time',
        },
        tripEndUtc: {
          value: trip.end_time.toISOString(),
          epistemic: 'CONFIRMED',
          source: 'vehicle_trips.end_time',
        },
        startDetectionMode: {
          value: trip.start_detection_mode,
          epistemic: 'CONFIRMED',
          source: 'vehicle_trips.start_detection_mode',
        },
        tripCreatedAtUtc: {
          value: trip.created_at.toISOString(),
          epistemic: 'CONFIRMED',
          source: 'vehicle_trips.created_at',
        },
        cusumSegmentStartUtc: {
          value: (rawMeta.cusumSegmentStart as string) ?? null,
          epistemic: rawMeta.cusumSegmentStart ? 'CONFIRMED' : 'UNKNOWN',
          source: 'vehicle_trips.raw_detection_meta.cusumSegmentStart',
        },
        lifecycleStartEpisode: {
          value: rawMeta.lifecycleRecovery ?? null,
          epistemic: rawMeta.lifecycleRecovery ? 'CONFIRMED' : 'UNKNOWN',
          source: 'vehicle_trips.raw_detection_meta.lifecycleRecovery',
        },
        decodedSegmentId: {
          value: decoded,
          epistemic: decoded.startUtc ? 'CONFIRMED' : 'INFERRED',
          source: 'regex decode of dimo-seg-{tokenId}-{epochMs} per DimoSegmentsService.buildSegmentId',
        },
      },
      codePath: segmentIdGenerationCodePath(),
      conclusions: [
        {
          statement:
            'Persisted dimo_segment_id epoch matches vehicle_trips.start_time to the second.',
          epistemic: decoded.startUtc === trip.start_time.toISOString() ? 'CONFIRMED' : 'CONTRADICTED',
          basis: ['persistedFacts.decodedSegmentId', 'persistedFacts.tripStartUtc'],
        },
        {
          statement:
            'Segment id format matches repository buildSegmentId(tokenId, providerStartTimestamp) — id is a deterministic function of DIMO segment start timestamp, not an independent UUID.',
          epistemic: 'INFERRED',
          basis: ['codePath.buildSegmentId', 'persistedFacts.dimoSegmentId'],
        },
        {
          statement:
            'Original DIMO GraphQL segment payload (start/end signals, mechanism, startedBeforeRange) for this trip is NOT present in pinned S4 snapshot or driving_evidence for this trip.',
          epistemic: 'CONFIRMED',
          basis: [
            'driving_evidence query: 1 row, no dimo-seg-validate idempotency key',
            'pinned S4 POSITION channel only (no segment payload channel)',
          ],
        },
        {
          statement:
            'lifecycleRecovery.startEpisode.candidateStartAt MUST NOT be read as calibrated physical departure or pure FSM recognition delay without independent timing evidence.',
          epistemic: 'CONFIRMED',
          basis: ['owner video protocol', 'missing payload / cross-sensor sync'],
        },
      ],
      cacheIngestEvidenceReadOnly: {
        clickhouseTripSegmentCandidates: {
          epistemic: 'UNKNOWN',
          source:
            'clickhouse-client unavailable on Production VPS shell during export; no row exported',
          note: 'Ignition repair candidates table exists in schema but was not queried successfully.',
        },
        drivingEvidenceDimoSegmentValidation: {
          epistemic: 'CONFIRMED',
          source: 'driving_evidence WHERE trip_id',
          value: 'No dimo-seg-validate:* idempotency row for this trip (segment validation diagnostic not persisted or disabled).',
        },
        pinnedS4Snapshot: {
          epistemic: 'CONFIRMED',
          source: 'di_v0_s4_evidence_snapshots',
          snapshotHash: ctx.pinnedSnapshotHash,
          positionBucketCount: positionByLabel.size,
          channelManifest: snap.channel_manifest,
        },
      },
      remainingGaps: [
        'Provider segment GraphQL JSON at trip-create instant (requires authorized DIMO fetch — not done).',
        'Telemetry ingest receive-time per first position row (not in pinned export).',
        'ClickHouse trip_segment_candidates rows for this vehicle/window (tooling gap on VPS).',
      ],
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };

    const videoAnchor = {
      schema: 'EXP021_EV_GT_VIDEO_ANCHOR_SEMANTICS_V1',
      ...VIDEO_ANCHOR,
      ownerStatements: {
        reverseManeuverAtVideoStart: {
          epistemic: 'CONFIRMED',
          source: 'owner + external-video-review-kompakt Bericht.md / ZUERST_LESEN',
          note: 'Qualitative departure context; not a sub-second timestamp.',
        },
        exactFirstMotionAtPtsZero: {
          epistemic: 'UNKNOWN',
          source: 'not calibrated in kompakt review',
          note: 'Do NOT equate first visible clock label or video file t=0 with proven first physical motion.',
        },
      },
      offsets: {
        persistedStartToFirstVisibleClockLabelSeconds: 101,
        persistedStartToLifecycleCandidateStartSeconds: 146.989,
      },
    };

    const rowAbsent = {
      schema: 'EXP021_EV_GT_ROW_ABSENT_CHAIN_V1',
      observedAtUtc,
      tachoZeroAnnotationCoverage: {
        all135Seconds: buildTachoZeroRowAbsentReport({
          labels: tacho.all135,
          subsetTag: 'ALL_135',
          perSecond,
          positionByLabel,
          ctx,
          shadowMap,
          posQc,
        }),
        subset125Seconds: buildTachoZeroRowAbsentReport({
          labels: tacho.subset125,
          subsetTag: 'SUBSET_125',
          perSecond,
          positionByLabel,
          ctx,
          shadowMap,
          posQc,
        }),
        extra10SecondsOutside125: buildTachoZeroRowAbsentReport({
          labels: tacho.extra10,
          subsetTag: 'EXTRA_10',
          perSecond,
          positionByLabel,
          ctx,
          shadowMap,
          posQc,
        }),
      },
      haltWindowsUtc125: tacho.subset125.length,
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };

    const versionProvenance = {
      schema: 'EXP021_EV_GT_VERSION_PROVENANCE_V1',
      observedAtUtc,
      baselineExecutionSha: {
        value: BASELINE_EXECUTION_SHA,
        epistemic: 'CONFIRMED',
        source: 'pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json productionSha / frozen replay capture',
        role: 'Code+DB state used to build immutable pre-deploy replay (unchanged).',
      },
      productionShaEnvReference: {
        value: productionShaEnv,
        epistemic: 'CONFIRMED',
        source: 'EXP021_EV_GT_PRODUCTION_SHA env at export invocation',
        role: 'Reference label only — NOT independent proof of live runtime revision.',
      },
      exporterCode: gitExporterProvenance(repoRoot),
      runtimeObservation: readProductionRuntimeShaObservation(),
      priorExportArtifactsUnchanged: {
        epistemic: 'CONFIRMED',
        source: 'forensic-readonly-exports-2026-10-16/ left byte-stable; this supplement is additive',
      },
    };

    fs.mkdirSync(outDir, { recursive: true });
    const files = {
      segmentTrace: 'DIMO_SEGMENT_TRACE_SUPPLEMENT_V1.json',
      videoAnchor: 'VIDEO_ANCHOR_SEMANTICS_SUPPLEMENT_V1.json',
      rowAbsent: 'ROW_ABSENT_CHAIN_SUPPLEMENT_V1.json',
      versionProvenance: 'VERSION_PROVENANCE_SUPPLEMENT_V1.json',
    };
    const paths = Object.fromEntries(
      Object.entries(files).map(([k, f]) => [k, path.join(outDir, f)]),
    ) as Record<string, string>;

    fs.writeFileSync(paths.segmentTrace, JSON.stringify(segmentTrace, null, 2));
    fs.writeFileSync(paths.videoAnchor, JSON.stringify(videoAnchor, null, 2));
    fs.writeFileSync(paths.rowAbsent, JSON.stringify(rowAbsent, null, 2));
    fs.writeFileSync(paths.versionProvenance, JSON.stringify(versionProvenance, null, 2));

    const manifest = {
      schema: 'EXP021_EV_GT_FORENSIC_SUPPLEMENT_MANIFEST_V1',
      supplementVersion: 'v1',
      observedAtUtc,
      priorExportPreserved: '../forensic-readonly-exports-2026-10-16/',
      artifacts: Object.fromEntries(
        Object.entries(paths).map(([k, p]) => [
          k,
          { path: path.basename(p), sha256: sha256File(p) },
        ]),
      ),
      productionMutations: 'NONE',
      providerCalls: 'NONE',
    };
    const manifestPath = path.join(outDir, 'FORENSIC_SUPPLEMENT_MANIFEST_V1.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const sums = [
      `${sha256File(manifestPath)}  ${path.basename(manifestPath)}`,
      ...Object.values(paths).map((p) => `${sha256File(p)}  ${path.basename(p)}`),
    ].join('\n');
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sums}\n`);

    process.stdout.write(JSON.stringify({ ok: true, outDir, manifest }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
