import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0MotionCoreShadowRunRepository } from '../motion-core-shadow-worker/di-v0-motion-core-shadow-run.repository';
import { computeDs4DrivingImpactV2 } from './ds4-driving-impact-v2.engine';
import { Ds4AssessmentOutboxRepositoryV1 } from './ds4-assessment-outbox.repository.v1';
import { computeDs4TripAssessmentV1 } from './ds4-trip-assessment-v1.engine';
import { Ds4TripAssessmentRepositoryV1 } from './ds4-trip-assessment.repository.v1';

@Injectable()
export class Ds4AssessmentProcessorServiceV1 {
  private readonly motionRuns: DiV0MotionCoreShadowRunRepository;
  private readonly assessments: Ds4TripAssessmentRepositoryV1;

  constructor(private readonly prisma: PrismaService) {
    const client = prisma as unknown as PrismaClient;
    this.motionRuns = new DiV0MotionCoreShadowRunRepository(client);
    this.assessments = new Ds4TripAssessmentRepositoryV1(client);
  }

  async processMotionRun(scope: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    sourceMotionRunId: string;
  }): Promise<{ status: 'ok' | 'skipped' | 'error'; code: string }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        organization_id: string;
        vehicle_id: string;
        trip_id: string;
        shadow_status: string;
        pinned_snapshot_hash: string;
        combined_input_identity: string;
        content_fingerprint: string;
        summary_json: { contentFingerprint?: string };
        payload_gzip: Buffer;
        created_at: Date;
      }>
    >`
      SELECT id, organization_id, vehicle_id, trip_id, shadow_status, pinned_snapshot_hash,
        combined_input_identity, content_fingerprint, summary_json, payload_gzip, created_at
      FROM di_v0_motion_core_shadow_runs_v1
      WHERE id = ${scope.sourceMotionRunId}
      LIMIT 1`;

    const row = rows[0];
    if (!row) {
      return { status: 'error', code: 'MOTION_RUN_NOT_FOUND' };
    }
    if (
      row.organization_id !== scope.organizationId ||
      row.vehicle_id !== scope.vehicleId ||
      row.trip_id !== scope.tripId
    ) {
      return { status: 'error', code: 'SCOPE_MISMATCH' };
    }

    let payload = null;
    try {
      payload = this.motionRuns.decodePayload(Buffer.from(row.payload_gzip));
    } catch {
      payload = null;
    }

    const assessment = computeDs4TripAssessmentV1({
      scope: {
        organizationId: row.organization_id,
        vehicleId: row.vehicle_id,
        tripId: row.trip_id,
      },
      motionRun: {
        id: row.id,
        organizationId: row.organization_id,
        vehicleId: row.vehicle_id,
        tripId: row.trip_id,
        shadowStatus: row.shadow_status,
        pinnedSnapshotHash: row.pinned_snapshot_hash,
        combinedInputIdentity: row.combined_input_identity,
        contentFingerprint: row.content_fingerprint,
        createdAt: row.created_at,
        summaryContentFingerprint: row.summary_json?.contentFingerprint ?? null,
      },
      payload,
    });

    const impact = computeDs4DrivingImpactV2({ assessment });
    const computedAt = new Date();

    const persist = await this.assessments.persistAssessmentAndImpact({
      scope: {
        organizationId: row.organization_id,
        vehicleId: row.vehicle_id,
        tripId: row.trip_id,
      },
      assessment,
      impact,
      sourceMotionRunCreatedAt: row.created_at,
      computedAt,
    });

    if (persist.outcome === 'superseded_skipped') {
      return { status: 'skipped', code: 'SUPERSEDED_BY_NEWER_SOURCE' };
    }
    if (persist.outcome === 'sql_error') {
      return { status: 'error', code: 'PERSIST_FAILED' };
    }
    return { status: 'ok', code: persist.outcome };
  }
}
