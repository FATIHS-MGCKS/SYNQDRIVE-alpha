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

export interface RouteProcessingDerivation {
  processingState: RouteProcessingState;
  ready: boolean;
  retryableFailure: boolean;
  failureReason: string | null;
}

export function deriveRouteProcessingState(input: {
  artifact: VehicleTripRouteArtifact | null;
  routeJob: DrivingIntelligenceJob | null;
  routeStage: DrivingAnalysisStage | null;
}): RouteProcessingDerivation {
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

  if (job) {
    if (job.status === 'FAILED') {
      const retryable = job.attemptCount < job.maxAttempts;
      return {
        processingState: retryable ? 'RETRYING' : 'FAILED',
        ready: false,
        retryableFailure: retryable,
        failureReason: job.errorMessage ?? job.errorCode ?? 'ROUTE_JOB_FAILED',
      };
    }

    if (ACTIVE_JOB_STATUSES.has(job.status)) {
      if (job.status === 'PENDING' && job.attemptCount > 0) {
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

    if (job.status === 'COMPLETED' && !input.artifact) {
      return {
        processingState: 'UNAVAILABLE',
        ready: false,
        retryableFailure: false,
        failureReason: 'ROUTE_ARTIFACT_MISSING',
      };
    }
  }

  if (stage && ACTIVE_STAGE_STATUSES.has(stage.status)) {
    return {
      processingState: 'PROCESSING',
      ready: false,
      retryableFailure: false,
      failureReason: null,
    };
  }

  return {
    processingState: 'UNAVAILABLE',
    ready: false,
    retryableFailure: false,
    failureReason: null,
  };
}
