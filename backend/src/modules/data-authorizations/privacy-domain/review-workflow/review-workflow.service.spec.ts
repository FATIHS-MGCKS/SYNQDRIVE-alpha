import {
  DataAuthorizationRiskLevel,
  DataProcessingReviewCycleStatus,
  DataProcessingReviewDecisionOutcome,
  DataProcessingReviewEntityType,
  DataProcessingReviewStepType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { resolveRequiredReviewSteps, REVIEW_WORKFLOW_STEPS_BY_RISK } from './review-workflow.config';
import { assertFourEyesSeparation } from './review-workflow.four-eyes';
import { computeProcessingActivityFingerprint, isMaterialFingerprintChange } from './review-workflow.fingerprint';
import { DataProcessingReviewWorkflowService } from './review-workflow.service';
import {
  ReviewDecisionReasonRequiredException,
  ReviewFourEyesViolationException,
  ReviewStepAlreadyDecidedException,
  ReviewWorkflowBlockedException,
} from './review-workflow.exceptions';

describe('review-workflow.config', () => {
  it('requires privacy and security review for HIGH risk', () => {
    const steps = resolveRequiredReviewSteps(DataAuthorizationRiskLevel.HIGH);
    expect(steps).toContain(DataProcessingReviewStepType.PRIVACY_REVIEW);
    expect(steps).toContain(DataProcessingReviewStepType.SECURITY_REVIEW);
  });

  it('requires privacy and security review for CRITICAL risk', () => {
    const steps = resolveRequiredReviewSteps(DataAuthorizationRiskLevel.CRITICAL);
    expect(steps).toEqual(REVIEW_WORKFLOW_STEPS_BY_RISK.CRITICAL);
  });
});

describe('review-workflow.four-eyes', () => {
  it('blocks self-approval when four-eyes enabled', () => {
    expect(() =>
      assertFourEyesSeparation({
        fourEyesEnabled: true,
        requesterUserId: 'user-1',
        actorUserId: 'user-1',
        stepType: DataProcessingReviewStepType.FINAL_APPROVAL,
      }),
    ).toThrow('data_processing_four_eyes_violation');
  });

  it('allows privacy review by requester (non-final step)', () => {
    expect(() =>
      assertFourEyesSeparation({
        fourEyesEnabled: true,
        requesterUserId: 'user-1',
        actorUserId: 'user-1',
        stepType: DataProcessingReviewStepType.PRIVACY_REVIEW,
      }),
    ).not.toThrow();
  });
});

describe('review-workflow.fingerprint', () => {
  it('detects material fingerprint change', () => {
    const a = computeProcessingActivityFingerprint({
      activityCode: 'fleet-gps',
      title: 'Fleet GPS',
      categories: ['GPS_LOCATION'],
      purposes: ['LIVE_MAP'],
    });
    const b = computeProcessingActivityFingerprint({
      activityCode: 'fleet-gps',
      title: 'Fleet GPS Updated',
      categories: ['GPS_LOCATION'],
      purposes: ['LIVE_MAP'],
    });
    expect(isMaterialFingerprintChange(a, b)).toBe(true);
  });
});

describe('DataProcessingReviewWorkflowService', () => {
  const prisma = {
    $transaction: jest.fn(),
    processingActivity: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    dataProcessingReviewCycle: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    dataProcessingReviewDecision: { create: jest.fn() },
    organization: { findUnique: jest.fn() },
  } as any;

  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

  const permissions = {
    assert: jest.fn(),
    assertOrgMembership: jest.fn(),
  };

  let service: DataProcessingReviewWorkflowService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DataProcessingReviewWorkflowService(
      prisma as never,
      permissions as never,
      { enqueueReviewDecisionAuditInTransaction: jest.fn().mockResolvedValue(null) } as never,
    );
  });

  it('rejects decision without reason', async () => {
    prisma.dataProcessingReviewCycle.findFirst.mockResolvedValue({
      id: 'cycle-1',
      organizationId: 'org-1',
      status: DataProcessingReviewCycleStatus.OPEN,
      requiredSteps: [DataProcessingReviewStepType.FINAL_APPROVAL],
      requestedByUserId: 'req-1',
      entityVersionNumber: 1,
      decisions: [],
    });

    await expect(
      service.recordDecision({
        orgId: 'org-1',
        cycleId: 'cycle-1',
        stepType: DataProcessingReviewStepType.FINAL_APPROVAL,
        outcome: DataProcessingReviewDecisionOutcome.REJECTED,
        actorUserId: 'rev-1',
        reason: '',
      }),
    ).rejects.toBeInstanceOf(ReviewDecisionReasonRequiredException);
  });

  it('blocks parallel review decision on same step', async () => {
    const cycle = {
      id: 'cycle-1',
      organizationId: 'org-1',
      status: DataProcessingReviewCycleStatus.OPEN,
      requiredSteps: [DataProcessingReviewStepType.PRIVACY_REVIEW],
      requestedByUserId: 'req-1',
      entityVersionNumber: 1,
      decisions: [
        {
          stepType: DataProcessingReviewStepType.PRIVACY_REVIEW,
          decision: DataProcessingReviewDecisionOutcome.APPROVED,
        },
      ],
    };
    prisma.dataProcessingReviewCycle.findFirst.mockResolvedValue(cycle);

    await expect(
      service.recordDecision({
        orgId: 'org-1',
        cycleId: 'cycle-1',
        stepType: DataProcessingReviewStepType.PRIVACY_REVIEW,
        outcome: DataProcessingReviewDecisionOutcome.APPROVED,
        actorUserId: 'rev-2',
      }),
    ).rejects.toBeInstanceOf(ReviewStepAlreadyDecidedException);
  });

  it('blocks activation without completed review cycle', async () => {
    prisma.dataProcessingReviewCycle.findFirst.mockResolvedValue(null);

    await expect(
      service.assertActivationAllowed({
        orgId: 'org-1',
        entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
        entityId: 'pa-1',
        versionNumber: 1,
        contentFingerprint: 'fp-1',
        lifecycleStatus: PrivacyPolicyLifecycleStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ReviewWorkflowBlockedException);
  });

  it('blocks activation when mandatory review step missing', async () => {
    prisma.dataProcessingReviewCycle.findFirst.mockResolvedValue({
      requiredSteps: [
        DataProcessingReviewStepType.PRIVACY_REVIEW,
        DataProcessingReviewStepType.SECURITY_REVIEW,
        DataProcessingReviewStepType.FINAL_APPROVAL,
      ],
      decisions: [
        {
          stepType: DataProcessingReviewStepType.PRIVACY_REVIEW,
          decision: DataProcessingReviewDecisionOutcome.APPROVED,
        },
      ],
    });

    await expect(
      service.assertActivationAllowed({
        orgId: 'org-1',
        entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
        entityId: 'pa-1',
        versionNumber: 1,
        contentFingerprint: 'fp-1',
        lifecycleStatus: PrivacyPolicyLifecycleStatus.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ReviewWorkflowBlockedException);
  });

  it('maps four-eyes violation to forbidden exception', async () => {
    prisma.dataProcessingReviewCycle.findFirst.mockResolvedValue({
      id: 'cycle-1',
      organizationId: 'org-1',
      status: DataProcessingReviewCycleStatus.OPEN,
      requiredSteps: [DataProcessingReviewStepType.FINAL_APPROVAL],
      requestedByUserId: 'user-1',
      entityVersionNumber: 1,
      entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
      entityId: 'pa-1',
      decisions: [],
    });
    prisma.organization.findUnique.mockResolvedValue({ dataProcessingFourEyesEnabled: true });

    await expect(
      service.recordDecision({
        orgId: 'org-1',
        cycleId: 'cycle-1',
        stepType: DataProcessingReviewStepType.FINAL_APPROVAL,
        outcome: DataProcessingReviewDecisionOutcome.APPROVED,
        actorUserId: 'user-1',
      }),
    ).rejects.toThrow('data_processing_four_eyes_violation');
  });

  it('invalidates approvals on material change', async () => {
    prisma.dataProcessingReviewCycle.findMany.mockResolvedValue([
      {
        id: 'cycle-1',
        entityContentFingerprint: 'old-fp',
        status: DataProcessingReviewCycleStatus.APPROVED,
      },
    ]);
    prisma.dataProcessingReviewCycle.update.mockResolvedValue({});

    await service.invalidateOnMaterialChange({
      orgId: 'org-1',
      entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
      entityId: 'pa-1',
      newFingerprint: 'new-fp',
    });

    expect(prisma.dataProcessingReviewCycle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cycle-1' },
        data: expect.objectContaining({ status: DataProcessingReviewCycleStatus.SUPERSEDED }),
      }),
    );
    expect(prisma.processingActivity.updateMany).toHaveBeenCalled();
  });
});

describe('data-processing permissions', () => {
  it('org_admin role satisfies all data_processing actions via registry', async () => {
    const { evaluateOperationalPermission } = await import('@shared/auth/operational-permission.util');
    const perms = { 'data-authorization': { read: true, write: true, manage: true } };
    expect(evaluateOperationalPermission(perms, 'data_processing.review_privacy')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'data_processing.activate')).toBe(true);
  });

  it('read-only membership lacks approve permission', async () => {
    const { evaluateOperationalPermission } = await import('@shared/auth/operational-permission.util');
    const perms = { 'data-authorization': { read: true, write: false, manage: false } };
    expect(evaluateOperationalPermission(perms, 'data_processing.view')).toBe(true);
    expect(evaluateOperationalPermission(perms, 'data_processing.approve')).toBe(false);
  });
});
