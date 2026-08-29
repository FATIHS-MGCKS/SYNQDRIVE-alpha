import type {
  DrivingAnalysisStage,
  DrivingAnalysisStageStatus,
  DrivingIntelligenceJob,
  DrivingIntelligenceJobStatus,
} from '@prisma/client';
import type { VehicleTripRouteArtifact } from '@prisma/client';
import type { RouteProcessingState } from './trip-route-canonical-read.types';

const ACTIVE_JOB_STATUSES = new Set<DrivingIntelligenceJobStatus>([
  'PENDING',
  'ENQUEUED',
  'IN_PROGRESS',
]);

const ACTIVE_STAGE_STATUSES = new Set<DrivingAnalysisStageStatus>([
  'PENDING',
  'IN_PROGRESS',
]);

/** Jobs left PENDING without retry scheduling are considered stale after this window. */
export const ROUTE_JOB_STALE_AFTER_MS = 30 * 60 * 1000;

export interface RouteProcessingDerivation {
  processingState: RouteProcessingState;
  ready: boolean;
  retryableFailure: boolean;
  failureReason: string | null;
}

function isRetryScheduled(job: DrivingIntelligenceJob, now = Date.now()): boolean {
  return job.nextRetryAt != null && job.nextRetryAt.getTime() > now;
}

function isStalePendingJob(job: DrivingIntelligenceJob, now = Date.now()): boolean {
  if (job.status !== 'PENDING') return false;
  if (isRetryScheduled(job, now)) return false;
  const anchor = job.lastAttemptAt ?? job.requestedAt;
  return now - anchor.getTime() > ROUTE_JOB_STALE_AFTER_MS;
}

function isActiveRouteJob(job: DrivingIntelligenceJob, now = Date.now()): boolean {
  if (job.status === 'IN_PROGRESS' || job.status === 'ENQUEUED') return true;
  if (job.status !== 'PENDING') return false;
  if (isRetryScheduled(job, now)) return true;
  if (job.attemptCount > 0) return true;
  return !isStalePendingJob(job, now);
}

export function deriveRouteProcessingState(input: {
  artifact: VehicleTripRouteArtifact | null;
  routeJob: DrivingIntelligenceJob | null;
  routeStage: DrivingAnalysisStage | null;
  now?: Date;
}): RouteProcessingDerivation {
  const now = input.now ?? new Date();

  // Precedence 1 — durable artifact always wins over historical job noise.
  if (input.artifact?.processedAt) {
    return {
      processingState: 'READY',
      ready: true,
      retryableFailure: false,
      failureReason: input.artifact.failureReason ?? null,
    };
  }

  const job = input.routeJob;
  const stage = input.routeStage;

  if (job?.status === 'DEAD_LETTER') {
    return {
      processingState: 'FAILED',
      ready: false,
      retryableFailure: false,
      failureReason: job.errorMessage ?? job.errorCode ?? 'ROUTE_JOB_DEAD_LETTER',
    };
  }

  if (stage?.status === 'FAILED') {
    return {
      processingState: 'FAILED',
      ready: false,
      retryableFailure: false,
      failureReason: stage.errorMessage ?? stage.errorCode ?? 'ROUTE_STAGE_FAILED',
    };
  }

  if (stage?.status === 'SKIPPED') {
    return {
      processingState: 'UNAVAILABLE',
      ready: false,
      retryableFailure: false,
      failureReason: 'ROUTE_STAGE_SKIPPED',
    };
  }

  if (job && isActiveRouteJob(job, now.getTime())) {
    if (job.status === 'PENDING' && (job.attemptCount > 0 || isRetryScheduled(job, now.getTime()))) {
      return {
        processingState: 'RETRYING',
        ready: false,
        retryableFailure: true,
        failureReason: job.errorMessage ?? job.errorCode ?? null,
      };
    }
    return {
      processingState: 'PROCESSING',
      ready: false,
      retryableFailure: false,
      failureReason: null,
    };
  }

  if (stage && ACTIVE_STAGE_STATUSES.has(stage.status) && job && isActiveRouteJob(job, now.getTime())) {
    return {
      processingState: 'PROCESSING',
      ready: false,
      retryableFailure: false,
      failureReason: null,
    };
  }

  if (job?.status === 'FAILED') {
    const retryable = job.attemptCount < job.maxAttempts && isRetryScheduled(job, now.getTime());
    return {
      processingState: retryable ? 'RETRYING' : 'FAILED',
      ready: false,
      retryableFailure: retryable,
      failureReason: job.errorMessage ?? job.errorCode ?? 'ROUTE_JOB_FAILED',
    };
  }

  if (job?.status === 'COMPLETED') {
    return {
      processingState: 'UNAVAILABLE',
      ready: false,
      retryableFailure: false,
      failureReason: 'ROUTE_ARTIFACT_MISSING',
    };
  }

  return {
    processingState: 'UNAVAILABLE',
    ready: false,
    retryableFailure: false,
    failureReason: null,
  };
}
