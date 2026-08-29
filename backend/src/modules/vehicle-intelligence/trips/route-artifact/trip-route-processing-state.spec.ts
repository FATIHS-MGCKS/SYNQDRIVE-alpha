import { deriveRouteProcessingState, ROUTE_JOB_STALE_AFTER_MS } from './trip-route-processing-state';

const baseArtifact = {
  processedAt: new Date('2026-08-29T12:00:00.000Z'),
  failureReason: null,
} as any;

const now = new Date('2026-08-29T13:00:00.000Z');

describe('deriveRouteProcessingState', () => {
  it('returns READY when artifact is processed', () => {
    expect(
      deriveRouteProcessingState({
        artifact: baseArtifact,
        routeJob: null,
        routeStage: null,
        now,
      }),
    ).toEqual({
      processingState: 'READY',
      ready: true,
      retryableFailure: false,
      failureReason: null,
    });
  });

  it('READY artifact beats stale failed job', () => {
    expect(
      deriveRouteProcessingState({
        artifact: baseArtifact,
        routeJob: {
          status: 'FAILED',
          attemptCount: 3,
          maxAttempts: 3,
          errorMessage: 'old_failure',
        } as any,
        routeStage: null,
        now,
      }).processingState,
    ).toBe('READY');
  });

  it('returns PROCESSING for active route jobs', () => {
    expect(
      deriveRouteProcessingState({
        artifact: null,
        routeJob: { status: 'IN_PROGRESS', attemptCount: 0, maxAttempts: 3 } as any,
        routeStage: null,
        now,
      }).processingState,
    ).toBe('PROCESSING');
  });

  it('returns RETRYING for pending jobs with prior attempts', () => {
    expect(
      deriveRouteProcessingState({
        artifact: null,
        routeJob: {
          status: 'PENDING',
          attemptCount: 1,
          maxAttempts: 3,
          nextRetryAt: new Date('2026-08-29T13:05:00.000Z'),
          requestedAt: new Date('2026-08-29T12:50:00.000Z'),
          errorMessage: 'mapbox_timeout',
        } as any,
        routeStage: null,
        now,
      }),
    ).toMatchObject({
      processingState: 'RETRYING',
      retryableFailure: true,
      failureReason: 'mapbox_timeout',
    });
  });

  it('returns UNAVAILABLE for historical trip without artifact or active job', () => {
    expect(
      deriveRouteProcessingState({
        artifact: null,
        routeJob: null,
        routeStage: null,
        now,
      }),
    ).toMatchObject({
      processingState: 'UNAVAILABLE',
      ready: false,
    });
  });

  it('treats stale pending jobs as inactive work', () => {
    const staleRequestedAt = new Date(now.getTime() - ROUTE_JOB_STALE_AFTER_MS - 60_000);
    expect(
      deriveRouteProcessingState({
        artifact: null,
        routeJob: {
          status: 'PENDING',
          attemptCount: 0,
          maxAttempts: 3,
          requestedAt: staleRequestedAt,
          lastAttemptAt: null,
          nextRetryAt: null,
        } as any,
        routeStage: null,
        now,
      }).processingState,
    ).toBe('UNAVAILABLE');
  });

  it('returns FAILED for dead-letter jobs', () => {
    expect(
      deriveRouteProcessingState({
        artifact: null,
        routeJob: {
          status: 'DEAD_LETTER',
          attemptCount: 3,
          maxAttempts: 3,
          errorMessage: 'permanent',
        } as any,
        routeStage: null,
        now,
      }).processingState,
    ).toBe('FAILED');
  });
});
