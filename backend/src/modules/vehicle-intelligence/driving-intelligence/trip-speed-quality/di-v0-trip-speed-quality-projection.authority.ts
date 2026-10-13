import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';

export interface DiV0TripSpeedQualityPersistAuthorityGate {
  organizationId: string;
  tripId: string;
  workItemId: string;
  boundaryFingerprint: string;
  pinnedSnapshotHash: string;
  shadowRunId: string;
}

type Tx = Prisma.TransactionClient;

export async function resolveDiV0S4ActivePrimaryWorkItemId(
  tx: Tx,
  organizationId: string,
  tripId: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM di_v0_s4_work_items
    WHERE organization_id = ${organizationId}
      AND trip_id = ${tripId}
      AND run_purpose = 'PRIMARY'
      AND purpose_discriminator = 'PRIMARY'
      AND status <> 'SUPERSEDED'
    ORDER BY boundary_occurrence DESC, created_at DESC
    LIMIT 1`;
  return rows[0]?.id ?? null;
}

export async function assertDiV0TripSpeedQualityPersistAuthority(
  tx: Tx,
  gate: DiV0TripSpeedQualityPersistAuthorityGate,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{
      id: string;
      organization_id: string;
      trip_id: string;
      status: string;
      run_purpose: string;
      purpose_discriminator: string;
      boundary_fingerprint: string;
      pinned_snapshot_hash: string | null;
      shadow_run_id: string | null;
    }>
  >`
    SELECT id, organization_id, trip_id, status, run_purpose::text AS run_purpose, purpose_discriminator,
      boundary_fingerprint, pinned_snapshot_hash, shadow_run_id
    FROM di_v0_s4_work_items WHERE id = ${gate.workItemId} FOR UPDATE`;
  const wi = rows[0];
  if (!wi) {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:WORK_ITEM_NOT_FOUND');
  }
  if (wi.organization_id !== gate.organizationId || wi.trip_id !== gate.tripId) {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:TENANT_SCOPE_MISMATCH');
  }
  if (wi.status === 'SUPERSEDED') {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:WORK_ITEM_SUPERSEDED');
  }
  if (wi.status !== 'COMPLETED' || wi.run_purpose !== 'PRIMARY' || wi.purpose_discriminator !== 'PRIMARY') {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:WORK_ITEM_NOT_ELIGIBLE');
  }
  if (wi.boundary_fingerprint !== gate.boundaryFingerprint) {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:BOUNDARY_FINGERPRINT_MISMATCH');
  }
  if (wi.pinned_snapshot_hash !== gate.pinnedSnapshotHash) {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:PINNED_SNAPSHOT_MISMATCH');
  }
  if (wi.shadow_run_id !== gate.shadowRunId) {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:SHADOW_RUN_MISMATCH');
  }
  const activeId = await resolveDiV0S4ActivePrimaryWorkItemId(tx, gate.organizationId, gate.tripId);
  if (activeId !== gate.workItemId) {
    throw new Error('DI_V0_TRIP_SPEED_QUALITY:PERSIST_AUTHORITY:NOT_ACTIVE_PRIMARY');
  }
}

export function scopeAdvisoryLockInts(input: {
  organizationId: string;
  tripId: string;
  qcPolicyVersion: string;
  projectionVersion: string;
}): [number, number] {
  const digest = createHash('sha256')
    .update(
      [input.organizationId, input.tripId, input.qcPolicyVersion, input.projectionVersion].join('|'),
      'utf8',
    )
    .digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}
