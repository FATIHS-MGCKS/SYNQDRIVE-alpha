import type { PrismaClient } from '@prisma/client';
import type { DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';
import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../s4d-replay/di-v0-s4d-verified-snapshot';
import { buildDiV0TripSpeedQualityProjectionV1 } from './build-di-v0-trip-speed-quality-projection.v1';
import { resolveDiV0TripSpeedQualityCalibrationBundle } from './di-v0-trip-speed-quality-calibration';
import { buildDiV0TripSpeedQualityEvidenceFromParsedContainer } from './di-v0-trip-speed-quality-evidence';
import {
  DiV0TripSpeedQualityProjectionError,
  mapPersistAuthorityError,
  DiV0TripSpeedQualityProjectionPersistenceError,
} from './di-v0-trip-speed-quality-projection.errors';
import {
  DiV0TripSpeedQualityProjectionRepository,
  type DiV0TripSpeedQualityPersistedRow,
} from './di-v0-trip-speed-quality-projection.repository';
import type { DiV0TripSpeedQualityShadowRow } from './build-di-v0-trip-speed-quality-projection.v1';

type SnapshotRow = {
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  boundary_fingerprint: string;
  acquisition_window_start: Date;
  acquisition_window_end: Date;
  channel_manifest: unknown;
  payload_gzip: Buffer;
  uncompressed_bytes: number | bigint;
};

export class DiV0TripSpeedQualityProjectionService {
  private readonly repository: DiV0TripSpeedQualityProjectionRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new DiV0TripSpeedQualityProjectionRepository(prisma);
  }

  /**
   * Projects speed quality for a COMPLETED PRIMARY work item. Isolated from S4 T06 completion —
   * callers must invoke explicitly (no scheduler wiring in P2).
   */
  async projectForWorkItem(
    organizationId: string,
    workItemId: string,
  ): Promise<DiV0TripSpeedQualityPersistedRow> {
    const wi = await this.loadWorkItem(workItemId);
    if (!wi) {
      throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_NOT_FOUND', workItemId);
    }
    if (wi.organization_id !== organizationId) {
      throw new DiV0TripSpeedQualityProjectionError('TENANT_SCOPE_MISMATCH', 'organization mismatch');
    }
    if (wi.status === 'SUPERSEDED') {
      throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_SUPERSEDED', 'superseded work item');
    }
    if (wi.status !== 'COMPLETED' || wi.run_purpose !== 'PRIMARY' || wi.purpose_discriminator !== 'PRIMARY') {
      throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_NOT_ELIGIBLE', 'not completed primary');
    }
    const activeId = await this.resolveActivePrimaryWorkItemId(wi.organization_id, wi.trip_id);
    if (activeId !== workItemId) {
      throw new DiV0TripSpeedQualityProjectionError('NOT_ACTIVE_PRIMARY', `active primary is ${activeId ?? 'none'}`);
    }
    if (wi.shadow_run_id == null) {
      throw new DiV0TripSpeedQualityProjectionError('MISSING_SHADOW_RUN', 'shadow_run_id null');
    }
    if (wi.pinned_snapshot_hash == null) {
      throw new DiV0TripSpeedQualityProjectionError('MISSING_PINNED_SNAPSHOT', 'pinned snapshot required');
    }

    const snapshotRows = await this.prisma.$queryRaw<SnapshotRow[]>`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint, acquisition_window_start,
        acquisition_window_end, channel_manifest, payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${wi.organization_id}
        AND trip_id = ${wi.trip_id}
        AND snapshot_hash = ${wi.pinned_snapshot_hash}`;
    const snapshot = snapshotRows[0];
    if (!snapshot) {
      throw new DiV0TripSpeedQualityProjectionError('SNAPSHOT_VERIFICATION_FAILED', 'snapshot row missing');
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

    const shadowRun = await this.prisma.diV0ShadowRun.findFirst({
      where: { id: wi.shadow_run_id, organizationId: wi.organization_id, tripId: wi.trip_id },
      select: { inputEvidenceVersion: true, calibrationVersion: true },
    });
    if (!shadowRun) {
      throw new DiV0TripSpeedQualityProjectionError('MISSING_SHADOW_RUN', 'shadow run row missing');
    }
    let calibration;
    try {
      calibration = resolveDiV0TripSpeedQualityCalibrationBundle(shadowRun.calibrationVersion);
    } catch {
      throw new DiV0TripSpeedQualityProjectionError(
        'UNSUPPORTED_CALIBRATION_VERSION',
        shadowRun.calibrationVersion,
      );
    }

    const evidence = buildDiV0TripSpeedQualityEvidenceFromParsedContainer(verified.parsed, calibration);
    const shadowIntervals = await this.loadShadowIntervals(wi.shadow_run_id, wi.organization_id, wi.trip_id);
    if (shadowIntervals.length === 0) {
      throw new DiV0TripSpeedQualityProjectionError('SHADOW_INTERVALS_MISSING', 'no intervals');
    }

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
      shadowInputEvidenceVersion: shadowRun.inputEvidenceVersion ?? null,
      workItemCompletedAt: wi.completed_at,
      snapshotVerified: true,
      evidence,
      shadowIntervals,
    });

    try {
      return await this.repository.persistCurrentProjection(projection, {
        organizationId: wi.organization_id,
        tripId: wi.trip_id,
        workItemId: wi.id,
        boundaryFingerprint: wi.boundary_fingerprint,
        pinnedSnapshotHash: wi.pinned_snapshot_hash,
        shadowRunId: wi.shadow_run_id,
      });
    } catch (error) {
      if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
        if (error.code === 'IDEMPOTENCY_CONTENT_MISMATCH') {
          throw new DiV0TripSpeedQualityProjectionError('IDEMPOTENCY_CONTENT_MISMATCH', error.message);
        }
        throw mapPersistAuthorityError(error);
      }
      throw error;
    }
  }

  async readCurrentOpsProjection(
    organizationId: string,
    tripId: string,
  ): Promise<DiV0TripSpeedQualityPersistedRow | null> {
    const { DI_V0_SPEED_QC_POLICY_V1 } = await import('../speed-qc/di-v0-speed-qc-policy.version');
    const { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } = await import('./di-v0-trip-speed-quality-projection.version');
    const row = await this.repository.readCurrentForTrip(
      organizationId,
      tripId,
      DI_V0_SPEED_QC_POLICY_V1,
      DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
    );
    if (!row) return null;
    const activeId = await this.resolveActivePrimaryWorkItemId(organizationId, tripId);
    if (activeId !== row.workItemId) {
      return null;
    }
    const wi = await this.loadWorkItem(row.workItemId);
    if (!wi || wi.organization_id !== organizationId || wi.trip_id !== tripId) {
      return null;
    }
    if (wi.status !== 'COMPLETED' || wi.run_purpose !== 'PRIMARY' || wi.purpose_discriminator !== 'PRIMARY') {
      return null;
    }
    return row;
  }

  private async resolveActivePrimaryWorkItemId(organizationId: string, tripId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
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

  private async loadWorkItem(workItemId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        source_family: string;
        run_purpose: string;
        purpose_discriminator: string;
        status: string;
        boundary_fingerprint: string;
        shadow_run_id: string | null;
        pinned_snapshot_hash: string | null;
        combined_input_identity: string | null;
        completed_at: Date | null;
      }>
    >`
      SELECT id, organization_id, vehicle_id, trip_id, source_family::text AS source_family,
        run_purpose::text AS run_purpose, purpose_discriminator, status, boundary_fingerprint,
        shadow_run_id, pinned_snapshot_hash, combined_input_identity, completed_at
      FROM di_v0_s4_work_items WHERE id = ${workItemId}`;
    return rows[0] ?? null;
  }

  private async loadShadowIntervals(
    shadowRunId: string,
    organizationId: string,
    tripId: string,
  ): Promise<DiV0TripSpeedQualityShadowRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        interval_start: Date;
        interval_end: Date;
        reference_time: Date;
        motion_state: string;
        position_state: string;
        estimated_speed_kmh: number | null;
        speed_evidence_state: string | null;
        value_confidence: string;
        source_relation: string;
        abstention_reason: string | null;
        evidence_sources: unknown;
        source_quality_flags: unknown;
      }>
    >`
      SELECT interval_start, interval_end, reference_time, motion_state, position_state,
        estimated_speed_kmh, speed_evidence_state, value_confidence, source_relation,
        abstention_reason, evidence_sources, source_quality_flags
      FROM di_v0_shadow_intervals
      WHERE shadow_run_id = ${shadowRunId}
        AND organization_id = ${organizationId}
        AND trip_id = ${tripId}
      ORDER BY reference_time ASC`;
    return rows.map((r) => ({
      intervalStart: r.interval_start,
      intervalEnd: r.interval_end,
      referenceTime: r.reference_time,
      motionState: r.motion_state,
      positionState: r.position_state,
      estimatedSpeedKmh: r.estimated_speed_kmh,
      speedEvidenceState: r.speed_evidence_state,
      valueConfidence: r.value_confidence,
      sourceRelation: r.source_relation,
      abstentionReason: r.abstention_reason,
      evidenceSources: r.evidence_sources,
      sourceQualityFlags: r.source_quality_flags,
    }));
  }
}
