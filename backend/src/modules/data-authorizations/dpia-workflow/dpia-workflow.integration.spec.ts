import {
  ProcessingActivityDpiaDecisionType,
  ProcessingActivityDpiaStatus,
  PrivacyResidualRiskLevel,
  PrivacyRiskDataVolume,
  PrivacyRiskFrequency,
} from '@prisma/client';
import { DpiaActivationGateService } from './dpia-activation-gate.service';
import { DpiaDecisionRecorderService } from './dpia-decision-recorder.service';
import { DpiaWorkflowService } from './dpia-workflow.service';
import { PrivacyRiskAssessmentService } from './privacy-risk-assessment.service';

describe('DPIA workflow integration (in-memory harness)', () => {
  const orgId = 'org-1';
  const activityId = 'pa-1';

  function buildHarness(dpiaStatus: ProcessingActivityDpiaStatus = ProcessingActivityDpiaStatus.DPIA_NOT_REQUIRED) {
    const activity = {
      id: activityId,
      organizationId: orgId,
      activityCode: 'fleet-telematics',
      title: 'Fleet telematics',
      description: null,
      dpiaStatus,
      dataCategories: [{ dataCategory: 'GPS_LOCATION' }],
      purposes: [{ purpose: 'LIVE_MAP' }],
    };

    const riskAssessments: Array<Record<string, unknown>> = [];
    const dpiaRecords: Array<Record<string, unknown>> = [];
    const decisions: Array<Record<string, unknown>> = [];

    const prisma = {
      processingActivity: {
        findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) =>
          where.id === activityId && where.organizationId === orgId ? { ...activity } : null,
        ),
        update: jest.fn(async ({ data }: { data: { dpiaStatus?: ProcessingActivityDpiaStatus; riskLevel?: string } }) => {
          Object.assign(activity, data);
          return { ...activity };
        }),
      },
      processingActivityRiskAssessment: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: 'ra-1', ...data, createdAt: new Date() };
          riskAssessments.push(row);
          return row;
        }),
        findFirst: jest.fn(async () => riskAssessments.find((r) => r.isCurrent) ?? null),
      },
      processingActivityDpia: {
        findFirst: jest.fn(async ({ where }: { where: { processingActivityId?: string; isCurrent?: boolean } }) =>
          dpiaRecords.find(
            (d) =>
              d.processingActivityId === where.processingActivityId &&
              (where.isCurrent === undefined || d.isCurrent === where.isCurrent),
          ) ?? null,
        ),
        findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) =>
          dpiaRecords.find((d) => d.id === where.id),
        ),
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: 'dpia-1', ...data };
          dpiaRecords.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = dpiaRecords.find((d) => d.id === where.id);
          if (!row) throw new Error('not found');
          Object.assign(row, data);
          return row;
        }),
      },
      processingActivityDpiaDecision: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          decisions.push(data);
          return data;
        }),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

    const decisionRecorder = new DpiaDecisionRecorderService(prisma as never);
    const dpiaWorkflow = new DpiaWorkflowService(prisma as never, decisionRecorder);
    const riskAssessment = new PrivacyRiskAssessmentService(prisma as never, decisionRecorder, dpiaWorkflow);
    const activationGate = new DpiaActivationGateService(prisma as never);

    return { prisma, activity, riskAssessments, dpiaRecords, decisions, riskAssessment, dpiaWorkflow, activationGate };
  }

  it('submits risk assessment and opens DPIA when score threshold exceeded', async () => {
    const h = buildHarness();
    const result = await h.riskAssessment.assess(
      orgId,
      activityId,
      {
        dataVolumeScope: PrivacyRiskDataVolume.VERY_LARGE,
        processingFrequency: PrivacyRiskFrequency.CONTINUOUS,
        systematicMonitoring: true,
        profiling: true,
        automatedDecisionMaking: true,
      },
      'assessor-1',
    );

    expect(result.dpiaRequired).toBe(true);
    expect(h.activity.dpiaStatus).toBe(ProcessingActivityDpiaStatus.DPIA_REQUIRED);
    expect(h.dpiaRecords).toHaveLength(1);
    expect(h.decisions.some((d) => d.decisionType === ProcessingActivityDpiaDecisionType.DPIA_CREATED)).toBe(true);
    expect(result.legalDecisionSeparate).toBe(true);
  });

  it('blocks activation when DPIA is required but not approved', async () => {
    const h = buildHarness(ProcessingActivityDpiaStatus.DPIA_REQUIRED);
    h.dpiaRecords.push({
      id: 'dpia-1',
      organizationId: orgId,
      processingActivityId: activityId,
      isCurrent: true,
      approvalStatus: ProcessingActivityDpiaStatus.DPIA_REQUIRED,
      residualRiskAccepted: false,
    });

    await expect(h.activationGate.assertActivationAllowed(orgId, activityId)).rejects.toMatchObject({
      code: 'DPIA_NOT_APPROVED',
    });
  });

  it('blocks activation when DPIA was rejected', async () => {
    const h = buildHarness(ProcessingActivityDpiaStatus.DPIA_REJECTED);
    await expect(h.activationGate.assertActivationAllowed(orgId, activityId)).rejects.toMatchObject({
      code: 'DPIA_REJECTED_BLOCKS_ACTIVATION',
    });
  });

  it('requires explicit residual risk acceptance before approval', async () => {
    const h = buildHarness(ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS);
    h.dpiaRecords.push({
      id: 'dpia-1',
      organizationId: orgId,
      processingActivityId: activityId,
      isCurrent: true,
      approvalStatus: ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS,
      identifiedRisks: [{ title: 'Location tracking' }],
      proposedMeasures: [{ title: 'Minimize retention' }],
      privacyReviewerUserId: 'privacy-1',
      securityReviewerUserId: 'security-1',
      residualRiskAccepted: false,
    });

    await expect(
      h.dpiaWorkflow.approve(orgId, activityId, 'approver-1', { reason: 'Approved after review' }),
    ).rejects.toThrow(/Residual risk/);

    await h.dpiaWorkflow.acceptResidualRisk(orgId, activityId, 'approver-1', {
      residualRisk: PrivacyResidualRiskLevel.MEDIUM,
      reason: 'Mitigations in place',
    });

    const approved = await h.dpiaWorkflow.approve(orgId, activityId, 'approver-1', {
      reason: 'Approved after review',
    });

    expect(approved.approvalStatus).toBe(ProcessingActivityDpiaStatus.DPIA_APPROVED);
    expect(h.activity.dpiaStatus).toBe(ProcessingActivityDpiaStatus.DPIA_APPROVED);
    expect(h.decisions.some((d) => d.decisionType === ProcessingActivityDpiaDecisionType.APPROVED)).toBe(true);
  });

  it('enforces four-eyes between reviewers and approver', async () => {
    const h = buildHarness(ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS);
    h.dpiaRecords.push({
      id: 'dpia-1',
      organizationId: orgId,
      processingActivityId: activityId,
      isCurrent: true,
      approvalStatus: ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS,
      identifiedRisks: [{ title: 'Risk' }],
      privacyReviewerUserId: 'privacy-1',
      securityReviewerUserId: 'security-1',
      residualRiskAccepted: true,
    });

    await expect(
      h.dpiaWorkflow.approve(orgId, activityId, 'privacy-1', { reason: 'nope' }),
    ).rejects.toThrow(/separate from reviewers/);
  });

  it('records append-only decisions on reject', async () => {
    const h = buildHarness(ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS);
    h.dpiaRecords.push({
      id: 'dpia-1',
      organizationId: orgId,
      processingActivityId: activityId,
      isCurrent: true,
      approvalStatus: ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS,
      identifiedRisks: [{ title: 'Risk' }],
    });

    const before = h.decisions.length;
    await h.dpiaWorkflow.reject(orgId, activityId, 'approver-1', { reason: 'Insufficient measures' });
    expect(h.decisions.length).toBe(before + 1);
    expect(h.activity.dpiaStatus).toBe(ProcessingActivityDpiaStatus.DPIA_REJECTED);
  });
});
