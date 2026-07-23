import {
  DataSharingAuthorizationStatus,
  DataSharingRecipientRole,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { DataSharingAuthorizationService } from './data-sharing-authorization.service';

describe('DataSharingAuthorizationService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';
  const activityId = 'activity-1';
  const authorizationId = 'sharing-1';
  const assessmentId = 'assessment-1';
  const actorUserId = 'user-1';

  const activity = {
    id: activityId,
    organizationId: orgId,
    status: PrivacyPolicyLifecycleStatus.ACTIVE,
  };

  const assessment = {
    id: assessmentId,
    organizationId: orgId,
    processingActivityId: activityId,
    status: PrivacyPolicyLifecycleStatus.ACTIVE,
    isCurrentVersion: true,
  };

  const baseAuthorization = {
    id: authorizationId,
    organizationId: orgId,
    processingActivityId: activityId,
    recipient: 'Partner GmbH',
    recipientRole: DataSharingRecipientRole.PARTNER,
    purpose: PrivacyProcessingPurpose.CUSTOMER_CONSENT,
    legalBasisAssessmentId: assessmentId,
    status: DataSharingAuthorizationStatus.PENDING,
    validFrom: null,
    validUntil: null,
    dataCategories: [{ dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION }],
  };

  let prisma: {
    processingActivity: { findFirst: jest.Mock };
    legalBasisAssessment: { findFirst: jest.Mock };
    dataSharingAuthorization: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    dataSharingAuthorizationCategory: { createMany: jest.Mock };
    dataSharingAuthorizationStatusEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  let service: DataSharingAuthorizationService;

  beforeEach(() => {
    prisma = {
      processingActivity: { findFirst: jest.fn().mockResolvedValue(activity) },
      legalBasisAssessment: { findFirst: jest.fn().mockResolvedValue(assessment) },
      dataSharingAuthorization: {
        create: jest.fn().mockResolvedValue({ id: authorizationId }),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(baseAuthorization),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      dataSharingAuthorizationCategory: { createMany: jest.fn() },
      dataSharingAuthorizationStatusEvent: { create: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    service = new DataSharingAuthorizationService(prisma as never);
  });

  it('creates sharing authorization in PENDING with categories', async () => {
    const result = await service.create(orgId, activityId, {
      recipient: 'Partner GmbH',
      recipientRole: DataSharingRecipientRole.PARTNER,
      purpose: PrivacyProcessingPurpose.CUSTOMER_CONSENT,
      legalBasisAssessmentId: assessmentId,
      dataCategories: [PrivacyProcessingDataCategory.GPS_LOCATION],
    });

    expect(prisma.dataSharingAuthorization.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DataSharingAuthorizationStatus.PENDING,
        }),
      }),
    );
    expect(prisma.dataSharingAuthorizationCategory.createMany).toHaveBeenCalled();
    expect(result.status).toBe(DataSharingAuthorizationStatus.PENDING);
  });

  it('rejects cross-tenant authorization lookup', async () => {
    prisma.dataSharingAuthorization.findFirst.mockResolvedValue(null);

    await expect(service.findById(otherOrgId, authorizationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires approved legal basis assessment', async () => {
    prisma.legalBasisAssessment.findFirst.mockResolvedValue(null);

    await expect(
      service.create(orgId, activityId, {
        recipient: 'Partner GmbH',
        recipientRole: DataSharingRecipientRole.PARTNER,
        purpose: PrivacyProcessingPurpose.CUSTOMER_CONSENT,
        legalBasisAssessmentId: assessmentId,
        dataCategories: [PrivacyProcessingDataCategory.GPS_LOCATION],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets validFrom server-side on authorize', async () => {
    prisma.dataSharingAuthorization.findFirst.mockResolvedValue(baseAuthorization);
    prisma.dataSharingAuthorization.update.mockResolvedValue({
      ...baseAuthorization,
      status: DataSharingAuthorizationStatus.AUTHORIZED,
      validFrom: new Date(),
    });

    await service.authorize(orgId, authorizationId, {}, actorUserId);

    expect(prisma.dataSharingAuthorization.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DataSharingAuthorizationStatus.AUTHORIZED,
          validFrom: expect.any(Date),
        }),
      }),
    );
  });
});
