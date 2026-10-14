import { Prisma, type PrismaClient } from '@prisma/client';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import type { DiV0S4SourceFamily } from './di-v0-trip-speed-quality-projection.types';
import { buildDiV0TripSpeedQualityProjectionV1 } from './build-di-v0-trip-speed-quality-projection.v1';
import { resolveDiV0TripSpeedQualityCalibrationBundle } from './di-v0-trip-speed-quality-calibration';
import { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } from './di-v0-trip-speed-quality-evidence';
import { DiV0TripSpeedQualityProjectionError } from './di-v0-trip-speed-quality-projection.errors';
import {
  loadShadowIntervals,
  loadWorkItem,
  resolveActivePrimaryWorkItemId,
  type DiV0TripSpeedQualityProjectionDb,
} from './di-v0-trip-speed-quality-projection.engine';
import { dateToBucketLabel, type AcquisitionWindow } from './di-v0-p21-r3-forensic-classify';
import type { ForensicReplayMode } from './di-v0-p21-r3-forensic-analyze';

const FORENSIC_STATEMENT_TIMEOUT_MS = 120_000;

export type P21ForensicLoadedContext = {
  replayMode: ForensicReplayMode;
  workItem: Awaited<ReturnType<typeof loadWorkItem>>;
  activePrimaryWorkItemId: string | null;
  shadowRun: {
    id: string;
    calibrationVersion: string;
    inputEvidenceVersion: string | null;
  };
  acquisitionWindow: AcquisitionWindow;
  evidence: ReturnType<typeof buildDiV0TripSpeedQualityEvidenceFromParsedContainer>;
  shadowIntervals: Awaited<ReturnType<typeof loadShadowIntervals>>;
  projection: ReturnType<typeof buildDiV0TripSpeedQualityProjectionV1>;
  pinnedSnapshotHash: string;
  snapshotVerified: true;
  snapshotBoundToWorkItem: true;
  dbTransactionReadOnly: string;
  dbTransactionIsolation: string;
};

