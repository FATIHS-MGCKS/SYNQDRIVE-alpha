import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0M7aRoadAssignmentShadowRunRepository } from './di-v0-m7a-road-assignment-shadow-run.repository';
import type { DiV0M7aRoadAssignmentShadowPayloadV1 } from './di-v0-m7a-road-assignment-shadow.types';

export type DiV0M7aRoadAssignmentShadowTripReadDto = {
  status: 'NOT_STARTED' | 'PENDING' | 'FAILED' | 'SUCCEEDED';
  runId: string | null;
  workItemId: string | null;
  discoveryIntentKey: string | null;
  runIntentKey: string | null;
  summary: Record<string, unknown> | null;
  buckets: DiV0M7aRoadAssignmentShadowPayloadV1['buckets'] | null;
};

@Injectable()
export class DiV0M7aRoadAssignmentShadowReadService {
  private readonly prisma: PrismaClient;
  private readonly runs: DiV0M7aRoadAssignmentShadowRunRepository;

  constructor(prisma: PrismaService) {
    this.prisma = prisma as unknown as PrismaClient;
    this.runs = new DiV0M7aRoadAssignmentShadowRunRepository(this.prisma);
  }

  async readForTrip(organizationId: string, vehicleId: string, tripId: string): Promise<DiV0M7aRoadAssignmentShadowTripReadDto> {
    const pending = await this.loadPendingOutbox(organizationId, vehicleId, tripId);
    const latest = await this.runs.findLatestRunForTrip({ organizationId, vehicleId, tripId });
    if (!latest) {
      return {
        status: pending ? 'PENDING' : 'NOT_STARTED',
        runId: null,
        workItemId: pending?.workItemId ?? null,
        discoveryIntentKey: pending?.shadowIntentKey ?? null,
        runIntentKey: null,
        summary: null,
        buckets: null,
      };
    }
    if (latest.shadowStatus === 'SUCCEEDED') {
      const payload = this.runs.decodePayload(latest.payloadGzip);
      return {
        status: 'SUCCEEDED',
        runId: latest.id,
        workItemId: latest.workItemId,
        discoveryIntentKey: latest.summaryJson.discoveryIntentKey,
        runIntentKey: latest.summaryJson.runIntentKey,
        summary: latest.summaryJson as Record<string, unknown>,
        buckets: payload.buckets,
      };
    }
    return {
      status: 'FAILED',
      runId: latest.id,
      workItemId: latest.workItemId,
      discoveryIntentKey: latest.summaryJson.discoveryIntentKey,
      runIntentKey: latest.summaryJson.runIntentKey,
      summary: latest.summaryJson as Record<string, unknown>,
      buckets: null,
    };
  }

  private async loadPendingOutbox(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<{ workItemId: string; shadowIntentKey: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ work_item_id: string; shadow_intent_key: string }>>`
      SELECT work_item_id, shadow_intent_key
      FROM di_v0_m7a_road_assignment_shadow_outbox_v1
      WHERE organization_id = ${organizationId}
        AND vehicle_id = ${vehicleId}
        AND trip_id = ${tripId}
        AND status IN ('PENDING', 'PROCESSING', 'FAILED_RETRYABLE')
      ORDER BY created_at DESC
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    return { workItemId: row.work_item_id, shadowIntentKey: row.shadow_intent_key };
  }
}
