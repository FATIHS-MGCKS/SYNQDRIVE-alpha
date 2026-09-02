import {
  LV_PUBLICATION_HANDOFF_STATUS,
  readPublicationHandoffFromAssessmentSummary,
} from './lv-publication-handoff.metadata';
import { LvPublicationHandoffService } from './lv-publication-handoff.service';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';
import {
  createConcurrentJobProducer,
  createRowLockedAssessmentPrisma,
} from './lv-publication-handoff.integration.harness';

const ORG = 'clorg1234567890123456789012';
const ASSESS = 'classess12345678901234567890';
const VEH = 'clveh1234567890123456789012';

function buildHandoff(input: Record<string, unknown>) {
  return {
    selectedAssessmentId: ASSESS,
    assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
    idempotencyKey: `pub:${ASSESS}:v1`,
    publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
    epochAssessmentIds: [ASSESS],
    ...input,
  };
}

function buildStaleRecoveryHarness(input: {
  handoff: Record<string, unknown>;
  hasLiveJob?: boolean;
}) {
  const assessments = new Map<string, Record<string, unknown>>([
    [
      ASSESS,
      {
        assessmentTrack: 'WORKSHOP_OVERRIDE',
        assessmentMode: 'CANONICAL',
        publicationHandoff: buildHandoff(input.handoff),
      },
    ],
  ]);

  const prisma = createRowLockedAssessmentPrisma({
    organizationId: ORG,
    vehicleId: VEH,
    assessments,
    assessmentIdForLock: ASSESS,
  });

  const { jobProducer, liveJobs } = createConcurrentJobProducer();
  if (input.hasLiveJob) {
    liveJobs.set(`pub:${ASSESS}:v1`, 'bull-live-job');
  }

  const createService = () =>
    new LvPublicationHandoffService(
      prisma as never,
      jobProducer as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );

  const epochInput = {
    organizationId: ORG,
    vehicleId: VEH,
    epochCandidates: [
      {
        assessmentId: ASSESS,
        assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
        assessmentMode: 'CANONICAL' as const,
      },
    ],
  };

  return { assessments, jobProducer, createService, epochInput };
}

describe('lv-publication-handoff stale bullJobId recovery (PKG-02)', () => {
  const staleAnchor = new Date(Date.now() - 60_000).toISOString();
  const freshAnchor = new Date().toISOString();

  it('A: expired ENQUEUED + stale bullJobId + no live job → re-enqueued', async () => {
    const { createService, epochInput, jobProducer } = buildStaleRecoveryHarness({
      handoff: {
        status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
        bullJobId: 'stale-job',
        enqueuedAt: staleAnchor,
        lastAttemptAt: staleAnchor,
      },
    });

    const result = await createService().ensurePublicationHandoff(epochInput);
    expect(result.enqueued).toBe(true);
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
  });

  it('B: ENQUEUED + stale bullJobId + live Bull job → no enqueue', async () => {
    const { createService, epochInput, jobProducer } = buildStaleRecoveryHarness({
      handoff: {
        status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
        bullJobId: 'stale-job',
        enqueuedAt: staleAnchor,
        lastAttemptAt: staleAnchor,
      },
      hasLiveJob: true,
    });

    const result = await createService().ensurePublicationHandoff(epochInput);
    expect(result.enqueued).toBe(false);
    expect(result.reason).toBe('already_enqueued_live');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('C: fresh reservation + no live job → enqueue_in_progress', async () => {
    const { createService, epochInput, jobProducer } = buildStaleRecoveryHarness({
      handoff: {
        status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
        bullJobId: null,
        enqueuedAt: freshAnchor,
        lastAttemptAt: freshAnchor,
      },
    });

    const result = await createService().ensurePublicationHandoff(epochInput);
    expect(result.enqueued).toBe(false);
    expect(result.reason).toBe('enqueue_in_progress');
    expect(jobProducer.enqueue).not.toHaveBeenCalled();
  });

  it('D: expired MISSING + stale bullJobId → recover and re-enqueue', async () => {
    const { createService, epochInput, jobProducer } = buildStaleRecoveryHarness({
      handoff: {
        status: LV_PUBLICATION_HANDOFF_STATUS.MISSING,
        bullJobId: 'stale-job',
        enqueuedAt: staleAnchor,
        lastAttemptAt: staleAnchor,
      },
    });

    const result = await createService().ensurePublicationHandoff(epochInput);
    expect(result.enqueued).toBe(true);
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
  });

  it('E: two replicas recover expired stale claim → one enqueue', async () => {
    const { createService, epochInput, jobProducer } = buildStaleRecoveryHarness({
      handoff: {
        status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
        bullJobId: 'stale-job',
        enqueuedAt: staleAnchor,
        lastAttemptAt: staleAnchor,
      },
    });

    const [resultA, resultB] = await Promise.all([
      createService().ensurePublicationHandoff(epochInput),
      createService().ensurePublicationHandoff(epochInput),
    ]);

    expect([resultA, resultB].filter((row) => row.enqueued).length).toBe(1);
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
  });

  it('F: successful recovery refreshes bullJobId metadata', async () => {
    const { createService, epochInput, assessments } = buildStaleRecoveryHarness({
      handoff: {
        status: LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
        bullJobId: 'stale-job',
        enqueuedAt: staleAnchor,
        lastAttemptAt: staleAnchor,
      },
    });

    await createService().ensurePublicationHandoff(epochInput);

    const handoff = readPublicationHandoffFromAssessmentSummary(assessments.get(ASSESS));
    expect(handoff?.bullJobId).toBe(`bull-pub:${ASSESS}:v1`);
    expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED);
  });
});
