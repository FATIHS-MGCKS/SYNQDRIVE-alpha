import {
  extractRpmCandidateContext,
  mapRpmWebhookCandidate,
} from './rpm-candidate-read-model';
import { RpmWebhookCandidateStatus, TelemetryTriggerType } from '@prisma/client';

describe('rpm-candidate-read-model', () => {
  it('maps prisma row to view', () => {
    const view = mapRpmWebhookCandidate({
      id: 'c1',
      organizationId: 'o1',
      vehicleId: 'v1',
      tripId: 't1',
      tokenId: 42,
      provider: 'DIMO',
      triggerType: TelemetryTriggerType.RPM_THRESHOLD,
      threshold: 5000,
      observedValue: 5400,
      observedAt: new Date('2026-07-05T12:00:00.000Z'),
      dedupBucket: BigInt(0),
      rawPayloadJson: {},
      status: RpmWebhookCandidateStatus.CONTEXT_ENRICHED,
      contextAssessmentJson: {
        status: 'COMPLETED',
        confidence: 'HIGH',
        evidenceGrade: 'B',
        classifications: ['HIGH_RPM_SPIKE'],
      },
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(view.observedValue).toBe(5400);
    expect(view.source).toBe('DIMO Vehicle Trigger');
    expect(view.context?.classifications).toEqual(['HIGH_RPM_SPIKE']);
  });

  it('extracts context from assessment json', () => {
    const ctx = extractRpmCandidateContext({
      status: 'INSUFFICIENT_CONTEXT',
      preliminaryClassifications: ['INSUFFICIENT_CONTEXT'],
      confidence: 'INSUFFICIENT',
    });
    expect(ctx?.status).toBe('INSUFFICIENT_CONTEXT');
    expect(ctx?.classifications).toEqual(['INSUFFICIENT_CONTEXT']);
  });
});
