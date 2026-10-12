import type { PrismaClient } from '@prisma/client';

export const DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK_ENV = 'DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK';
export const DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK = 'YES';

/** Operator supersession marker stored in `failure_reason` (audit trail; status remains SUPERSEDED / OPERATOR). */
export const DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER = 'HISTORICAL_BACKLOG_QUARANTINE_S4P9B';

export type HistoricalBacklogQuarantineFailure =
  | 'QUARANTINE_ACK_INVALID'
  | 'GLOBAL_NOT_KILLED'
  | 'MANIFEST_EMPTY'
  | 'MANIFEST_DUPLICATE_IDS'
  | 'WORK_ITEM_NOT_FOUND'
  | 'WORK_ITEM_STATUS_DRIFT'
  | 'WORK_ITEM_LEASE_ACTIVE'
  | 'WORK_ITEM_TENANT_DRIFT'
  | 'UNEXPECTED_RUNNABLE_WORK'
  | 'UNEXPECTED_WORK_ITEM_COUNT'
  | 'NEW_WORK_ITEM_DURING_TRANSACTION'
  | 'CONDITIONAL_UPDATE_LOST'
  | 'COMPLETED_WORK_ITEM_DRIFT';

export interface HistoricalBacklogManifest {
  /** Exact PENDING work item ids to quarantine (production: 18). */
  quarantineWorkItemIds: readonly string[];
  /** Work items that must remain COMPLETED (production: 1 tiny vehicle completion). */
  preserveCompletedWorkItemIds: readonly string[];
  /** Total rows expected in `di_v0_s4_work_items` before quarantine (production: 19). */
  expectedTotalWorkItems: number;
  organizationId: string;
  allowedVehicleIds: readonly string[];
}

export interface WorkItemSnapshotRow {
  id: string;
  status: string;
  organizationId: string;
  vehicleId: string;
  leaseOwner: string | null;
  leaseExpired: boolean;
  supersededReason: string | null;
  failureReason: string | null;
}

export interface QuarantinePreflightInput {
  ack: string | undefined;
  globalKillState: 'KILLED' | 'NOT_KILLED' | 'MALFORMED' | 'MISSING';
  manifest: HistoricalBacklogManifest;
  rows: readonly WorkItemSnapshotRow[];
}

