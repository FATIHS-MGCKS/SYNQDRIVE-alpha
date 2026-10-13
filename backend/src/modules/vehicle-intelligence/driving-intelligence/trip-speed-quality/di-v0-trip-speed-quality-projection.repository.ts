import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
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
   * Idempotent persist: same idempotency key returns existing row; otherwise supersedes prior CURRENT
   * scope row and inserts a new CURRENT projection (audit trail preserved).
   */
  async persistCurrentProjection(projection: DiV0TripSpeedQualityProjectionV1): Promise<DiV0TripSpeedQualityPersistedRow> {
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

    return this.prisma.$transaction(async (tx) => {
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
        return this.mapRow(existing[0]);
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