export async function loadP21ForensicContextInReadOnlyTransaction(
  prisma: PrismaClient,
  input: { organizationId: string; tripId: string; workItemId: string },
): Promise<P21ForensicLoadedContext> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${FORENSIC_STATEMENT_TIMEOUT_MS}`);
      await tx.$executeRaw`SET LOCAL transaction_read_only = on`;
      const [roRow, isoRow] = await Promise.all([
        tx.$queryRaw<Array<{ v: string }>>`SELECT current_setting('transaction_read_only') AS v`,
        tx.$queryRaw<Array<{ v: string }>>`SELECT current_setting('transaction_isolation') AS v`,
      ]);
      const ctx = await loadP21ForensicContext(tx, input, {
        dbTransactionReadOnly: roRow[0]?.v ?? 'unknown',
        dbTransactionIsolation: isoRow[0]?.v ?? 'unknown',
      });
      return ctx;
    },
    {
      timeout: FORENSIC_STATEMENT_TIMEOUT_MS + 10_000,
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    },
  );
}

export async function loadP21ForensicContext(
  db: DiV0TripSpeedQualityProjectionDb,
  input: { organizationId: string; tripId: string; workItemId: string },
  txMeta: { dbTransactionReadOnly: string; dbTransactionIsolation: string } = {
    dbTransactionReadOnly: 'not_in_transaction',
    dbTransactionIsolation: 'not_in_transaction',
  },
): Promise<P21ForensicLoadedContext> {
  const { organizationId, tripId, workItemId } = input;
  const wi = await loadWorkItem(db, workItemId);
  if (!wi) {
    throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_NOT_FOUND', workItemId);
  }
  if (wi.organization_id !== organizationId || wi.trip_id !== tripId) {
    throw new DiV0TripSpeedQualityProjectionError('TENANT_SCOPE_MISMATCH', 'scope mismatch');
  }
  if (wi.status === 'SUPERSEDED') {
    throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_SUPERSEDED', 'superseded');
  }
  if (wi.status !== 'COMPLETED') {
    throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_NOT_ELIGIBLE', 'not completed');
  }
  if (wi.shadow_run_id == null || wi.pinned_snapshot_hash == null) {
    throw new DiV0TripSpeedQualityProjectionError('MISSING_SHADOW_RUN', 'pin/shadow missing');
  }

  const activePrimaryWorkItemId = await resolveActivePrimaryWorkItemId(db, organizationId, tripId);
  const replayMode: ForensicReplayMode =
    activePrimaryWorkItemId === workItemId ? 'ACTIVE_PRIMARY' : 'HISTORICAL_PINNED';

  const snapshotRows = await db.$queryRaw<
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
    SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint, acquisition_window_start,
      acquisition_window_end, channel_manifest, payload_gzip, uncompressed_bytes
    FROM di_v0_s4_evidence_snapshots
    WHERE organization_id = ${wi.organization_id}
      AND trip_id = ${wi.trip_id}
      AND snapshot_hash = ${wi.pinned_snapshot_hash}
    LIMIT 1`;
  const snapshot = snapshotRows[0];
  if (!snapshot) {
    throw new DiV0TripSpeedQualityProjectionError('SNAPSHOT_VERIFICATION_FAILED', 'snapshot missing');
  }

  const verified = verifyAndParseDiV0PinnedEvidenceSnapshot(snapshot, {
    organizationId: wi.organization_id,
    vehicleId: wi.vehicle_id,
    tripId: wi.trip_id,
    boundaryFingerprint: wi.boundary_fingerprint,
    snapshotHash: wi.pinned_snapshot_hash,
    sourceFamily: wi.source_family as DiV0S4SourceFamily,
  });
  if (!verified.ok) {
    throw new DiV0TripSpeedQualityProjectionError(
      'SNAPSHOT_VERIFICATION_FAILED',
      verified.code + (verified.detail ? `:${verified.detail}` : ''),
    );
  }

  const shadowRunRows = await db.$queryRaw<
    Array<{ id: string; calibration_version: string; input_evidence_version: string | null }>
  >`
    SELECT id, calibration_version, input_evidence_version
    FROM di_v0_shadow_runs
    WHERE id = ${wi.shadow_run_id}
      AND organization_id = ${wi.organization_id}
      AND trip_id = ${wi.trip_id}
    LIMIT 1`;
  const shadowRunRow = shadowRunRows[0];
  if (!shadowRunRow) {
    throw new DiV0TripSpeedQualityProjectionError('MISSING_SHADOW_RUN', 'shadow run row missing');
  }

  let calibration;
  try {
    calibration = resolveDiV0TripSpeedQualityCalibrationBundle(shadowRunRow.calibration_version);
  } catch {
    throw new DiV0TripSpeedQualityProjectionError(
      'UNSUPPORTED_CALIBRATION_VERSION',
      shadowRunRow.calibration_version,
    );
  }

  const evidence = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(verified.parsed, calibration);
  const shadowIntervals = await loadShadowIntervals(
    db,
    wi.shadow_run_id,
    wi.organization_id,
    wi.trip_id,
  );

  const projection = buildDiV0TripSpeedQualityProjectionV1({
    organizationId: wi.organization_id,
    vehicleId: wi.vehicle_id,
    tripId: wi.trip_id,
    workItemId: wi.id,
    shadowRunId: wi.shadow_run_id,
    pinnedSnapshotHash: wi.pinned_snapshot_hash,
    boundaryFingerprint: wi.boundary_fingerprint,
    sourceFamily: wi.source_family as DiV0S4SourceFamily,
    combinedInputIdentity: wi.combined_input_identity,
    shadowInputEvidenceVersion: shadowRunRow.input_evidence_version,
    workItemCompletedAt: wi.completed_at,
    snapshotVerified: true,
    evidence,
    shadowIntervals,
  });

  const acquisitionWindow: AcquisitionWindow = {
    startLabel: dateToBucketLabel(snapshot.acquisition_window_start),
    endLabel: dateToBucketLabel(snapshot.acquisition_window_end),
  };

  return {
    replayMode,
    workItem: wi,
    activePrimaryWorkItemId,
    shadowRun: {
      id: shadowRunRow.id,
      calibrationVersion: shadowRunRow.calibration_version,
      inputEvidenceVersion: shadowRunRow.input_evidence_version,
    },
    acquisitionWindow,
    evidence,
    shadowIntervals,
    projection,
    pinnedSnapshotHash: wi.pinned_snapshot_hash,
    snapshotVerified: true,
    snapshotBoundToWorkItem: true,
    dbTransactionReadOnly: txMeta.dbTransactionReadOnly,
    dbTransactionIsolation: txMeta.dbTransactionIsolation,
  };
}
