import {
  LegalBasisConsentRequirement,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { LegalBasisAssessmentService } from './legal-basis-assessment.service';
import { LegalBasisAssessmentException } from './legal-basis-assessment.exceptions';
import { PolicyLifecycleEventsService } from '../policy-lifecycle/policy-lifecycle-events.service';
import { PolicyLifecycleService, PolicyLifecycleTransitionValidator } from '../policy-lifecycle/policy-lifecycle.service';

describe('LegalBasisAssessmentService', () => {
  const orgId = 'org-1';
  const activityId = 'activity-1';
  const assessorId = 'user-assessor';
  const approverId = 'user-approver';

  const activity = {
    id: activityId,
    organizationId: orgId,
    status: PrivacyPolicyLifecycleStatus.ACTIVE,
  };

  let prisma: {
    processingActivity: { findFirst: jest.Mock };
    legalBasisAssessment: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findMany: jest.Mock;
    };
    legalBasisAssessmentEvidenceRef: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    legalBasisAssessmentLifecycleEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  let service: LegalBasisAssessmentService;

  const baseAssessment = {
    id: 'assessment-1',
    organizationId: orgId,
    processingActivityId: activityId,
    policyFamilyId: 'family-1',
    versionNumber: 1,
    isCurrentVersion: true,
    legalBasisType: PrivacyLegalBasisType.CONTRACT,
    legalReference: null,
    necessityAssessment: 'Required for rental contract fulfilment',
    proportionalityAssessment: null,
    legitimateInterestDescription: null,
    balancingTestReference: null,
    consentRequirement: LegalBasisConsentRequirement.NOT_APPLICABLE,
    status: PrivacyPolicyLifecycleStatus.DRAFT,
    assessedByUserId: null,
    approvedByUserId: null,
    assessedAt: null,
    approvedAt: null,
    validFrom: null,
    validUntil: null,
    reviewDate: null,
    rejectionReason: null,
    evidenceReferences: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    legacyOrgDataAuthorizationId: null,
  };

  beforeEach(() => {
    prisma = {
      processingActivity: { findFirst: jest.fn().mockResolvedValue(activity) },
      legalBasisAssessment: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
      },
      legalBasisAssessmentEvidenceRef: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      legalBasisAssessmentLifecycleEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    const lifecycle = new PolicyLifecycleService(
      prisma as never,
      new PolicyLifecycleTransitionValidator(),
      new PolicyLifecycleEventsService(),
    );

    service = new LegalBasisAssessmentService(
      prisma as never,
      lifecycle,
      new PolicyLifecycleEventsService(),
    );
  });

  it('creates a draft assessment with policy family version 1', async () => {
    prisma.legalBasisAssessment.create.mockResolvedValue({
      ...baseAssessment,
      id: 'new-assessment',
    });
    prisma.legalBasisAssessment.findUniqueOrThrow.mockResolvedValue({
      ...baseAssessment,
      id: 'new-assessment',
      evidenceReferences: [],
    });

    const result = await service.create(orgId, activityId, {
      legalBasisType: PrivacyLegalBasisType.CONTRACT,
      necessityAssessment: 'Required for rental contract fulfilment',
    });

    expect(prisma.legalBasisAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: orgId,
          processingActivityId: activityId,
          versionNumber: 1,
          status: PrivacyPolicyLifecycleStatus.DRAFT,
        }),
      }),
    );
    expect(result.id).toBe('new-assessment');
  });

  it('blocks approval without four-eyes separation', async () => {
    prisma.legalBasisAssessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      status: PrivacyPolicyLifecycleStatus.IN_REVIEW,
      assessedByUserId: assessorId,
    });

    await expect(service.approve(orgId, 'assessment-1', assessorId)).rejects.toThrow(
      'legal_basis_four_eyes_violation',
    );
  });

  it('approves under review assessment with separate approver', async () => {
    prisma.legalBasisAssessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      status: PrivacyPolicyLifecycleStatus.IN_REVIEW,
      assessedByUserId: assessorId,
    });
    prisma.legalBasisAssessment.update.mockResolvedValue({
      ...baseAssessment,
      status: PrivacyPolicyLifecycleStatus.APPROVED,
      approvedByUserId: approverId,
      evidenceReferences: [],
    });

    const result = await service.approve(orgId, 'assessment-1', approverId);
    expect(result.status).toBe(PrivacyPolicyLifecycleStatus.APPROVED);
    expect(prisma.legalBasisAssessment.update).toHaveBeenCalled();
  });

  it('requires valid approved assessment before processing activity activation', async () => {
    prisma.legalBasisAssessment.findMany.mockResolvedValue([]);

    await expect(
      service.assertProcessingActivityActivationAllowed(orgId, activityId),
    ).rejects.toBeInstanceOf(LegalBasisAssessmentException);
  });

  it('creates a new version from active assessment', async () => {
    prisma.legalBasisAssessment.findFirst
      .mockResolvedValueOnce({
        ...baseAssessment,
        status: PrivacyPolicyLifecycleStatus.ACTIVE,
      })
      .mockResolvedValueOnce({ versionNumber: 1 });

    prisma.legalBasisAssessment.create.mockResolvedValue({
      ...baseAssessment,
      id: 'assessment-2',
      versionNumber: 2,
      status: PrivacyPolicyLifecycleStatus.DRAFT,
    });
    prisma.legalBasisAssessment.findUniqueOrThrow.mockResolvedValue({
      ...baseAssessment,
      id: 'assessment-2',
      versionNumber: 2,
      status: PrivacyPolicyLifecycleStatus.DRAFT,
      evidenceReferences: [],
    });

    const result = await service.createNewVersion(orgId, 'assessment-1', {
      legalBasisType: PrivacyLegalBasisType.CONTRACT,
      necessityAssessment: 'Updated necessity rationale',
    });

    expect(result.versionNumber).toBe(2);
    expect(prisma.legalBasisAssessment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ policyFamilyId: 'family-1' }),
      }),
    );
  });
});
