import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { S4_RESEARCH_GEOMETRY_PROJECTION_ID } from '../s4-research/version';
import type { DiV0S4ResearchPersistableRun } from './di-v0-s4-research-processor';
import { DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2 } from './di-v0-s4-research-bundle.version';

export type DiV0S4ResearchInsertRunResult =
  | { outcome: 'inserted' }
  | { outcome: 'idempotent_duplicate' }
  | { outcome: 'sql_error'; code: string; message: string };

export type DiV0S4ResearchStoredRun = {
  id: string;
  researchIntentKey: string | null;
  researchStatus: string;
  osmContextKey: string | null;
  osmSnapshotSha256: string | null;
};

const EXACT_IDEMPOTENCY_INDEX = 'di_v0_s4_research_runs_exact_idempotency_uq';
const SUCCEEDED_INTENT_INDEX = 'di_v0_s4_research_runs_succeeded_intent_uq';

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
      return msg.includes('unique') || msg.includes('di_v0_s4_research_runs_');
    }
  }
  return false;
}

export class DiV0S4ResearchRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSucceededForIntent(workItemId: string, researchIntentKey: string): Promise<DiV0S4ResearchStoredRun | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        research_intent_key: string | null;
        research_status: string;
        osm_context_key: string | null;
        osm_snapshot_sha256: string | null;
      }>
    >`
      SELECT id, research_intent_key, research_status, osm_context_key, osm_snapshot_sha256
      FROM di_v0_s4_research_runs_v1
      WHERE work_item_id = ${workItemId}
        AND research_intent_key = ${researchIntentKey}
        AND research_status = 'SUCCEEDED'
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      researchIntentKey: row.research_intent_key,
      researchStatus: row.research_status,
      osmContextKey: row.osm_context_key,
      osmSnapshotSha256: row.osm_snapshot_sha256,
    };
  }

  async findExactDuplicate(scope: {
    workItemId: string;
    researchIntentKey: string;
    result: DiV0S4ResearchPersistableRun;
  }): Promise<DiV0S4ResearchStoredRun | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        research_intent_key: string | null;
        research_status: string;
        osm_context_key: string | null;
        osm_snapshot_sha256: string | null;
      }>
    >`
      SELECT id, research_intent_key, research_status, osm_context_key, osm_snapshot_sha256
      FROM di_v0_s4_research_runs_v1
      WHERE work_item_id = ${scope.workItemId}
        AND research_intent_key = ${scope.researchIntentKey}
        AND research_status = ${scope.result.researchStatus}
        AND COALESCE(osm_context_key, 'NONE') = COALESCE(${scope.result.osmContextKey}, 'NONE')
        AND COALESCE(osm_snapshot_sha256, 'NONE') = COALESCE(${scope.result.osmSnapshotSha256}, 'NONE')
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      researchIntentKey: row.research_intent_key,
      researchStatus: row.research_status,
      osmContextKey: row.osm_context_key,
      osmSnapshotSha256: row.osm_snapshot_sha256,
    };
  }

  async countSucceededForIntent(workItemId: string, researchIntentKey: string): Promise<number> {
    const [{ n }] = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM di_v0_s4_research_runs_v1
      WHERE work_item_id = ${workItemId}
        AND research_intent_key = ${researchIntentKey}
        AND research_status = 'SUCCEEDED'`;
    return Number(n);
  }

  async insertRun(scope: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    workItemId: string;
    combinedInputIdentity: string;
    pinnedSnapshotHash: string;
    researchIntentKey: string;
    result: DiV0S4ResearchPersistableRun;
  }): Promise<DiV0S4ResearchInsertRunResult> {
    const { result } = scope;
    const osmKey = result.osmContextKey;
    const osmSha = result.osmSnapshotSha256;
    try {
      await this.prisma.$executeRaw`
        INSERT INTO di_v0_s4_research_runs_v1 (
          id, organization_id, vehicle_id, trip_id, work_item_id,
          research_bundle_version, geometry_projection_id,
          pinned_snapshot_hash, combined_input_identity, research_intent_key,
          osm_context_key, osm_snapshot_sha256,
          research_status, independent_road_id_accuracy,
          summary_json, windows_json
        ) VALUES (
          ${result.id}, ${scope.organizationId}, ${scope.vehicleId}, ${scope.tripId}, ${scope.workItemId},
          ${DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2}, ${S4_RESEARCH_GEOMETRY_PROJECTION_ID},
          ${scope.pinnedSnapshotHash}, ${scope.combinedInputIdentity}, ${scope.researchIntentKey},
          ${osmKey}, ${osmSha},
          ${result.researchStatus}, 'NOT_ASSESSABLE',
          ${JSON.stringify(result.summaryJson)}::jsonb, ${JSON.stringify(result.windowsJson)}::jsonb
        )`;
      return { outcome: 'inserted' };
    } catch (error) {
      if (isIdempotentUniqueViolation(error)) {
        return { outcome: 'idempotent_duplicate' };
      }
      const code =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : error instanceof Error
            ? error.name
            : 'UNKNOWN';
      const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      return { outcome: 'sql_error', code, message };
    }
  }
}
