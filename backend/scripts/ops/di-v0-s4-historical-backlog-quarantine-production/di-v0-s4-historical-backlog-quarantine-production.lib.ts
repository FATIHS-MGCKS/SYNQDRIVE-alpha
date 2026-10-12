import { DI_V0_S4_LIMITS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-contract';

export const DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK_ENV = 'DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK';
export const DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK = 'YES';

export const DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER = 'HISTORICAL_BACKLOG_QUARANTINE_S4P9B';

export type HistoricalBacklogQuarantineFailure =
  | 'QUARANTINE_ACK_INVALID'
  | 'GLOBAL_NOT_KILLED'
  | 'GLOBAL_KILL_LOCK_FAILED'
  | 'MANIFEST_EMPTY'
  | 'MANIFEST_DUPLICATE_IDS'
  | 'MANIFEST_ID_SET_MISMATCH'
  | 'WORK_ITEM_NOT_FOUND'
  | 'WORK_ITEM_STATUS_DRIFT'
  | 'WORK_ITEM_LEASE_ACTIVE'
  | 'WORK_ITEM_TENANT_DRIFT'
  | 'UNEXPECTED_CLAIMABLE_WORK'
  | 'UNEXPECTED_NONTERMINAL_WORK'
  | 'UNEXPECTED_WORK_ITEM_COUNT'
  | 'GLOBAL_WORK_ITEM_COUNT_DRIFT'
  | 'NEW_WORK_ITEM_DURING_TRANSACTION'
  | 'CONDITIONAL_UPDATE_LOST'
  | 'COMPLETED_WORK_ITEM_DRIFT'
  | 'QUARANTINE_MARKER_DRIFT'
  | 'UNKNOWN_TENANT_WORK_ITEM'
  | 'EVIDENCE_PERSISTENCE_DRIFT';

export interface HistoricalBacklogManifest {
  quarantineWorkItemIds: readonly string[];
  preserveCompletedWorkItemIds: readonly string[];
  expectedTotalWorkItems: number;
  organizationId: string;
  allowedVehicleIds: readonly string[];
  expectedPersistence?: {
    pipelineVersions: number;
    evidenceSnapshots: number;
    shadowRuns: number;
    shadowIntervals: number;
  };
}

export interface WorkItemSnapshotRow {
  id: string;
  status: string;
  organizationId: string;
  vehicleId: string;
  leaseOwner: string | null;
  leaseExpired: boolean;
  nextAttemptAt: Date | null;
  nextAttemptEligible: boolean;
  attemptCount: number;
  supersededReason: string | null;
  failureReason: string | null;
}

export interface QuarantinePreflightInput {
  ack: string | undefined;
  globalKillState: 'KILLED' | 'NOT_KILLED' | 'MALFORMED' | 'MISSING';
  manifest: HistoricalBacklogManifest;
  globalRows: readonly WorkItemSnapshotRow[];
  scopedRows: readonly WorkItemSnapshotRow[];
}

export interface BacklogSafetyProofInput {
  manifest: HistoricalBacklogManifest;
  globalRows: readonly WorkItemSnapshotRow[];
  scopedRows: readonly WorkItemSnapshotRow[];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class HistoricalBacklogQuarantineAbortError extends Error {
  readonly failures: HistoricalBacklogQuarantineFailure[];

  constructor(failures: HistoricalBacklogQuarantineFailure[]) {
    super(failures.join(','));
    this.name = 'HistoricalBacklogQuarantineAbortError';
    this.failures = failures;
  }
}

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
  const manifest: HistoricalBacklogManifest = {
    quarantineWorkItemIds,
    preserveCompletedWorkItemIds,
    expectedTotalWorkItems,
    organizationId: org,
    allowedVehicleIds,
  };
  const persist = parsePersistencePinsFromEnv(env);
  if (persist) manifest.expectedPersistence = persist;
  return manifest;
}

function parsePersistencePinsFromEnv(env: NodeJS.ProcessEnv): HistoricalBacklogManifest['expectedPersistence'] | undefined {
  const pv = env.DI_S4_HISTORICAL_BACKLOG_EXPECTED_PIPELINE_VERSIONS;
  const es = env.DI_S4_HISTORICAL_BACKLOG_EXPECTED_EVIDENCE_SNAPSHOTS;
  const sr = env.DI_S4_HISTORICAL_BACKLOG_EXPECTED_SHADOW_RUNS;
  const si = env.DI_S4_HISTORICAL_BACKLOG_EXPECTED_SHADOW_INTERVALS;
  if (!pv || !es || !sr || !si) return undefined;
  return {
    pipelineVersions: Number(pv),
    evidenceSnapshots: Number(es),
    shadowRuns: Number(sr),
    shadowIntervals: Number(si),
  };
}

export function validateManifestShape(manifest: HistoricalBacklogManifest): HistoricalBacklogQuarantineFailure[] {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  if (manifest.quarantineWorkItemIds.length === 0) failures.push('MANIFEST_EMPTY');
  const seen = new Set<string>();
  for (const id of [...manifest.quarantineWorkItemIds, ...manifest.preserveCompletedWorkItemIds]) {
    if (!UUID_RE.test(id)) failures.push('MANIFEST_DUPLICATE_IDS');
    if (seen.has(id)) failures.push('MANIFEST_DUPLICATE_IDS');
    seen.add(id);
  }
  const expectedIds = new Set([...manifest.quarantineWorkItemIds, ...manifest.preserveCompletedWorkItemIds]);
  if (expectedIds.size !== manifest.expectedTotalWorkItems) failures.push('MANIFEST_ID_SET_MISMATCH');
  return failures;
}

export function hasQuarantineMarker(failureReason: string | null): boolean {
  return (failureReason ?? '').startsWith(`${DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER}:`);
}

/** Mirrors T02_CLAIM candidate eligibility in `DiV0S4WorkItemRepository.claim`. */
export function isClaimEligibleWorkItemRow(row: WorkItemSnapshotRow): boolean {
  if (row.attemptCount >= DI_V0_S4_LIMITS.maxAttempts) return false;
  if (row.status === 'PENDING' || row.status === 'FAILED_RETRYABLE') {
    return row.nextAttemptEligible;
  }
  if (row.status === 'LEASED') {
    return row.leaseExpired;
  }
  return false;
}

function isNonTerminalUnexpected(row: WorkItemSnapshotRow, manifest: HistoricalBacklogManifest): boolean {
  if (row.status === 'SUPERSEDED' || row.status === 'COMPLETED' || row.status === 'FAILED_TERMINAL' || row.status === 'SKIPPED_INELIGIBLE') {
    return false;
  }
  if (manifest.quarantineWorkItemIds.includes(row.id)) return false;
  if (manifest.preserveCompletedWorkItemIds.includes(row.id)) return false;
  return true;
}

function manifestIdSet(manifest: HistoricalBacklogManifest): Set<string> {
  return new Set([...manifest.quarantineWorkItemIds, ...manifest.preserveCompletedWorkItemIds]);
}

export function evaluateManifestCompleteness(
  manifest: HistoricalBacklogManifest,
  globalRows: readonly WorkItemSnapshotRow[],
): HistoricalBacklogQuarantineFailure[] {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  failures.push(...validateManifestShape(manifest));
  if (globalRows.length !== manifest.expectedTotalWorkItems) failures.push('GLOBAL_WORK_ITEM_COUNT_DRIFT');
  const expected = manifestIdSet(manifest);
  const globalIds = new Set(globalRows.map((r) => r.id));
  if (globalIds.size !== expected.size || [...expected].some((id) => !globalIds.has(id))) {
    failures.push('MANIFEST_ID_SET_MISMATCH');
  }
  for (const row of globalRows) {
    if (!expected.has(row.id)) failures.push('UNKNOWN_TENANT_WORK_ITEM');
    if (row.organizationId !== manifest.organizationId) failures.push('WORK_ITEM_TENANT_DRIFT');
    if (!manifest.allowedVehicleIds.includes(row.vehicleId)) failures.push('WORK_ITEM_TENANT_DRIFT');
  }
  return failures;
}

function rowById(rows: readonly WorkItemSnapshotRow[]): Map<string, WorkItemSnapshotRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

export function evaluateHistoricalBacklogQuarantinePreflight(
  input: QuarantinePreflightInput,
): { ok: boolean; failures: HistoricalBacklogQuarantineFailure[] } {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  if (input.ack !== DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACCEPTED_ACK) failures.push('QUARANTINE_ACK_INVALID');
  if (input.globalKillState !== 'KILLED') failures.push('GLOBAL_NOT_KILLED');
  failures.push(...evaluateManifestCompleteness(input.manifest, input.globalRows));

  const { manifest, scopedRows, globalRows } = input;
  const byId = rowById(scopedRows);

  for (const id of manifest.quarantineWorkItemIds) {
    const row = byId.get(id);
    if (!row) {
      failures.push('WORK_ITEM_NOT_FOUND');
      continue;
    }
    if (row.status === 'SUPERSEDED' && row.supersededReason === 'OPERATOR' && hasQuarantineMarker(row.failureReason)) {
      continue;
    }
    if (row.status !== 'PENDING') failures.push('WORK_ITEM_STATUS_DRIFT');
    if (isClaimEligibleWorkItemRow(row) === false && row.status === 'PENDING' && row.leaseOwner && !row.leaseExpired) {
      failures.push('WORK_ITEM_LEASE_ACTIVE');
    }
    if (row.status === 'PENDING' && row.leaseOwner && !row.leaseExpired) failures.push('WORK_ITEM_LEASE_ACTIVE');
  }

  for (const id of manifest.preserveCompletedWorkItemIds) {
    const row = byId.get(id);
    if (!row || row.status !== 'COMPLETED') failures.push('COMPLETED_WORK_ITEM_DRIFT');
  }

  for (const row of globalRows) {
    if (isClaimEligibleWorkItemRow(row) && !manifest.quarantineWorkItemIds.includes(row.id)) {
      failures.push('UNEXPECTED_CLAIMABLE_WORK');
    }
    if (isNonTerminalUnexpected(row, manifest)) failures.push('UNEXPECTED_NONTERMINAL_WORK');
  }

  return { ok: failures.length === 0, failures };
}

export function evaluateHistoricalBacklogSafetyProof(
  input: BacklogSafetyProofInput,
): { ok: boolean; failures: HistoricalBacklogQuarantineFailure[]; claimableCount: number } {
  const failures: HistoricalBacklogQuarantineFailure[] = [];
  failures.push(...evaluateManifestCompleteness(input.manifest, input.globalRows));

  const { manifest, scopedRows, globalRows } = input;
  const byId = rowById(scopedRows);

  for (const id of manifest.quarantineWorkItemIds) {
    const row = byId.get(id);
    if (!row) {
      failures.push('WORK_ITEM_NOT_FOUND');
      continue;
    }
    if (row.status !== 'SUPERSEDED' || row.supersededReason !== 'OPERATOR' || !hasQuarantineMarker(row.failureReason)) {
      failures.push('QUARANTINE_MARKER_DRIFT');
    }
  }
  for (const id of manifest.preserveCompletedWorkItemIds) {
    const row = byId.get(id);
    if (!row || row.status !== 'COMPLETED') failures.push('COMPLETED_WORK_ITEM_DRIFT');
  }

  const claimable = globalRows.filter((r) => isClaimEligibleWorkItemRow(r));
  if (claimable.length > 0) failures.push('UNEXPECTED_CLAIMABLE_WORK');

  return { ok: failures.length === 0, failures, claimableCount: claimable.length };
}

export type QuarantineApplyResult =
  | { outcome: 'QUARANTINED'; supersededIds: string[]; alreadySupersededIds: string[] }
  | { outcome: 'REFUSED'; failures: HistoricalBacklogQuarantineFailure[] };

type TxClient = Pick<import('@prisma/client').PrismaClient, '$queryRaw' | '$executeRaw'>;

interface DbRow {
  id: string;
  status: string;
  organization_id: string;
  vehicle_id: string;
  lease_owner: string | null;
  lease_expired: boolean;
  next_attempt_at: Date | null;
  next_attempt_eligible: boolean;
  attempt_count: number;
  superseded_reason: string | null;
  failure_reason: string | null;
}

function mapDbRow(r: DbRow): WorkItemSnapshotRow {
  return {
    id: r.id,
    status: r.status,
    organizationId: r.organization_id,
    vehicleId: r.vehicle_id,
    leaseOwner: r.lease_owner,
    leaseExpired: r.lease_expired,
    nextAttemptAt: r.next_attempt_at,
    nextAttemptEligible: r.next_attempt_eligible,
    attemptCount: Number(r.attempt_count),
    supersededReason: r.superseded_reason,
    failureReason: r.failure_reason,
  };
}

export async function loadAllWorkItemSnapshots(db: TxClient): Promise<WorkItemSnapshotRow[]> {
  const rows = await db.$queryRaw<DbRow[]>`
    SELECT id, status, organization_id, vehicle_id, lease_owner,
      (lease_expires_at IS NOT NULL AND lease_expires_at < clock_timestamp()) AS lease_expired,
      next_attempt_at,
      (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp()) AS next_attempt_eligible,
      attempt_count,
      superseded_reason, failure_reason
    FROM di_v0_s4_work_items
    ORDER BY id`;
  return rows.map(mapDbRow);
}

export async function loadScopedWorkItemSnapshots(
  db: TxClient,
  manifest: HistoricalBacklogManifest,
): Promise<WorkItemSnapshotRow[]> {
  const rows = await db.$queryRaw<DbRow[]>`
    SELECT id, status, organization_id, vehicle_id, lease_owner,
      (lease_expires_at IS NOT NULL AND lease_expires_at < clock_timestamp()) AS lease_expired,
      next_attempt_at,
      (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp()) AS next_attempt_eligible,
      attempt_count,
      superseded_reason, failure_reason
    FROM di_v0_s4_work_items
    WHERE organization_id = ${manifest.organizationId}
      AND vehicle_id = ANY(${manifest.allowedVehicleIds}::text[])
    ORDER BY id`;
  return rows.map(mapDbRow);
}

export async function assertPersistencePinsUnchanged(
  db: TxClient,
  manifest: HistoricalBacklogManifest,
): Promise<void> {
  if (!manifest.expectedPersistence) return;
  const counts = await db.$queryRaw<
    Array<{
      pv: bigint;
      es: bigint;
      sr: bigint;
      si: bigint;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::bigint FROM di_v0_s4_pipeline_versions) AS pv,
      (SELECT COUNT(*)::bigint FROM di_v0_s4_evidence_snapshots) AS es,
      (SELECT COUNT(*)::bigint FROM di_v0_shadow_runs) AS sr,
      (SELECT COUNT(*)::bigint FROM di_v0_shadow_intervals) AS si`;
  const c = counts[0];
  if (!c) throw new HistoricalBacklogQuarantineAbortError(['EVIDENCE_PERSISTENCE_DRIFT']);
  const exp = manifest.expectedPersistence;
  if (
    Number(c.pv) !== exp.pipelineVersions ||
    Number(c.es) !== exp.evidenceSnapshots ||
    Number(c.sr) !== exp.shadowRuns ||
    Number(c.si) !== exp.shadowIntervals
  ) {
    throw new HistoricalBacklogQuarantineAbortError(['EVIDENCE_PERSISTENCE_DRIFT']);
  }
}

export async function lockGlobalKillMustBeKilled(db: TxClient): Promise<void> {
  const rows = await db.$queryRaw<Array<{ kill_state: unknown }>>`
    SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE`;
  if (rows.length !== 1) throw new HistoricalBacklogQuarantineAbortError(['GLOBAL_KILL_LOCK_FAILED']);
  if (rows[0]!.kill_state !== 'KILLED') throw new HistoricalBacklogQuarantineAbortError(['GLOBAL_NOT_KILLED']);
}

export async function readGlobalKillStateForQuarantine(
  db: TxClient,
): Promise<'KILLED' | 'NOT_KILLED' | 'MALFORMED' | 'MISSING'> {
  const rows = await db.$queryRaw<Array<{ kill_state: unknown }>>`
    SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL'`;
  if (rows.length !== 1) return rows.length === 0 ? 'MISSING' : 'MALFORMED';
  const v = rows[0]!.kill_state;
  if (v === 'KILLED') return 'KILLED';
  if (v === 'NOT_KILLED') return 'NOT_KILLED';
  return 'MALFORMED';
}

export async function countClaimableWorkItemsForManifest(
  db: TxClient,
  manifest: HistoricalBacklogManifest,
): Promise<number> {
  const rows = await loadAllWorkItemSnapshots(db);
  return rows.filter((r) => {
    if (r.organizationId !== manifest.organizationId) return false;
    if (!manifest.allowedVehicleIds.includes(r.vehicleId)) return false;
    return isClaimEligibleWorkItemRow(r);
  }).length;
}

export async function applyHistoricalBacklogQuarantineInTransaction(
  tx: TxClient,
  manifest: HistoricalBacklogManifest,
  audit: { actor: string; reason: string },
  options: { ack: string | undefined },
): Promise<QuarantineApplyResult> {
  await lockGlobalKillMustBeKilled(tx);
  await assertPersistencePinsUnchanged(tx, manifest);

  const globalRows = await loadAllWorkItemSnapshots(tx);
  const scopedRows = await loadScopedWorkItemSnapshots(tx, manifest);
  const globalKillState = await readGlobalKillStateForQuarantine(tx);

  const preflight = evaluateHistoricalBacklogQuarantinePreflight({
    ack: options.ack,
    globalKillState,
    manifest,
    globalRows,
    scopedRows,
  });
  if (!preflight.ok) throw new HistoricalBacklogQuarantineAbortError(preflight.failures);

  const sortedIds = [...manifest.quarantineWorkItemIds].sort();
  const supersededIds: string[] = [];
  const alreadySupersededIds: string[] = [];
  const marker = `${DI_S4_HISTORICAL_BACKLOG_QUARANTINE_MARKER}:${audit.actor}`;

  if (sortedIds.length > 0) {
    await tx.$queryRaw`
      SELECT id FROM di_v0_s4_work_items
      WHERE id = ANY(${sortedIds}::text[])
      ORDER BY id
      FOR UPDATE`;
  }

  for (const id of sortedIds) {
    const countRows = await tx.$queryRaw<Array<{ c: bigint }>>`
      SELECT COUNT(*)::bigint AS c FROM di_v0_s4_work_items`;
    if (Number(countRows[0]?.c ?? 0) !== manifest.expectedTotalWorkItems) {
      throw new HistoricalBacklogQuarantineAbortError(['NEW_WORK_ITEM_DURING_TRANSACTION']);
    }

    const locked = await tx.$queryRaw<DbRow[]>`
      SELECT id, status, organization_id, vehicle_id, lease_owner,
        (lease_expires_at IS NOT NULL AND lease_expires_at < clock_timestamp()) AS lease_expired,
        next_attempt_at,
        (next_attempt_at IS NULL OR next_attempt_at <= clock_timestamp()) AS next_attempt_eligible,
        attempt_count,
        superseded_reason, failure_reason
      FROM di_v0_s4_work_items
      WHERE id = ${id}
      FOR UPDATE`;
    if (locked.length !== 1) throw new HistoricalBacklogQuarantineAbortError(['WORK_ITEM_NOT_FOUND']);
    const row = locked[0]!;
    if (row.organization_id !== manifest.organizationId || !manifest.allowedVehicleIds.includes(row.vehicle_id)) {
      throw new HistoricalBacklogQuarantineAbortError(['WORK_ITEM_TENANT_DRIFT']);
    }
    if (row.status === 'SUPERSEDED' && row.superseded_reason === 'OPERATOR' && hasQuarantineMarker(row.failure_reason)) {
      alreadySupersededIds.push(id);
      continue;
    }
    if (row.status !== 'PENDING') throw new HistoricalBacklogQuarantineAbortError(['WORK_ITEM_STATUS_DRIFT']);
    const snap = mapDbRow(row);
    if (row.lease_owner && !row.lease_expired) {
      throw new HistoricalBacklogQuarantineAbortError(['WORK_ITEM_LEASE_ACTIVE']);
    }
    if (isClaimEligibleWorkItemRow(snap) === false && snap.status === 'PENDING' && snap.leaseOwner) {
      throw new HistoricalBacklogQuarantineAbortError(['WORK_ITEM_LEASE_ACTIVE']);
    }

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
    if (updated !== 1) throw new HistoricalBacklogQuarantineAbortError(['CONDITIONAL_UPDATE_LOST']);
    supersededIds.push(id);
  }

  const postGlobal = await loadAllWorkItemSnapshots(tx);
  const postScoped = await loadScopedWorkItemSnapshots(tx, manifest);
  const safety = evaluateHistoricalBacklogSafetyProof({ manifest, globalRows: postGlobal, scopedRows: postScoped });
  if (!safety.ok) throw new HistoricalBacklogQuarantineAbortError(safety.failures);

  return { outcome: 'QUARANTINED', supersededIds, alreadySupersededIds };
}

export async function applyHistoricalBacklogQuarantine(
  prisma: Pick<import('@prisma/client').PrismaClient, '$transaction'>,
  manifest: HistoricalBacklogManifest,
  audit: { actor: string; reason: string },
  options: { ack: string | undefined },
): Promise<QuarantineApplyResult> {
  try {
    return await prisma.$transaction((tx) =>
      applyHistoricalBacklogQuarantineInTransaction(tx, manifest, audit, options),
    );
  } catch (error) {
    if (error instanceof HistoricalBacklogQuarantineAbortError) {
      return { outcome: 'REFUSED', failures: error.failures };
    }
    throw error;
  }
}
