import type { PrismaClient } from '@prisma/client';
import type { DiV0S4PipelineManifest, DiV0S4SourceFamily } from '../s4a-foundation/di-v0-s4a-contract';

export type DiV0S4ResearchWorkItemRead = {
  status: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  boundaryFingerprint: string;
  sourceFamily: DiV0S4SourceFamily;
  shadowRunId: string | null;
  completedAt: Date | null;
  pipelineVersionManifest: DiV0S4PipelineManifest;
};

export type DiV0S4ResearchEvidenceSnapshotRead = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  boundaryFingerprint: string;
  acquisitionWindowStart: Date;
  acquisitionWindowEnd: Date;
  channelManifest: unknown;
  payloadGzip: Buffer;
  uncompressedBytes: number;
};

export type DiV0S4ResearchShadowIntervalRead = {
  intervalStart: Date;
  estimatedSpeedKmh: number | null;
  motionState: string;
  speedEvidenceState: string | null;
  valueConfidence: string;
};

/** Read-only, explicit SQL access to existing S4 shadow tables (no Prisma S4 delegates). */
export class DiV0S4ResearchS4ReadRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async loadGlobalKillState(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ kill_state: string }>>`
      SELECT kill_state FROM di_v0_s4_control LIMIT 1`;
    return rows[0]?.kill_state ?? null;
  }

  async loadVehicleOrganizationId(vehicleId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ organization_id: string }>>`
      SELECT organization_id FROM vehicles WHERE id = ${vehicleId} LIMIT 1`;
    return rows[0]?.organization_id ?? null;
  }

  async loadWorkItemForResearch(scope: {
    workItemId: string;
    organizationId: string;
    tripId: string;
  }): Promise<DiV0S4ResearchWorkItemRead | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        status: string;
        pinned_snapshot_hash: string | null;
        combined_input_identity: string | null;
        boundary_fingerprint: string;
        source_family: string;
        shadow_run_id: string | null;
        completed_at: Date | null;
        pipeline_version_manifest: DiV0S4PipelineManifest;
      }>
    >`
      SELECT status, pinned_snapshot_hash, combined_input_identity, boundary_fingerprint,
        source_family, shadow_run_id, completed_at, pipeline_version_manifest
      FROM di_v0_s4_work_items
      WHERE id = ${scope.workItemId}
        AND organization_id = ${scope.organizationId}
        AND trip_id = ${scope.tripId}
      LIMIT 1`;
    const row = rows[0];
    if (!row || !row.pinned_snapshot_hash) return null;
    return {
      status: row.status,
      pinnedSnapshotHash: row.pinned_snapshot_hash,
      combinedInputIdentity: row.combined_input_identity ?? '',
      boundaryFingerprint: row.boundary_fingerprint,
      sourceFamily: row.source_family as DiV0S4SourceFamily,
      shadowRunId: row.shadow_run_id,
      completedAt: row.completed_at,
      pipelineVersionManifest: row.pipeline_version_manifest,
    };
  }

  async loadEvidenceSnapshot(scope: {
    organizationId: string;
    tripId: string;
    snapshotHash: string;
  }): Promise<DiV0S4ResearchEvidenceSnapshotRead | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        boundary_fingerprint: string;
        acquisition_window_start: Date;
        acquisition_window_end: Date;
        channel_manifest: unknown;
        payload_gzip: Buffer;
        uncompressed_bytes: number;
      }>
    >`
      SELECT organization_id, vehicle_id, trip_id, boundary_fingerprint,
        acquisition_window_start, acquisition_window_end, channel_manifest,
        payload_gzip, uncompressed_bytes
      FROM di_v0_s4_evidence_snapshots
      WHERE organization_id = ${scope.organizationId}
        AND trip_id = ${scope.tripId}
        AND snapshot_hash = ${scope.snapshotHash}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return {
      organizationId: row.organization_id,
      vehicleId: row.vehicle_id,
      tripId: row.trip_id,
      boundaryFingerprint: row.boundary_fingerprint,
      acquisitionWindowStart: row.acquisition_window_start,
      acquisitionWindowEnd: row.acquisition_window_end,
      channelManifest: row.channel_manifest,
      payloadGzip: Buffer.from(row.payload_gzip),
      uncompressedBytes: row.uncompressed_bytes,
    };
  }

  async loadShadowIntervals(scope: {
    shadowRunId: string;
    organizationId: string;
    tripId: string;
  }): Promise<DiV0S4ResearchShadowIntervalRead[]> {
    return this.prisma.$queryRaw<DiV0S4ResearchShadowIntervalRead[]>`
      SELECT interval_start AS "intervalStart",
        estimated_speed_kmh AS "estimatedSpeedKmh",
        motion_state AS "motionState",
        speed_evidence_state AS "speedEvidenceState",
        value_confidence AS "valueConfidence"
      FROM di_v0_shadow_intervals
      WHERE shadow_run_id = ${scope.shadowRunId}
        AND organization_id = ${scope.organizationId}
        AND trip_id = ${scope.tripId}`;
  }
}
