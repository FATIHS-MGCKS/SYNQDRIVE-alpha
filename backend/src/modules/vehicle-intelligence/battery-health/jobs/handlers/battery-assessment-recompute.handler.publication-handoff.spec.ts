import { BatteryAssessmentRecomputeHandler } from './battery-assessment-recompute.handler';
import { LV_PUBLICATION_CONTRACT_VERSION } from '../../lv-assessment/lv-publication-contract.policy';

describe('BatteryAssessmentRecomputeHandler publication handoff', () => {
  const organizationId = 'clorg1234567890123456789012';
  const vehicleId = 'clveh1234567890123456789012';
  const measurementId = '550e8400-e29b-41d4-a716-446655440000';

  function buildHandler() {
    const assessmentService = {
      recomputeLvEstimatedHealth: jest.fn().mockResolvedValue({
        ok: true,
        unsupportedProfile: false,
        persistedAssessmentIds: ['assess-w', 'assess-t'],
        persistedEpochAssessments: [
          {
            assessmentId: 'assess-w',
            assessmentTrack: 'WORKSHOP_OVERRIDE',
            assessmentMode: 'CANONICAL',
          },
          {
            assessmentId: 'assess-t',
            assessmentTrack: 'TELEMETRY',
            assessmentMode: 'CANONICAL',
          },
        ],
        reasons: [],
      }),
    };
    const assessmentHandoff = {
      acknowledgeExecuted: jest.fn().mockResolvedValue(undefined),
    };
    const publicationHandoff = {
      ensurePublicationHandoff: jest.fn().mockResolvedValue({
        enqueued: true,
        skipped: false,
        selectedAssessmentId: 'assess-w',
        selectedAssessmentTrack: 'WORKSHOP_OVERRIDE',
        idempotencyKey: 'pub:assess-w:v1',
        jobId: 'job-pub-1',
      }),
    };
    const handler = new BatteryAssessmentRecomputeHandler(
      assessmentService as never,
      assessmentHandoff as never,
      publicationHandoff as never,
    );
    return {
      handler,
      assessmentService,
      assessmentHandoff,
      publicationHandoff,
    };
  }

  it('chains assessment recompute to D4 publication handoff enqueue', async () => {
    const { handler, publicationHandoff } = buildHandler();

    await handler.handle({
      organizationId,
      vehicleId,
      idempotencyKey: `assess:${vehicleId}:LV_HEALTH:${measurementId}`,
      sourceEntityId: measurementId,
      requestedAt: new Date().toISOString(),
      modelVersion: '1.0.0',
      correlationId: 'corr-1',
      attemptContext: {
        attemptNumber: 1,
        maxAttempts: 3,
        enqueuedAt: new Date().toISOString(),
        previousFailureCode: null,
      },
      assessmentType: 'LV_HEALTH',
      inputVersion: measurementId,
    });

    expect(publicationHandoff.ensurePublicationHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        vehicleId,
        epochCandidates: [
          expect.objectContaining({ assessmentId: 'assess-w' }),
          expect.objectContaining({ assessmentId: 'assess-t' }),
        ],
      }),
    );
  });

  it('does not enqueue publication handoff when assessment persistence fails', async () => {
    const assessmentService = {
      recomputeLvEstimatedHealth: jest.fn().mockResolvedValue({
        ok: false,
        unsupportedProfile: false,
        persistedAssessmentIds: [],
        persistedEpochAssessments: [],
        reasons: [{ code: 'missing_evidence', labelDe: 'x' }],
      }),
    };
    const publicationHandoff = {
      ensurePublicationHandoff: jest.fn(),
    };
    const handler = new BatteryAssessmentRecomputeHandler(
      assessmentService as never,
      { acknowledgeExecuted: jest.fn() } as never,
      publicationHandoff as never,
    );

    await handler.handle({
      organizationId,
      vehicleId,
      idempotencyKey: 'assess:key',
      requestedAt: new Date().toISOString(),
      modelVersion: '1.0.0',
      correlationId: 'corr-2',
      attemptContext: {
        attemptNumber: 1,
        maxAttempts: 3,
        enqueuedAt: new Date().toISOString(),
        previousFailureCode: null,
      },
    });

    expect(publicationHandoff.ensurePublicationHandoff).not.toHaveBeenCalled();
  });

  it('uses canonical D5 publication contract version in handoff path', () => {
    expect(LV_PUBLICATION_CONTRACT_VERSION).toBe(1);
  });
});
