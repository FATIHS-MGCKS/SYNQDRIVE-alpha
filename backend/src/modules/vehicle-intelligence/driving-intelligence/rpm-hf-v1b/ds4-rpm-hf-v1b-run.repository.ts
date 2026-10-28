import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { Ds4RpmHfV1bShadowResultV1 } from './ds4-rpm-hf-v1b.contract';

const SUCCEEDED_FP_INDEX = 'ds4_rpm_hf_v1b_shadow_runs_succeeded_fp_uq';

export type Ds4RpmHfV1bInsertRunResult =
  | { outcome: 'inserted'; runId: string }
  | { outcome: 'idempotent_duplicate'; runId: string }
  | { outcome: 'claim_lost'; runId: string }
  | { outcome: 'sql_error'; code: string; message: string };

function isIdempotentUniqueViolation(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('23505') && text.includes(SUCCEEDED_FP_INDEX)) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta as { code?: string; message?: string; constraint?: string } | undefined;
    const msg = `${meta?.message ?? ''} ${meta?.constraint ?? ''} ${error.message}`;
    if (msg.includes(SUCCEEDED_FP_INDEX)) return true;
  }
  return false;
}

export class Ds4RpmHfV1bRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSucceededFingerprint(input: {
    organizationId: string;
    tripId: string;
    engineVersion: string;
  }): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ input_fingerprint: string }>>`
      SELECT input_fingerprint FROM ds4_rpm_hf_v1b_shadow_runs_v1
      WHERE organization_id = ${input.organizationId}
        AND trip_id = ${input.tripId}
        AND engine_version = ${input.engineVersion}
        AND shadow_status = 'SUCCEEDED'
      ORDER BY created_at DESC
      LIMIT 1`;
    return rows[0]?.input_fingerprint ?? null;
  }

  async insertRun(scope: {
    runId: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    engineVersion: string;
    inputFingerprint: string;
    shadowStatus: 'SUCCEEDED' | 'TERMINAL_INELIGIBLE' | 'TERMINAL_FAILED';
    summary: Ds4RpmHfV1bShadowResultV1;
    computedAt: Date;
  }): Promise<Ds4RpmHfV1bInsertRunResult> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ds4_rpm_hf_v1b_shadow_runs_v1 (
          id, organization_id, vehicle_id, trip_id, engine_version, input_fingerprint,
          shadow_status, summary_json, computed_at
        ) VALUES (
          ${scope.runId}, ${scope.organizationId}, ${scope.vehicleId}, ${scope.tripId},
          ${scope.engineVersion}, ${scope.inputFingerprint}, ${scope.shadowStatus},
          ${JSON.stringify(scope.summary)}::jsonb, ${scope.computedAt}
        )`;
      return { outcome: 'inserted', runId: scope.runId };
    } catch (error) {
      if (isIdempotentUniqueViolation(error) && scope.shadowStatus === 'SUCCEEDED') {
        return { outcome: 'idempotent_duplicate', runId: scope.runId };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'sql_error', code: 'INSERT_FAILED', message };
    }
  }

  /**
   * Persists a run only while the outbox row holds a live PROCESSING claim (claim_token + unexpired lease).
   */
  async insertRunWithActiveClaim(scope: {
    outboxId: string;
    claimToken: string;
    runId: string;
    organizationId: string;
    vehicleId: string;
    tripId: string;
    engineVersion: string;
    inputFingerprint: string;
    shadowStatus: 'SUCCEEDED' | 'TERMINAL_INELIGIBLE' | 'TERMINAL_FAILED';
    summary: Ds4RpmHfV1bShadowResultV1;
    computedAt: Date;
    now: Date;
  }): Promise<Ds4RpmHfV1bInsertRunResult> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        WITH live_claim AS (
          SELECT outbox_id
          FROM ds4_rpm_hf_v1b_shadow_outbox_v1
          WHERE outbox_id = ${scope.outboxId}::uuid
            AND claim_token = ${scope.claimToken}
            AND status = 'PROCESSING'
            AND claim_expires_at IS NOT NULL
            AND claim_expires_at > ${scope.now}
        )
        INSERT INTO ds4_rpm_hf_v1b_shadow_runs_v1 (
          id, organization_id, vehicle_id, trip_id, engine_version, input_fingerprint,
          shadow_status, summary_json, computed_at
        )
        SELECT
          ${scope.runId}, ${scope.organizationId}, ${scope.vehicleId}, ${scope.tripId},
          ${scope.engineVersion}, ${scope.inputFingerprint}, ${scope.shadowStatus},
          ${JSON.stringify(scope.summary)}::jsonb, ${scope.computedAt}
        FROM live_claim
        RETURNING id`;
      if (rows.length === 0) {
        return { outcome: 'claim_lost', runId: scope.runId };
      }
      return { outcome: 'inserted', runId: scope.runId };
    } catch (error) {
      if (isIdempotentUniqueViolation(error) && scope.shadowStatus === 'SUCCEEDED') {
        return { outcome: 'idempotent_duplicate', runId: scope.runId };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { outcome: 'sql_error', code: 'INSERT_FAILED', message };
    }
  }
}
