#!/usr/bin/env ts-node
/**
 * EXP021 EV Ground Truth — forensic supplement v2 (additive; v0/v1 byte-preserving).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { DiV0S4SourceFamily } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  evaluateEvGtAdmission,
  evaluateEvGtProductReadGate,
} from './exp021-ev-ground-truth-admission.lib';
import { buildDiV0S4BoundaryFingerprint } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-identity';
import {
  readCurrentBoundaryRepairGeneration,
  readRawDetectionMeta,
} from '../../src/modules/vehicle-intelligence/trips/boundary-repair.state.util';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-policy.version';
import { REF } from './exp021-ev-ground-truth-forensic-supplement-v1.lib';
import {
  buildRejectedVsMissingAnalysis,
  loadFullPositionSnapshotExport,
  loadTachoZeroSets,
  readPostDeployManifestSummary,
  sha256File,
} from './exp021-ev-ground-truth-forensic-supplement-v2.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function queryClickHouseTripSegmentCandidatesViaProductionHttp(
  vehicleId: string,
  windowFromUtc: string,
  windowToUtc: string,
): Record<string, unknown> {
  const query = `
SELECT vehicle_id, segment_start, segment_end, duration_ms, confidence, repair_tier, trip_id, computed_at
FROM trip_segment_candidates
WHERE vehicle_id = '${vehicleId}'
  AND segment_start >= parseDateTime64BestEffort('${windowFromUtc}')
  AND segment_start < parseDateTime64BestEffort('${windowToUtc}')
ORDER BY segment_start ASC
FORMAT JSONEachRow`.trim();

  const remote = `#!/usr/bin/env bash
set -eo pipefail
set -a
source /opt/synqdrive/shared/backend.env
set +a
read -r -d '' QUERY <<'EOSQL' || true
${query}
EOSQL
curl -sf -u "\${CLICKHOUSE_USER}:\${CLICKHOUSE_PASSWORD}" "\${CLICKHOUSE_URL}/?database=\${CLICKHOUSE_DATABASE}" --data-binary "$QUERY"
`;

  try {
    const out = execSync(
      `ssh -o BatchMode=yes -o ConnectTimeout=25 synqdrive-admin@srv1374778.hstgr.cloud bash -s`,
      {
        input: remote,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    ).trim();
    if (!out) {
      return {
        accessMethod: 'Production CLICKHOUSE_URL HTTP (read-only SELECT via curl on VPS)',
        epistemic: 'CONFIRMED',
        rowCount: 0,
        rows: [],
        note: 'empty result set',
      };
    }
    if (out.startsWith('{') && out.includes('error')) {
      const err = JSON.parse(out) as { error: string; detail?: string };
      return {
        accessMethod: 'Production CLICKHOUSE_URL HTTP (read-only SELECT via curl on VPS)',
        epistemic: 'CONFIRMED',
        blocker: err.error,
        detail: err.detail ?? null,
        rows: [],
      };
    }
    const rows = out
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    return {
      accessMethod: 'Production CLICKHOUSE_URL HTTP (read-only SELECT via curl on VPS)',
      epistemic: 'CONFIRMED',
      rowCount: rows.length,
      rows,
    };
  } catch (e) {
    return {
      accessMethod: 'Production docker exec synqdrive-clickhouse clickhouse-client',
      epistemic: 'CONFIRMED',
      blocker: 'SSH_OR_QUERY_FAILED',
      detail: e instanceof Error ? e.message : String(e),
      rows: [],
    };
  }
}

async function loadPostDeployLiveTripState(
  prisma: PrismaClient,
  organizationId: string,
  tripId: string,
  workItemBoundaryFingerprint: string | null,
): Promise<Record<string, unknown>> {
  const rows = await prisma.$queryRaw<
    Array<{
      trip_status: string;
      start_time: Date;
      end_time: Date | null;
      dimo_segment_id: string | null;
      merge_parent_trip_id: string | null;
      raw_detection_meta: unknown;
      detection_state: string | null;
      active_trip_id: string | null;
      projection_id: string | null;
      lifecycle_status: string | null;
      proposed_repairs: bigint;
    }>
  >`
    SELECT t.trip_status::text AS trip_status, t.start_time, t.end_time,
      t.dimo_segment_id, t.merge_parent_trip_id, t.raw_detection_meta,
      dts.state::text AS detection_state, dts.active_trip_id::text AS active_trip_id,
      p.id::text AS projection_id, p.lifecycle_status::text AS lifecycle_status,
      (SELECT count(*)::bigint FROM trip_repairs r WHERE r.trip_id = t.id AND r.status = 'PROPOSED') AS proposed_repairs
    FROM vehicle_trips t
    LEFT JOIN vehicle_trip_detection_states dts ON dts.vehicle_id = t.vehicle_id
    LEFT JOIN di_v0_trip_speed_quality_projections_v1 p
      ON p.trip_id = t.id AND p.qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
      AND p.lifecycle_status = 'CURRENT'
    WHERE t.id = ${tripId}
    LIMIT 1`;

  const row = rows[0];
  if (!row?.end_time) {
    return { epistemic: 'UNKNOWN', blocker: 'trip row missing or open' };
  }

  const scope = {
    organizationId,
    vehicleId: REF.vehicleId,
    tripId,
    tripStatus: row.trip_status,
    startTime: row.start_time,
    endTime: row.end_time,
    dimoSegmentId: row.dimo_segment_id,
    mergeParentTripId: row.merge_parent_trip_id,
    rawDetectionMeta: row.raw_detection_meta,
    detectionState: row.detection_state,
    activeTripId: row.active_trip_id,
    proposedBoundaryRepairCount: Number(row.proposed_repairs),
  };

  const liveFp = buildDiV0S4BoundaryFingerprint({
    organizationId,
    vehicleId: REF.vehicleId,
    tripId,
    tripStatus: row.trip_status,
    startTime: row.start_time,
    endTime: row.end_time,
    dimoSegmentId: row.dimo_segment_id,
    mergeParentTripId: row.merge_parent_trip_id,
    boundaryRepairGeneration: readCurrentBoundaryRepairGeneration(row.raw_detection_meta),
  });

  const admission = evaluateEvGtAdmission(scope);

  const expectedWiFp = workItemBoundaryFingerprint ?? liveFp;
  const productGate = evaluateEvGtProductReadGate(scope, expectedWiFp);

  const projectionReadable =
    row.projection_id != null && productGate.ok
      ? 'PRODUCT_READ_GATE_PASS'
      : row.projection_id != null
        ? 'CURRENT_ROW_EXISTS_PRODUCT_READ_BLOCKED'
        : 'NO_CURRENT_PROJECTION';

  return {
    epistemic: 'CONFIRMED',
    source: 'Production Postgres read-only at supplement v2 export time',
    observedPhase: 'POST_DEPLOY_LIVE_READ',
    preDeployArtifactsUnchanged: true,
    tripStatus: row.trip_status,
    boundaryFingerprintWorkItem: workItemBoundaryFingerprint,
    boundaryFingerprintLive: liveFp,
    boundaryFingerprintMatch: workItemBoundaryFingerprint === liveFp,
    admission,
    productReadBoundaryGate: productGate,
    currentProjection: {
      projectionId: row.projection_id,
      lifecycleStatus: row.lifecycle_status,
      readability: projectionReadable,
    },
  };
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const observedAtUtc = new Date().toISOString();
  const repoRoot = path.resolve(__dirname, '../../..');
  const organizationId = process.env.EXP021_EV_GT_ORG_ID ?? REF.organizationId;
  const tripId = process.env.EXP021_EV_GT_TRIP_ID ?? REF.tripId;
  const workItemId = process.env.EXP021_EV_GT_WORK_ITEM_ID ?? REF.workItemId;
  const vehicleId = process.env.EXP021_EV_GT_VEHICLE_ID ?? REF.vehicleId;

  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

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
      }>
    >`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint,
        acquisition_window_start, acquisition_window_end, channel_manifest,
        payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${organizationId} AND trip_id = ${tripId}
        AND snapshot_hash = ${ctx.pinnedSnapshotHash}
      LIMIT 1`;
    const snap = snapshotRows[0];
    if (!snap) throw new Error('pinned snapshot missing');

    const positionExport = loadFullPositionSnapshotExport(
      snap,
      ctx.pinnedSnapshotHash,
      ctx.workItem!.source_family as DiV0S4SourceFamily,
    );

    const tripDimoRows = await prisma.$queryRaw<Array<{ dimo_segment_id: string | null }>>`
      SELECT dimo_segment_id FROM vehicle_trips WHERE id = ${tripId} LIMIT 1`;
    const dimoSegmentIdPersisted = tripDimoRows[0]?.dimo_segment_id ?? null;

    const tacho = loadTachoZeroSets(repoRoot);
    const analysisAll135 = buildRejectedVsMissingAnalysis(positionExport, tacho.all135, 'ALL_135_TACHO_ZERO');
    const analysisLegacy125 = buildRejectedVsMissingAnalysis(positionExport, tacho.subset125, 'LEGACY_125_SUBSET');

    const positionArtifact = {
      schema: 'EXP021_POSITION_SNAPSHOT_INPUT_AUDIT_V2',
      observedAtUtc,
      pinnedSnapshotHash: ctx.pinnedSnapshotHash,
      epistemic: 'CONFIRMED',
      source: 'di_v0_s4_evidence_snapshots POSITION channel via parseDiV0PositionSnapshot',
      ...positionExport,
      rejectedVsMissing: {
        all135TachoZero: analysisAll135,
        legacy125Subset: analysisLegacy125,
      },
    };

    const tripWindowFrom = positionExport.window.fromUtc;
    const tripWindowTo = positionExport.window.toUtcExclusive;
    const segmentCandidates = queryClickHouseTripSegmentCandidatesViaProductionHttp(
      vehicleId,
      tripWindowFrom,
      tripWindowTo,
    );

    const postDeployCommitted = readPostDeployManifestSummary(repoRoot);
    const postDeployLive = await loadPostDeployLiveTripState(
      prisma,
      organizationId,
      tripId,
      ctx.workItem?.boundary_fingerprint ?? null,
    );

    const rejectedFlag =
      analysisAll135.aggregateRejectedExplainsRowAbsentAmongAnnotated === 'YES'
        ? 'YES'
        : analysisAll135.aggregateRejectedExplainsRowAbsentAmongAnnotated === 'NO'
          ? 'NO'
          : 'UNKNOWN';

    let segmentEvidence = 'CLICKHOUSE_TRIP_SEGMENT_CANDIDATES_NOT_EXPORTED';
    if (segmentCandidates.blocker) {
      segmentEvidence = `BLOCKED:${segmentCandidates.blocker}`;
    } else if ((segmentCandidates.rowCount as number) > 0) {
      segmentEvidence = `CLICKHOUSE_ROWS=${segmentCandidates.rowCount}`;
    } else {
      segmentEvidence = 'CLICKHOUSE_EMPTY_FOR_WINDOW';
    }

    const summaryFlags = {
      REJECTED_INPUT_EXPLAINS_GAPS: rejectedFlag,
      SEGMENT_SOURCE_EVIDENCE: segmentEvidence,
      POST_DEPLOY_ADMISSION:
        (postDeployLive as { admission?: { ok?: boolean; code?: string } }).admission?.ok === true
          ? 'SATISFIED'
          : String((postDeployLive as { admission?: { code?: string } }).admission?.code ?? 'UNKNOWN'),
      CURRENT_PROJECTION_READABLE: String(
        (postDeployLive as { currentProjection?: { readability?: string } }).currentProjection?.readability ?? 'UNKNOWN',
      ),
      NEXT_JUSTIFIED_EXPERIMENT:
        rejectedFlag === 'NO'
          ? 'Provider/cache row-level forensics for ROW_ABSENT bucket labels (outside pinned snapshot) without algorithm change'
          : 'Reconcile-window boundary scan for reference trip after natural cold tier or scoped owner-authorized reconcileWindow',
    };

    const files: Record<string, string> = {
      'POSITION_SNAPSHOT_INPUT_AUDIT_SUPPLEMENT_V2.json': JSON.stringify(positionArtifact, null, 2),
      'TRIP_SEGMENT_CANDIDATES_SUPPLEMENT_V2.json': JSON.stringify(
        {
          schema: 'EXP021_TRIP_SEGMENT_CANDIDATES_V2',
          observedAtUtc,
          vehicleId,
          queryWindow: { fromUtc: tripWindowFrom, toUtcExclusive: tripWindowTo },
          dimoSegmentIdPersisted,
          ...segmentCandidates,
        },
        null,
        2,
      ),
      'POST_DEPLOY_STATE_SUPPLEMENT_V2.json': JSON.stringify(
        {
          schema: 'EXP021_POST_DEPLOY_STATE_V2',
          observedAtUtc,
          committedPostDeployCapture: postDeployCommitted,
          liveReadAtExport: postDeployLive,
          separationNote: 'pre-deploy/ and supplement-v1/ not modified; post-deploy/ committed capture referenced, live read additive',
        },
        null,
        2,
      ),
      'SUMMARY_FLAGS_SUPPLEMENT_V2.json': JSON.stringify(
        { schema: 'EXP021_SUPPLEMENT_V2_SUMMARY_FLAGS', observedAtUtc, ...summaryFlags },
        null,
        2,
      ),
    };

    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(outDir, name), body, 'utf8');
    }

    const shaLines: string[] = [];
    for (const name of Object.keys(files).sort()) {
      shaLines.push(`${sha256File(path.join(outDir, name))}  ${name}`);
    }
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${shaLines.join('\n')}\n`, 'utf8');

    const md = `# EXP021 EV Ground Truth — forensic supplement v2

**Observed at (UTC):** \`${observedAtUtc}\`  
**Additive export:** does not modify \`forensic-readonly-exports-2026-10-16/\`, \`forensic-readonly-exports-2026-10-16-supplement-v1/\`, or \`pre-deploy/\`.

## Summary flags

| Flag | Value |
|------|--------|
| REJECTED_INPUT_EXPLAINS_GAPS | ${summaryFlags.REJECTED_INPUT_EXPLAINS_GAPS} |
| SEGMENT_SOURCE_EVIDENCE | ${summaryFlags.SEGMENT_SOURCE_EVIDENCE} |
| POST_DEPLOY_ADMISSION | ${summaryFlags.POST_DEPLOY_ADMISSION} |
| CURRENT_PROJECTION_READABLE | ${summaryFlags.CURRENT_PROJECTION_READABLE} |
| NEXT_JUSTIFIED_EXPERIMENT | ${summaryFlags.NEXT_JUSTIFIED_EXPERIMENT} |

## Priority 1 — missing vs rejected input

- Full \`rejectedProviderRows\` exported in \`POSITION_SNAPSHOT_INPUT_AUDIT_SUPPLEMENT_V2.json\`.
- \`providerSignalsNull\`: ${positionExport.providerSignalsNull}
- Sum \`providerRowCount\` across buckets: ${positionExport.acquisitionCounters.sumProviderRowCountAllBuckets}
- Quality flags: ${positionExport.qualityFlags.join(', ') || '(none)'}
- Among **135** annotated tacho-zero seconds: **${analysisAll135.rowAbsentAmongAnnotated}** ROW_ABSENT; **${analysisAll135.rowAbsentExplainedByRejectedInput}** with rejected input for same label; **${analysisAll135.rowAbsentWithoutRejectedInput}** without.

## Priority 2 — segment source

See \`TRIP_SEGMENT_CANDIDATES_SUPPLEMENT_V2.json\`.

## Priority 3 — post-deploy (separate from pre-deploy)

Committed capture referenced from \`post-deploy/\`; live read in \`POST_DEPLOY_STATE_SUPPLEMENT_V2.json\`.
`;
    fs.writeFileSync(path.join(outDir, 'EXP021_EV_GROUND_TRUTH_FORENSIC_SUPPLEMENT_V2.md'), md, 'utf8');
    shaLines.push(`${sha256Hex(md)}  EXP021_EV_GROUND_TRUTH_FORENSIC_SUPPLEMENT_V2.md`);
    fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${shaLines.sort().join('\n')}\n`, 'utf8');

    console.log(JSON.stringify({ ok: true, outDir, summaryFlags }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