export interface BacklogSafetyProofInput {
  manifest: HistoricalBacklogManifest;
  rows: readonly WorkItemSnapshotRow[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseHistoricalBacklogManifestFromEnv(env: NodeJS.ProcessEnv): HistoricalBacklogManifest | null {
  const rawIds = (env.DI_S4_HISTORICAL_BACKLOG_QUARANTINE_IDS ?? '').trim();
  const rawCompleted = (env.DI_S4_HISTORICAL_BACKLOG_PRESERVE_COMPLETED_IDS ?? '').trim();
  const org = (env.DI_S4_HISTORICAL_BACKLOG_ORGANIZATION_ID ?? '').trim();
  const vehicles = (env.DI_S4_HISTORICAL_BACKLOG_ALLOWED_VEHICLE_IDS ?? '').trim();
  const totalRaw = (env.DI_S4_HISTORICAL_BACKLOG_EXPECTED_TOTAL_WORK_ITEMS ?? '').trim();
  if (!rawIds || !org || !vehicles || !totalRaw) return null;
  const quarantineWorkItemIds = rawIds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const preserveCompletedWorkItemIds = rawCompleted
    ? rawCompleted.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
    : [];
  const allowedVehicleIds = vehicles.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const expectedTotalWorkItems = Number(totalRaw);
  if (!Number.isFinite(expectedTotalWorkItems) || expectedTotalWorkItems < 1) return null;
  return {
    quarantineWorkItemIds,
    preserveCompletedWorkItemIds,
    expectedTotalWorkItems,
    organizationId: org,
    allowedVehicleIds,
  };
}

export function validateManifestShape(manifest: HistoricalBacklogManifest): HistoricalBacklogQuarantineFailure[] {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  if (manifest.quarantineWorkItemIds.length === 0) failures.push('MANIFEST_EMPTY');
  const seen = new Set<string>();
  for (const id of manifest.quarantineWorkItemIds) {
    if (!UUID_RE.test(id)) failures.push('MANIFEST_DUPLICATE_IDS');
    if (seen.has(id)) failures.push('MANIFEST_DUPLICATE_IDS');
    seen.add(id);
  }
  for (const id of manifest.preserveCompletedWorkItemIds) {
    if (!UUID_RE.test(id)) failures.push('MANIFEST_DUPLICATE_IDS');
    if (seen.has(id)) failures.push('MANIFEST_DUPLICATE_IDS');
    seen.add(id);
  }
  return failures;
}

function isRunnable(row: WorkItemSnapshotRow): boolean {
  if (row.status === 'PENDING' || row.status === 'FAILED_RETRYABLE') return true;
  if (row.status === 'LEASED' && row.leaseOwner && !row.leaseExpired) return true;
  return false;
}

function rowById(rows: readonly WorkItemSnapshotRow[]): Map<string, WorkItemSnapshotRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

export function evaluateHistoricalBacklogQuarantinePreflight(
  input: QuarantinePreflightInput,
): { ok: boolean; failures: HistoricalBacklogQuarantineFailure[] } {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  if (input.ack !== DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK) {
    failures.push('QUARANTINE_ACK_INVALID');
  }
  if (input.globalKillState !== 'KILLED') failures.push('GLOBAL_NOT_KILLED');
  failures.push(...validateManifestShape(input.manifest));

  const { manifest, rows } = input;
  if (rows.length !== manifest.expectedTotalWorkItems) failures.push('UNEXPECTED_WORK_ITEM_COUNT');

  const byId = rowById(rows);
  for (const id of manifest.quarantineWorkItemIds) {
    const row = byId.get(id);
    if (!row) {
      failures.push('WORK_ITEM_NOT_FOUND');
      continue;
    }
    if (row.organizationId !== manifest.organizationId) failures.push('WORK_ITEM_TENANT_DRIFT');
    if (!manifest.allowedVehicleIds.includes(row.vehicleId)) failures.push('WORK_ITEM_TENANT_DRIFT');
    if (row.status === 'SUPERSEDED' && row.supersededReason === 'OPERATOR') {
      continue;
    }
    if (row.status !== 'PENDING') failures.push('WORK_ITEM_STATUS_DRIFT');
    if (row.leaseOwner && !row.leaseExpired) failures.push('WORK_ITEM_LEASE_ACTIVE');
  }

  for (const id of manifest.preserveCompletedWorkItemIds) {
    const row = byId.get(id);
    if (!row || row.status !== 'COMPLETED') failures.push('COMPLETED_WORK_ITEM_DRIFT');
  }

  const unexpectedRunnable = rows.filter(
    (r) => isRunnable(r) && !manifest.quarantineWorkItemIds.includes(r.id),
  );
  if (unexpectedRunnable.length > 0) failures.push('UNEXPECTED_RUNNABLE_WORK');

  return { ok: failures.length === 0, failures };
}

export function evaluateHistoricalBacklogSafetyProof(
  input: BacklogSafetyProofInput,
): { ok: boolean; failures: HistoricalBacklogQuarantineFailure[]; runnableCount: number } {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  failures.push(...validateManifestShape(input.manifest));
  const { manifest, rows } = input;
  if (rows.length !== manifest.expectedTotalWorkItems) failures.push('UNEXPECTED_WORK_ITEM_COUNT');

  const byId = rowById(rows);
  for (const id of manifest.quarantineWorkItemIds) {
    const row = byId.get(id);
    if (!row) {
      failures.push('WORK_ITEM_NOT_FOUND');
      continue;
    }
    if (row.status !== 'SUPERSEDED' || row.supersededReason !== 'OPERATOR') {
      failures.push('WORK_ITEM_STATUS_DRIFT');
    }
  }
  for (const id of manifest.preserveCompletedWorkItemIds) {
    const row = byId.get(id);
    if (!row || row.status !== 'COMPLETED') failures.push('COMPLETED_WORK_ITEM_DRIFT');
  }

  const runnable = rows.filter((r) => isRunnable(r));
  if (runnable.length > 0) failures.push('UNEXPECTED_RUNNABLE_WORK');

  return { ok: failures.length === 0, failures, runnableCount: runnable.length };
}

export type QuarantineApplyResult =
  | { outcome: 'QUARANTINED'; supersededIds: string[]; alreadySupersededIds: string[] }
  | { outcome: 'REFUSED'; failures: HistoricalBacklogQuarantineFailure[] };

type TxClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

interface LockedRow {
  id: string;
  status: string;
  organization_id: string;
  vehicle_id: string;
  lease_owner: string | null;
  lease_expired: boolean;
  superseded_reason: string | null;
}

export async function applyHistoricalBacklogQuarantine(
  tx: TxClient,
  manifest: HistoricalBacklogManifest,
  audit: { actor: string; reason: string },
  options: { ack: string | undefined },
): Promise<QuarantineApplyResult> {
  const globalKillState = await readGlobalKillStateForQuarantine(tx);
  const preflightRows = await loadWorkItemSnapshots(tx, manifest);
  const preflight = evaluateHistoricalBacklogQuarantinePreflight({
    ack: options.ack,
    globalKillState,
    manifest,
    rows: preflightRows,
  });
  if (!preflight.ok) return { outcome: 'REFUSED', failures: preflight.failures };

  const sortedIds = [...manifest.quarantineWorkItemIds].sort();
  const supersededIds: string[] = [];
  const alreadySupersededIds: string[] = [];

  for (const id of sortedIds) {
    const countRows = await tx.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM di_v0_s4_work_items`;
    if (Number(countRows[0]?.c ?? 0) !== manifest.expectedTotalWorkItems) {
      return { outcome: 'REFUSED', failures: ['NEW_WORK_ITEM_DURING_TRANSACTION'] };
    }

    const locked = await tx.$queryRaw<LockedRow[]>`
      SELECT id, status, organization_id, vehicle_id, lease_owner,
        (lease_expires_at IS NOT NULL AND lease_expires_at < clock_timestamp()) AS lease_expired,
        superseded_reason
      FROM di_v0_s4_work_items
      WHERE id = ${id}
      FOR UPDATE`;
    if (locked.length !== 1) return { outcome: 'REFUSED', failures: ['WORK_ITEM_NOT_FOUND'] };
    const row = locked[0]!;
    if (row.organization_id !== manifest.organizationId || !manifest.allowedVehicleIds.includes(row.vehicle_id)) {
      return { outcome: 'REFUSED', failures: ['WORK_ITEM_TENANT_DRIFT'] };
    }
    if (row.status === 'SUPERSEDED' && row.superseded_reason === 'OPERATOR') {
      alreadySupersededIds.push(id);
      continue;
    }
    if (row.status !== 'PENDING') return { outcome: 'REFUSED', failures: ['WORK_ITEM_STATUS_DRIFT'] };
    if (row.lease_owner && !row.lease_expired) {
      return { outcome: 'REFUSED', failures: ['WORK_ITEM_LEASE_ACTIVE'] };
    }

    const marker = `${DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER}:${audit.actor}`;
    const updated = await tx.$executeRaw`
      UPDATE di_v0_s4_work_items
      SET status = 'SUPERSEDED',
          superseded_reason = 'OPERATOR',
          superseded_at = clock_timestamp(),
          superseded_by_work_item_id = NULL,
          lease_epoch = lease_epoch + 1,
          lease_owner = NULL,
          lease_expires_at = NULL,
          lease_acquired_at = NULL,
          next_attempt_at = NULL,
          failure_reason = ${marker}
      WHERE id = ${id} AND status = 'PENDING'`;
    if (updated !== 1) return { outcome: 'REFUSED', failures: ['CONDITIONAL_UPDATE_LOST'] };
    supersededIds.push(id);
  }

  const postRows = await loadWorkItemSnapshots(tx, manifest);
  const safety = evaluateHistoricalBacklogSafetyProof({ manifest, rows: postRows });
  if (!safety.ok) return { outcome: 'REFUSED', failures: safety.failures };

  return { outcome: 'QUARANTINED', supersededIds, alreadySupersededIds };
}

export async function loadWorkItemSnapshots(
  db: Pick<PrismaClient, '$queryRaw'>,
  manifest: HistoricalBacklogManifest,
): Promise<WorkItemSnapshotRow[]> {
  const vehicleIds = manifest.allowedVehicleIds;
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      status: string;
      organization_id: string;
      vehicle_id: string;
      lease_owner: string | null;
      lease_expired: boolean;
      superseded_reason: string | null;
      failure_reason: string | null;
    }>
  >`
    SELECT id, status, organization_id, vehicle_id, lease_owner,
      (lease_expires_at IS NOT NULL AND lease_expires_at < clock_timestamp()) AS lease_expired,
      superseded_reason, failure_reason
    FROM di_v0_s4_work_items
    WHERE organization_id = ${manifest.organizationId}
      AND vehicle_id = ANY(${vehicleIds}::text[])
    ORDER BY id`;
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    organizationId: r.organization_id,
    vehicleId: r.vehicle_id,
    leaseOwner: r.lease_owner,
    leaseExpired: r.lease_expired,
    supersededReason: r.superseded_reason,
    failureReason: r.failure_reason,
  }));
}

export async function readGlobalKillStateForQuarantine(
  db: Pick<PrismaClient, '$queryRaw'>,
): Promise<'KILLED' | 'NOT_KILLED' | 'MALFORMED' | 'MISSING'> {
  const rows = await db.$queryRaw<Array<{ kill_state: unknown }>>`
    SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
  if (rows.length !== 1) return rows.length === 0 ? 'MISSING' : 'MALFORMED';
  const v = rows[0]!.kill_state;
  if (v === 'KILLED') return 'KILLED';
  if (v === 'NOT_KILLED') return 'NOT_KILLED';
  return 'MALFORMED';
}
