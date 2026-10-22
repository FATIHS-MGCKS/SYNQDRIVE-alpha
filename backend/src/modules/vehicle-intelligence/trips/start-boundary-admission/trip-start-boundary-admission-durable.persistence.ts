import type { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { TripMetricsService } from '../../../observability/trip-metrics.service';
import type { StartBoundaryEvidenceContext } from './trip-start-boundary-legacy-resolution';
import type { ShadowStartBoundaryAdmissionSummary } from './trip-start-boundary-admission-shadow.runtime';

export const START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY =
  'startBoundaryAdmissionShadowV1';

export const START_BOUNDARY_ADMISSION_SHADOW_DURABLE_VERSION = 'p1b10-v1';

export type StartBoundaryAdmissionShadowExecutionStatus =
  | 'EXECUTED'
  | 'NOT_EXECUTED';

export type StartBoundaryAdmissionShadowNotExecutedReason =
  | 'SHADOW_DISABLED'
  | 'MID_TRIP_GAP_SPLIT_FOLLOW_ON'
  | 'SHADOW_RUNNER_SKIPPED';

export type StartBoundaryAdmissionShadowPersistenceStatus =
  | 'WRITTEN'
  | 'SKIPPED_ALREADY_PRESENT'
  | 'FAILED';

export type StartBoundaryAdmissionShadowDataSourcesAtDecision = {
  corePointCount: number;
  segmentCount: number;
  routePointCountInEvidence: number;
  matchingSegmentPresent: boolean;
  legacyRouteFetchPerformed: boolean;
  additionalShadowRouteFetchPerformed: boolean | null;
};

export type StartBoundaryAdmissionShadowDurableRecord = {
  version: typeof START_BOUNDARY_ADMISSION_SHADOW_DURABLE_VERSION;
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  decisionAt: string;
  releaseSha: string | null;
  executionStatus: StartBoundaryAdmissionShadowExecutionStatus;
  notExecutedReason?: StartBoundaryAdmissionShadowNotExecutedReason;
  fsmCandidateStartAt: string;
  fsmConfirmationAt: string;
  shadow: ShadowStartBoundaryAdmissionSummary | null;
  dataSourcesAtDecision: StartBoundaryAdmissionShadowDataSourcesAtDecision;
  persistence: {
    status: StartBoundaryAdmissionShadowPersistenceStatus;
    persistedAt: string;
    errorMessage?: string;
  };
};

function asRecord(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta as Record<string, unknown>;
}

export function readStartBoundaryAdmissionShadowDurable(
  rawDetectionMeta: unknown,
): StartBoundaryAdmissionShadowDurableRecord | null {
  const raw = asRecord(rawDetectionMeta)[
    START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY
  ];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as StartBoundaryAdmissionShadowDurableRecord;
}

function resolveReleaseSha(env: NodeJS.ProcessEnv = process.env): string | null {
  const sha = env.SYNQDRIVE_DEPLOYED_GIT_SHA?.trim();
  if (!sha || sha.length < 8) return null;
  return sha;
}

export function buildStartBoundaryAdmissionShadowDataSourcesAtDecision(params: {
  evidence: StartBoundaryEvidenceContext;
  corePointCount: number;
  shadowSummary: ShadowStartBoundaryAdmissionSummary | null;
}): StartBoundaryAdmissionShadowDataSourcesAtDecision {
  return {
    corePointCount: params.corePointCount,
    segmentCount: params.evidence.segments.length,
    routePointCountInEvidence: params.evidence.routePoints.length,
    matchingSegmentPresent: params.evidence.matchingSegment != null,
    legacyRouteFetchPerformed: params.evidence.legacyRouteFetchPerformed,
    additionalShadowRouteFetchPerformed:
      params.shadowSummary?.additionalShadowRouteFetchPerformed ?? null,
  };
}

export function buildStartBoundaryAdmissionShadowDurableRecord(params: {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  candidateStartAt: Date;
  confirmedAt: Date;
  shadowSummary: ShadowStartBoundaryAdmissionSummary | null;
  shadowEnabled: boolean;
  evidence: StartBoundaryEvidenceContext;
  corePointCount: number;
  notExecutedReason?: StartBoundaryAdmissionShadowNotExecutedReason;
  env?: NodeJS.ProcessEnv;
}): StartBoundaryAdmissionShadowDurableRecord {
  const executed =
    params.shadowSummary != null &&
    params.shadowEnabled &&
    params.notExecutedReason == null;

  const executionStatus: StartBoundaryAdmissionShadowExecutionStatus = executed
    ? 'EXECUTED'
    : 'NOT_EXECUTED';

  let notExecutedReason = params.notExecutedReason;
  if (executionStatus === 'NOT_EXECUTED' && !notExecutedReason) {
    notExecutedReason = params.shadowEnabled
      ? 'SHADOW_RUNNER_SKIPPED'
      : 'SHADOW_DISABLED';
  }

  return {
    version: START_BOUNDARY_ADMISSION_SHADOW_DURABLE_VERSION,
    tripId: params.tripId,
    vehicleId: params.vehicleId,
    organizationId: params.organizationId,
    decisionAt: params.confirmedAt.toISOString(),
    releaseSha: resolveReleaseSha(params.env),
    executionStatus,
    ...(executionStatus === 'NOT_EXECUTED' && notExecutedReason
      ? { notExecutedReason }
      : {}),
    fsmCandidateStartAt: params.candidateStartAt.toISOString(),
    fsmConfirmationAt: params.confirmedAt.toISOString(),
    shadow: executed ? params.shadowSummary : null,
    dataSourcesAtDecision: buildStartBoundaryAdmissionShadowDataSourcesAtDecision(
      {
        evidence: params.evidence,
        corePointCount: params.corePointCount,
        shadowSummary: params.shadowSummary,
      },
    ),
    persistence: {
      status: 'WRITTEN',
      persistedAt: new Date().toISOString(),
    },
  };
}

export function mergeStartBoundaryAdmissionShadowDurableIntoRawMeta(
  existingMeta: unknown,
  record: StartBoundaryAdmissionShadowDurableRecord,
): Record<string, unknown> {
  const base = asRecord(existingMeta);
  if (readStartBoundaryAdmissionShadowDurable(base)) {
    return base;
  }
  return {
    ...base,
    [START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY]: record,
  };
}

export function mergeMidGapSplitFollowOnShadowNotExecutedMeta(
  existingMeta: unknown,
  params: {
    tripId: string;
    vehicleId: string;
    organizationId: string | null;
    secondStartAt: Date;
    splitFromTripId: string;
  },
): Record<string, unknown> {
  const base = asRecord(existingMeta);
  if (readStartBoundaryAdmissionShadowDurable(base)) {
    return base;
  }
  const record: StartBoundaryAdmissionShadowDurableRecord = {
    version: START_BOUNDARY_ADMISSION_SHADOW_DURABLE_VERSION,
    tripId: params.tripId,
    vehicleId: params.vehicleId,
    organizationId: params.organizationId,
    decisionAt: params.secondStartAt.toISOString(),
    releaseSha: resolveReleaseSha(),
    executionStatus: 'NOT_EXECUTED',
    notExecutedReason: 'MID_TRIP_GAP_SPLIT_FOLLOW_ON',
    fsmCandidateStartAt: params.secondStartAt.toISOString(),
    fsmConfirmationAt: params.secondStartAt.toISOString(),
    shadow: null,
    dataSourcesAtDecision: {
      corePointCount: 0,
      segmentCount: 0,
      routePointCountInEvidence: 0,
      matchingSegmentPresent: false,
      legacyRouteFetchPerformed: false,
      additionalShadowRouteFetchPerformed: null,
    },
    persistence: {
      status: 'WRITTEN',
      persistedAt: new Date().toISOString(),
    },
  };
  return {
    ...base,
    [START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY]: record,
    splitFrom: params.splitFromTripId,
  };
}

export type PersistStartBoundaryAdmissionShadowDurableParams = {
  tripId: string;
  vehicleId: string;
  organizationId: string | null;
  candidateStartAt: Date;
  confirmedAt: Date;
  shadowSummary: ShadowStartBoundaryAdmissionSummary | null;
  shadowEnabled: boolean;
  evidence: StartBoundaryEvidenceContext;
  corePointCount: number;
  notExecutedReason?: StartBoundaryAdmissionShadowNotExecutedReason;
  prisma: PrismaService | Prisma.TransactionClient;
  tripMetrics?: TripMetricsService | null;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
};

type AtomicShadowInsertOutcome = 'inserted' | 'skipped' | 'not_found' | 'vehicle_mismatch';

/**
 * Merges top-level JSON keys into raw_detection_meta without removing existing keys.
 */
export async function atomicMergeVehicleTripRawDetectionMetaPatch(
  prisma: PrismaService | Prisma.TransactionClient,
  params: {
    tripId: string;
    vehicleId: string;
    patch: Record<string, unknown>;
  },
): Promise<void> {
  const payload = JSON.stringify(params.patch);
  await prisma.$executeRaw`
    UPDATE vehicle_trips
    SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb) || ${payload}::jsonb
    WHERE id = ${params.tripId}::uuid
      AND vehicle_id = ${params.vehicleId}
  `;
}

export function buildMidGapSplitFirstTripRawDetectionMetaPatch(params: {
  reason: string;
  triggeredBy: string;
  gapMs: number;
  firstEndAt: Date;
  secondStartAt: Date;
  splitDriftM?: number | null;
}): Record<string, unknown> {
  return {
    splitReason: params.reason,
    splitTriggeredBy: params.triggeredBy,
    splitGapMs: params.gapMs,
    splitFirstEndAt: params.firstEndAt.toISOString(),
    splitSecondStartAt: params.secondStartAt.toISOString(),
    ...(params.splitDriftM != null ? { splitDriftM: params.splitDriftM } : {}),
  };
}

export async function atomicInsertStartBoundaryAdmissionShadowDurable(
  prisma: PrismaService | Prisma.TransactionClient,
  params: {
    tripId: string;
    vehicleId: string;
    record: StartBoundaryAdmissionShadowDurableRecord;
  },
): Promise<AtomicShadowInsertOutcome> {
  const payload = JSON.stringify(params.record);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE vehicle_trips
    SET raw_detection_meta = COALESCE(raw_detection_meta, '{}'::jsonb)
      || jsonb_build_object(${START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY}, ${payload}::jsonb)
    WHERE id = ${params.tripId}::uuid
      AND vehicle_id = ${params.vehicleId}
      AND NOT (
        COALESCE(raw_detection_meta, '{}'::jsonb) ? ${START_BOUNDARY_ADMISSION_SHADOW_DURABLE_META_KEY}
      )
    RETURNING id
  `;
  if (rows.length > 0) {
    return 'inserted';
  }

  const existing = await prisma.vehicleTrip.findUnique({
    where: { id: params.tripId },
    select: { vehicleId: true, rawDetectionMeta: true },
  });
  if (!existing) {
    return 'not_found';
  }
  if (existing.vehicleId !== params.vehicleId) {
    return 'vehicle_mismatch';
  }
  if (readStartBoundaryAdmissionShadowDurable(existing.rawDetectionMeta)) {
    return 'skipped';
  }
  return 'not_found';
}

export async function persistStartBoundaryAdmissionShadowDurable(
  params: PersistStartBoundaryAdmissionShadowDurableParams,
): Promise<StartBoundaryAdmissionShadowPersistenceStatus> {
  const record = buildStartBoundaryAdmissionShadowDurableRecord({
    tripId: params.tripId,
    vehicleId: params.vehicleId,
    organizationId: params.organizationId,
    candidateStartAt: params.candidateStartAt,
    confirmedAt: params.confirmedAt,
    shadowSummary: params.shadowSummary,
    shadowEnabled: params.shadowEnabled,
    evidence: params.evidence,
    corePointCount: params.corePointCount,
    notExecutedReason: params.notExecutedReason,
    env: params.env,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const outcome = await atomicInsertStartBoundaryAdmissionShadowDurable(
        params.prisma,
        {
          tripId: params.tripId,
          vehicleId: params.vehicleId,
          record,
        },
      );
      if (outcome === 'inserted') {
        return 'WRITTEN';
      }
      if (outcome === 'skipped') {
        return 'SKIPPED_ALREADY_PRESENT';
      }
      if (outcome === 'vehicle_mismatch') {
        throw new Error(
          `trip ${params.tripId} vehicle mismatch expected=${params.vehicleId}`,
        );
      }
      throw new Error(`trip ${params.tripId} not found`);
    } catch (err) {
      if (attempt === 1) {
        params.tripMetrics?.tripStartBoundaryAdmissionShadowErrors?.inc({
          phase: 'durable_persist',
        });
        params.logger?.warn(
          `Start boundary admission shadow durable persist failed (non-blocking): trip=${params.tripId} vehicle=${params.vehicleId} ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return 'FAILED';
      }
    }
  }
  return 'FAILED';
}

export async function readStartBoundaryAdmissionShadowDurableForOrgScopedTrip(
  prisma: PrismaService,
  params: { tripId: string; organizationId: string },
): Promise<StartBoundaryAdmissionShadowDurableRecord | null> {
  const trip = await prisma.vehicleTrip.findFirst({
    where: {
      id: params.tripId,
      vehicle: { organizationId: params.organizationId },
    },
    select: { rawDetectionMeta: true },
  });
  if (!trip) return null;
  return readStartBoundaryAdmissionShadowDurable(trip.rawDetectionMeta);
}
