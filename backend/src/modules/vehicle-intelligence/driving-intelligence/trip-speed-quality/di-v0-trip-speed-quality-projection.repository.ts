import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertDiV0TripSpeedQualityPersistAuthority,
  scopeAdvisoryLockInts,
  type DiV0TripSpeedQualityPersistAuthorityGate,
} from './di-v0-trip-speed-quality-projection.authority';
import { DiV0TripSpeedQualityProjectionPersistenceError } from './di-v0-trip-speed-quality-projection.errors';
import type { DiV0TripSpeedQualityProjectionV1 } from './di-v0-trip-speed-quality-projection.types';
import {
  buildDiV0TripSpeedQualityContentFingerprint,
  buildDiV0TripSpeedQualityIdempotencyKey,
} from './di-v0-trip-speed-quality-idempotency';

export interface DiV0TripSpeedQualityPersistedRow {
  id: string;
  organizationId: string;
  tripId: string;
  workItemId: string;
  idempotencyKey: string;
  contentFingerprint: string;
  lifecycleStatus: 'CURRENT' | 'SUPERSEDED';
  projection: DiV0TripSpeedQualityProjectionV1;
  createdAt: Date;
}

export class DiV0TripSpeedQualityProjectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<DiV0TripSpeedQualityPersistedRow | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        trip_id: string;
        work_item_id: string;
        idempotency_key: string;
        content_fingerprint: string;
        lifecycle_status: string;
        projection_json: DiV0TripSpeedQualityProjectionV1;
        created_at: Date;
      }>
    >`
      SELECT id, organization_id, trip_id, work_item_id, idempotency_key, content_fingerprint,
        lifecycle_status, projection_json, created_at
      FROM di_v0_trip_speed_quality_projections_v1
      WHERE idempotency_key = ${idempotencyKey}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * Idempotent persist: per-scope transaction advisory lock; same idempotency key returns existing row
   * (content fingerprint must match); otherwise supersedes prior CURRENT and inserts audit row.
   */
  async persistCurrentProjection(
    projection: DiV0TripSpeedQualityProjectionV1,
    authorityGate?: DiV0TripSpeedQualityPersistAuthorityGate,
  ): Promise<DiV0TripSpeedQualityPersistedRow> {
    const idempotencyKey = buildDiV0TripSpeedQualityIdempotencyKey({
      workItemId: projection.identity.workItemId,
      shadowRunId: projection.identity.shadowRunId,
      pinnedSnapshotHash: projection.identity.pinnedSnapshotHash,
      boundaryFingerprint: projection.identity.boundaryFingerprint,
      qcPolicyVersion: projection.identity.qcPolicyVersion,
      projectionVersion: projection.identity.projectionVersion,
    });
    const projectionJson = JSON.stringify(projection);
    const contentFingerprint = buildDiV0TripSpeedQualityContentFingerprint(projectionJson);
    const [lockA, lockB] = scopeAdvisoryLockInts({
      organizationId: projection.identity.organizationId,
      tripId: projection.identity.tripId,
      qcPolicyVersion: projection.identity.qcPolicyVersion,
      projectionVersion: projection.identity.projectionVersion,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockA}::int, ${lockB}::int)`;

        const existing = await tx.$queryRaw<
          Array<{
            id: string;
            organization_id: string;
            trip_id: string;
            work_item_id: string;
            idempotency_key: string;
            content_fingerprint: string;
            lifecycle_status: string;
            projection_json: DiV0TripSpeedQualityProjectionV1;
            created_at: Date;
          }>
        >`
          SELECT id, organization_id, trip_id, work_item_id, idempotency_key, content_fingerprint,
            lifecycle_status, projection_json, created_at
          FROM di_v0_trip_speed_quality_projections_v1
          WHERE idempotency_key = ${idempotencyKey}
          FOR UPDATE`;
        if (existing[0]) {
          if (existing[0].content_fingerprint !== contentFingerprint) {
            throw new DiV0TripSpeedQualityProjectionPersistenceError(
              'IDEMPOTENCY_CONTENT_MISMATCH',
              'idempotency key reuse with different projection body',
            );
          }
          if (authorityGate) {
            try {
              await assertDiV0TripSpeedQualityPersistAuthority(tx, authorityGate);
            } catch (error) {
              throw new DiV0TripSpeedQualityProjectionPersistenceError(
                'PERSIST_AUTHORITY_REJECTED',
                error instanceof Error ? error.message : String(error),
              );
            }
          }
          return this.mapRow(existing[0]);
        }

        if (authorityGate) {
          try {
            await assertDiV0TripSpeedQualityPersistAuthority(tx, authorityGate);
          } catch (error) {
            throw new DiV0TripSpeedQualityProjectionPersistenceError(
              'PERSIST_AUTHORITY_REJECTED',
              error instanceof Error ? error.message : String(error),
            );
          }
        }

        const prior = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM di_v0_trip_speed_quality_projections_v1
          WHERE organization_id = ${projection.identity.organizationId}
            AND trip_id = ${projection.identity.tripId}
            AND qc_policy_version = ${projection.identity.qcPolicyVersion}
            AND projection_version = ${projection.identity.projectionVersion}
            AND lifecycle_status = 'CURRENT'
          FOR UPDATE`;
        const newId = randomUUID();
        if (prior[0]) {
          await tx.$executeRaw`
            UPDATE di_v0_trip_speed_quality_projections_v1
            SET lifecycle_status = 'SUPERSEDED',
                superseded_by_projection_id = ${newId},
                superseded_at = clock_timestamp(),
                updated_at = clock_timestamp()
            WHERE id = ${prior[0].id}`;
        }

        await tx.$executeRaw`
          INSERT INTO di_v0_trip_speed_quality_projections_v1 (
            id, organization_id, vehicle_id, trip_id, work_item_id, shadow_run_id,
            pinned_snapshot_hash, boundary_fingerprint, qc_policy_version, projection_version,
            idempotency_key, content_fingerprint, lifecycle_status, projection_json
          ) VALUES (
            ${newId}, ${projection.identity.organizationId}, ${projection.identity.vehicleId},
            ${projection.identity.tripId}, ${projection.identity.workItemId}, ${projection.identity.shadowRunId},
            ${projection.identity.pinnedSnapshotHash}, ${projection.identity.boundaryFingerprint},
            ${projection.identity.qcPolicyVersion}, ${projection.identity.projectionVersion},
            ${idempotencyKey}, ${contentFingerprint}, 'CURRENT', ${projectionJson}::jsonb
          )`;

        const inserted = await tx.$queryRaw<
          Array<{
            id: string;
            organization_id: string;
            trip_id: string;
            work_item_id: string;
            idempotency_key: string;
            content_fingerprint: string;
            lifecycle_status: string;
            projection_json: DiV0TripSpeedQualityProjectionV1;
            created_at: Date;
          }>
        >`
          SELECT id, organization_id, trip_id, work_item_id, idempotency_key, content_fingerprint,
            lifecycle_status, projection_json, created_at
          FROM di_v0_trip_speed_quality_projections_v1 WHERE id = ${newId}`;
        return this.mapRow(inserted[0]);
      });
    } catch (error) {
      if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
        throw error;
      }
      const prismaCode = (error as { code?: string })?.code;
      if (prismaCode === 'P2002' || prismaCode === '23505') {
        const raced = await this.findByIdempotencyKey(idempotencyKey);
        if (raced) {
          if (raced.contentFingerprint !== contentFingerprint) {
            throw new DiV0TripSpeedQualityProjectionPersistenceError(
              'IDEMPOTENCY_CONTENT_MISMATCH',
              'unique race with mismatched fingerprint',
            );
          }
          return raced;
        }
        throw new DiV0TripSpeedQualityProjectionPersistenceError(
          'CURRENT_SCOPE_CONFLICT',
          'concurrent CURRENT insert lost race',
        );
      }
      throw error;
    }
  }

  async readCurrentForTrip(
    organizationId: string,
    tripId: string,
    qcPolicyVersion: string,
    projectionVersion: string,
  ): Promise<DiV0TripSpeedQualityPersistedRow | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        trip_id: string;
        work_item_id: string;
        idempotency_key: string;
        content_fingerprint: string;
        lifecycle_status: string;
        projection_json: DiV0TripSpeedQualityProjectionV1;
        created_at: Date;
      }>
    >`
      SELECT id, organization_id, trip_id, work_item_id, idempotency_key, content_fingerprint,
        lifecycle_status, projection_json, created_at
      FROM di_v0_trip_speed_quality_projections_v1
      WHERE organization_id = ${organizationId}
        AND trip_id = ${tripId}
        AND qc_policy_version = ${qcPolicyVersion}
        AND projection_version = ${projectionVersion}
        AND lifecycle_status = 'CURRENT'
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: {
    id: string;
    organization_id: string;
    trip_id: string;
    work_item_id: string;
    idempotency_key: string;
    content_fingerprint: string;
    lifecycle_status: string;
    projection_json: DiV0TripSpeedQualityProjectionV1;
    created_at: Date;
  }): DiV0TripSpeedQualityPersistedRow {
    return {
      id: row.id,
      organizationId: row.organization_id,
      tripId: row.trip_id,
      workItemId: row.work_item_id,
      idempotencyKey: row.idempotency_key,
      contentFingerprint: row.content_fingerprint,
      lifecycleStatus: row.lifecycle_status as 'CURRENT' | 'SUPERSEDED',
      projection: row.projection_json,
      createdAt: row.created_at,
    };
  }
}
