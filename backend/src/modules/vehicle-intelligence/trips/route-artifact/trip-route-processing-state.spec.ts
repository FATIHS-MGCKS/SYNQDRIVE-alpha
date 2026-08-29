import { deriveRouteProcessingState } from './trip-route-processing-state';

const baseArtifact = {
  processedAt: new Date('2026-08-29T12:00:00.000Z'),
  failureReason: null,
} as any;

describe('deriveRouteProcessingState', () => {
  it('returns READY when artifact is processed', () => {
    expect(
      deriveRouteProcessingState({
        artifact: baseArtifact,
        routeJob: null,
        routeStage: null,
      }),
    ).toEqual({
      processingState: 'READY',
      ready: true,
      retryableFailure: false,
      failureReason: null,
    });
  });

  it('returns PROCESSING for active route jobs', () => {
    expect(
      deriveRouteProcessingState({
        artifact: null,
        routeJob: { status: 'IN_PROGRESS', attemptCount: 0, maxAttempts: 3 } as any,
        routeStage: null,
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
          nextRetryAt: new Date(),
          errorMessage: 'mapbox_timeout',
        } as any,
        routeStage: null,
      }),
    ).toMatchObject({
      processingState: 'RETRYING',
      retryableFailure: true,
      failureReason: 'mapbox_timeout',
    });
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
      }).processingState,
    ).toBe('FAILED');
  });
});
