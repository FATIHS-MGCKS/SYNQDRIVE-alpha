import { BatteryPublicationUpdateHandler } from './battery-publication-update.handler';
import { BatteryV2JobProcessingError } from '../battery-v2-job.errors';

describe('BatteryPublicationUpdateHandler', () => {
  const payload = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    assessmentId: 'assess-1',
    publicationVersion: 1,
    idempotencyKey: 'pub:assess-1:v1',
    sourceEntityId: 'assess-1',
    requestedAt: '2026-09-02T10:00:00.000Z',
    correlationId: 'corr-1',
    modelVersion: 1,
    attemptContext: {
      attemptNumber: 1,
      maxAttempts: 3,
      enqueuedAt: '2026-09-02T10:00:00.000Z',
      previousFailureCode: null,
    },
  } as const;

  it('does not acknowledge EXECUTED when updateLvPublication returns ok:false', async () => {
    const publicationService = {
      updateLvPublication: jest.fn().mockResolvedValue({
        ok: false,
        decision: {
          maturity: 'STABLE',
          reasons: [{ code: 'SELF_SUPERSESSION', labelDe: 'x' }],
        },
        persistedPublicationId: null,
        supersededPublicationId: null,
      }),
    };
    const publicationHandoff = {
      acknowledgeExecuted: jest.fn(),
    };

    const handler = new BatteryPublicationUpdateHandler(
      publicationService as never,
      publicationHandoff as never,
    );

    await expect(handler.handle(payload as never)).rejects.toBeInstanceOf(
      BatteryV2JobProcessingError,
    );
    expect(publicationHandoff.acknowledgeExecuted).not.toHaveBeenCalled();
  });

  it('acknowledges EXECUTED for ok:true policy skip', async () => {
    const publicationService = {
      updateLvPublication: jest.fn().mockResolvedValue({
        ok: true,
        decision: {
          maturity: 'STABLE',
          reasons: [],
        },
        persistedPublicationId: null,
        supersededPublicationId: null,
      }),
    };
    const publicationHandoff = {
      acknowledgeExecuted: jest.fn().mockResolvedValue(undefined),
    };

    const handler = new BatteryPublicationUpdateHandler(
      publicationService as never,
      publicationHandoff as never,
    );

    await handler.handle(payload as never);
    expect(publicationHandoff.acknowledgeExecuted).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentId: 'assess-1',
        outcome: 'POLICY_SKIPPED',
      }),
    );
  });
});
