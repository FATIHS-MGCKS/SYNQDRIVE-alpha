import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DiV0M7aRoadAssignmentShadowRunRepository } from './di-v0-m7a-road-assignment-shadow-run.repository';
import type { DiV0M7aRoadAssignmentShadowPayloadV1 } from './di-v0-m7a-road-assignment-shadow.types';
import {
  buildM7aTripMapOutcomeSummary,
  mapM7aTripMapPoints,
  resolveM7aTripMapGeometry,
  stripM7aTripMapPointGeometry,
} from './di-v0-m7a-road-assignment-shadow-trip-map-read.mapper';
import type {
  DiV0M7aRoadAssignmentShadowTripMapGeometrySource,
  DiV0M7aRoadAssignmentShadowTripMapOutcomeSummary,
  DiV0M7aRoadAssignmentShadowTripMapPointDto,
} from './di-v0-m7a-road-assignment-shadow-trip-map-read.types';

export type DiV0M7aRoadAssignmentShadowTripReadStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'FAILED'
  | 'ROAD_CONTEXT_UNAVAILABLE'
  | 'SUCCEEDED';

export type DiV0M7aRoadAssignmentShadowTripReadDto = {
  status: DiV0M7aRoadAssignmentShadowTripReadStatus;
  runId: string | null;
  workItemId: string | null;
  discoveryIntentKey: string | null;
  runIntentKey: string | null;
  summary: Record<string, unknown> | null;
  buckets: DiV0M7aRoadAssignmentShadowPayloadV1['buckets'] | null;
  previewLabel: 'M7A Straßenzuordnung · vorläufig';
  pinnedSnapshotHash: string | null;
  combinedInputIdentity: string | null;
  osmSnapshotSha256: string | null;
  computedAtUtc: string | null;
  geometrySource: DiV0M7aRoadAssignmentShadowTripMapGeometrySource;
  geometryNote: string | null;
  mapPoints: DiV0M7aRoadAssignmentShadowTripMapPointDto[];
  outcomeSummary: DiV0M7aRoadAssignmentShadowTripMapOutcomeSummary | null;
  limitations: string[];
  failureCode: string | null;
};

const MAP_IDLE: Pick<
  DiV0M7aRoadAssignmentShadowTripReadDto,
  | 'previewLabel'
  | 'pinnedSnapshotHash'
  | 'combinedInputIdentity'
  | 'osmSnapshotSha256'
  | 'computedAtUtc'
  | 'geometrySource'
  | 'geometryNote'
  | 'mapPoints'
  | 'outcomeSummary'
  | 'limitations'
  | 'failureCode'
> = {
  previewLabel: 'M7A Straßenzuordnung · vorläufig',
  pinnedSnapshotHash: null,
  combinedInputIdentity: null,
  osmSnapshotSha256: null,
  computedAtUtc: null,
  geometrySource: 'NONE',
  geometryNote: null,
  mapPoints: [],
  outcomeSummary: null,
  limitations: [],
  failureCode: null,
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
        ...MAP_IDLE,
      };
    }
    if (latest.shadowStatus === 'SUCCEEDED') {
      const payload = this.runs.decodePayload(latest.payloadGzip);
      const mapFields = this.buildMapFieldsFromPayload(payload);
      return {
        status: 'SUCCEEDED',
        runId: latest.id,
        workItemId: latest.workItemId,
        discoveryIntentKey: latest.summaryJson.discoveryIntentKey,
        runIntentKey: latest.summaryJson.runIntentKey,
        summary: latest.summaryJson as Record<string, unknown>,
        buckets: payload.buckets,
        ...mapFields,
      };
    }
    if (latest.shadowStatus === 'ROAD_CONTEXT_UNAVAILABLE') {
      return {
        status: 'ROAD_CONTEXT_UNAVAILABLE',
        runId: latest.id,
        workItemId: latest.workItemId,
        discoveryIntentKey: latest.summaryJson.discoveryIntentKey,
        runIntentKey: latest.summaryJson.runIntentKey,
        summary: latest.summaryJson as Record<string, unknown>,
        buckets: null,
        ...MAP_IDLE,
        failureCode: latest.summaryJson.errorCode ?? 'ROAD_CONTEXT_UNAVAILABLE',
        limitations: ['ROAD_CONTEXT_UNAVAILABLE'],
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
      ...MAP_IDLE,
      failureCode: latest.summaryJson.errorCode ?? latest.shadowStatus,
    };
  }

  private buildMapFieldsFromPayload(
    payload: DiV0M7aRoadAssignmentShadowPayloadV1,
  ): Pick<
    DiV0M7aRoadAssignmentShadowTripReadDto,
    | 'previewLabel'
    | 'pinnedSnapshotHash'
    | 'combinedInputIdentity'
    | 'osmSnapshotSha256'
    | 'computedAtUtc'
    | 'geometrySource'
    | 'geometryNote'
    | 'mapPoints'
    | 'outcomeSummary'
    | 'limitations'
    | 'failureCode'
  > {
    let mapPoints = mapM7aTripMapPoints(payload.buckets);
    const limitations: string[] = [];
    const legacyWithoutAnchors = mapPoints.every((p) => !p.positionResolved);
    if (legacyWithoutAnchors) {
      limitations.push('LEGACY_RUN_WITHOUT_POSITION_ANCHORS');
      mapPoints = stripM7aTripMapPointGeometry(mapPoints);
    }
    const { geometrySource, geometryNote } = resolveM7aTripMapGeometry(mapPoints);
    return {
      previewLabel: 'M7A Straßenzuordnung · vorläufig',
      pinnedSnapshotHash: payload.contract.pinnedSnapshotHash,
      combinedInputIdentity: payload.contract.combinedInputIdentity,
      osmSnapshotSha256: payload.contract.osmSnapshotSha256,
      computedAtUtc: payload.contract.computedAtUtc,
      geometrySource,
      geometryNote,
      mapPoints,
      outcomeSummary: buildM7aTripMapOutcomeSummary(payload),
      limitations,
      failureCode: null,
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
