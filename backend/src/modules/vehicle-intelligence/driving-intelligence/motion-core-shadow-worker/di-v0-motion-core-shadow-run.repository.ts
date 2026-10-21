import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { gzipSync } from 'zlib';
import { DI_V0_MOTION_CORE_SHADOW_TUNING } from './di-v0-motion-core-shadow.config';
import type { DiV0MotionCoreShadowPayloadV1, DiV0MotionCoreShadowSummaryJson } from './di-v0-motion-core-shadow.types';

export type DiV0MotionCoreShadowInsertRunResult =
  | { outcome: 'inserted'; runId: string }
  | { outcome: 'idempotent_duplicate'; runId: string }
  | { outcome: 'sql_error'; code: string; message: string };

const EXACT_IDEMPOTENCY_INDEX = 'di_v0_motion_core_shadow_runs_exact_uq';
const SUCCEEDED_INTENT_INDEX = 'di_v0_motion_core_shadow_runs_succeeded_intent_uq';

function isIdempotentUniqueViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('23505') && (text.includes(EXACT_IDEMPOTENCY_INDEX) || text.includes(SUCCEEDED_INTENT_INDEX))) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as { code?: string; message?: string; constraint?: string } | undefined;
    const msg = `${meta?.message ?? ''} ${meta?.constraint ?? ''} ${error.message}`;
    if (msg.includes(EXACT_IDEMPOTENCY_INDEX) || msg.includes(SUCCEEDED_INTENT_INDEX)) return true;
    if (error.code === 'P2010' && (meta?.code === '23505' || msg.includes('23505'))) {
      return msg.includes('unique') || msg.includes('di_v0_motion_core_shadow_runs_');
    }
  }
  return false;
}

export class DiV0MotionCoreShadowRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSucceededForIntent(workItemId: string, shadowIntentKey: string): Promise<{ id: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM di_v0_motion_core_shadow_runs_v1
      WHERE work_item_id = ${workItemId}
        AND shadow_intent_key = ${shadowIntentKey}
        AND shadow_status = 'SUCCEEDED'
      LIMIT 1`;
    return rows[0] ?? null;
  }

  async insertSucceededRun(scope: {
    runId: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    workItemId: string;
    shadowIntentKey: string;
    shadowBundleVersion: string;
    pinnedSnapshotHash: string;
    combinedInputIdentity: string;
    contentFingerprint: string;
    summary: DiV0MotionCoreShadowSummaryJson;
    payload: DiV0MotionCoreShadowPayloadV1;
  }): Promise<DiV0MotionCoreShadowInsertRunResult> {
    const json = JSON.stringify(scope.payload);
    if (json.length > DI_V0_MOTION_CORE_SHADOW_TUNING.maxPayloadUncompressedBytes) {
      return { outcome: 'sql_error', code: 'PAYLOAD_TOO_LARGE', message: 'uncompressed payload exceeds budget' };
    }
    const payloadGzip = gzipSync(json);
    try {
      await this.prisma.$executeRaw`
        INSERT INTO di_v0_motion_core_shadow_runs_v1 (
          id, organization_id, vehicle_id, trip_id, work_item_id,
          shadow_intent_key, shadow_bundle_version, pinned_snapshot_hash, combined_input_identity,
          content_fingerprint, shadow_status, summary_json, payload_gzip, uncompressed_bytes
        ) VALUES (
          ${scope.runId}, ${scope.organizationId}, ${scope.vehicleId}, ${scope.tripId}, ${scope.workItemId},
          ${scope.shadowIntentKey}, ${scope.shadowBundleVersion}, ${scope.pinnedSnapshotHash}, ${scope.combinedInputIdentity},
          ${scope.contentFingerprint}, 'SUCCEEDED', ${JSON.stringify(scope.summary)}::jsonb,
          ${payloadGzip}, ${json.length}
        )`;
      return { outcome: 'inserted', runId: scope.runId };
    } catch (error) {
      if (isIdempotentUniqueViolation(error)) {
        const existing = await this.findSucceededForIntent(scope.workItemId, scope.shadowIntentKey);
        return { outcome: 'idempotent_duplicate', runId: existing?.id ?? scope.runId };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'sql_error', code: 'INSERT_FAILED', message };
    }
  }
}
