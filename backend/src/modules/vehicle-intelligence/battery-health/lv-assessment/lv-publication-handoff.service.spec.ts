import { LvPublicationHandoffService } from './lv-publication-handoff.service';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';

describe('LvPublicationHandoffService', () => {
  const organizationId = 'clorg1234567890123456789012';
  const vehicleId = 'clveh1234567890123456789012';

  function buildService(deps?: {
    assessmentRow?: Record<string, unknown> | null;
    enqueueResult?: string | null;
    liveJob?: boolean;
    deadLetter?: boolean;
  }) {
    const prisma = {
      batteryAssessment: {
        findFirst: jest.fn().mockResolvedValue(deps?.assessmentRow ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const jobProducer = {
      enqueue: jest.fn().mockResolvedValue(deps?.enqueueResult ?? 'job-1'),
      hasLiveJob: jest.fn().mockResolvedValue(deps?.liveJob ?? false),
    };
    const deadLetters = {
      isDeadLetter: jest.fn().mockResolvedValue(deps?.deadLetter ?? false),
    };
    const service = new LvPublicationHandoffService(
      prisma as never,
      jobProducer as never,
      deadLetters as never,
    );
    return { service, prisma, jobProducer, deadLetters };
  }

  const telemetry = {
    assessmentId: 'assess-t',
    assessmentTrack: 'TELEMETRY' as const,
    assessmentMode: 'CANONICAL' as const,
  };
  const workshop = {
    assessmentId: 'assess-w',
    assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
    assessmentMode: 'CANONICAL' as const,
  };

  it('enqueues only D4 winner and not both tracks', async () => {
    const { service, jobProducer } = buildService({
      assessmentRow: {
        id: 'assess-w',
        inputSummary: {},
      },
    });

    const result = await service.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates: [telemetry, workshop],
    });

    expect(result.enqueued).toBe(true);
    expect(result.selectedAssessmentId).toBe('assess-w');
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
    expect(jobProducer.enqueue).toHaveBeenCalledWith(
      'BATTERY_PUBLICATION_UPDATE',
      expect.objectContaining({
        assessmentId: 'assess-w',
        publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
        sourceEntityId: 'assess-w',
        idempotencyKey: 'pub:assess-w:v1',
      }),
    );
  });

  it('skips publication handoff when no qualifying assessment exists', async () => {
    const { service, jobProducer } = buildService();
    const result = await service.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates: [
        {
          assessmentId: 'assess-s',
          assessmentTrack: 'TELEMETRY',
          assessmentMode: 'SHADOW',
        },
      ],
    });
    expect(result.enqueued).toBe(false);
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('does not enqueue when selected assessment row is missing', async () => {
    const { service, jobProducer } = buildService({ assessmentRow: null });
    const result = await service.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates: [telemetry],
    });
    expect(result.enqueued).toBe(false);
    expect(result.reason).toBe('selected_assessment_not_found');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });
});
