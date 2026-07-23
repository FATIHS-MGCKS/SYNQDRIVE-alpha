import {
  ConsentInteractionChannel,
  DataSubjectConsentStatus,
  DataSubjectType,
  EnforcementPolicyStatus,
  PrivacyProcessingPurpose,
  ProcessingActivityStatus,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { DataSubjectConsentService } from './data-subject-consent.service';

describe('DataSubjectConsentService', () => {
  const orgId = 'org-1';
  const otherOrgId = 'org-2';
  const activityId = 'activity-1';
  const consentId = 'consent-1';
  const actorUserId = 'user-1';

  const activity = {
    id: activityId,
    organizationId: orgId,
    status: ProcessingActivityStatus.ACTIVE,
  };

  const baseConsent = {
    id: consentId,
    organizationId: orgId,
    processingActivityId: activityId,
    dataSubjectReference: 'customer-ref-12345678',
    subjectType: DataSubjectType.CUSTOMER,
    purpose: PrivacyProcessingPurpose.CUSTOMER_CONSENT,
    consentTextVersion: 'consent-v1',
    privacyNoticeVersion: 'notice-v1',
    consentStatus: DataSubjectConsentStatus.PENDING,
    grantedAt: null,
    grantedChannel: null,
    evidenceReference: null,
    withdrawnAt: null,
    withdrawalChannel: null,
    withdrawalReason: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    legacyOrgDataAuthorizationId: null,
  };

  let prisma: {
    processingActivity: { findFirst: jest.Mock };
    dataSubjectConsent: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    dataSubjectConsentStatusEvent: { create: jest.Mock };
    enforcementPolicy: { findMany: jest.Mock; updateMany: jest.Mock };
    consentWithdrawalPropagation: { create: jest.Mock; createMany: jest.Mock };
    providerAccessGrant: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  let service: DataSubjectConsentService;

  beforeEach(() => {
    prisma = {
      processingActivity: { findFirst: jest.fn().mockResolvedValue(activity) },
      dataSubjectConsent: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      dataSubjectConsentStatusEvent: { create: jest.fn() },
      enforcementPolicy: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      consentWithdrawalPropagation: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      providerAccessGrant: { updateMany: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    service = new DataSubjectConsentService(prisma as never);
  });

  it('creates consent in PENDING without grantedAt', async () => {
    prisma.dataSubjectConsent.create.mockResolvedValue(baseConsent);

    const result = await service.create(orgId, activityId, {
      dataSubjectReference: 'customer-ref-12345678',
      subjectType: DataSubjectType.CUSTOMER,
      purpose: PrivacyProcessingPurpose.CUSTOMER_CONSENT,
      consentTextVersion: 'consent-v1',
      privacyNoticeVersion: 'notice-v1',
    });

    expect(prisma.dataSubjectConsent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consentStatus: DataSubjectConsentStatus.PENDING,
          consentTextVersion: 'consent-v1',
          privacyNoticeVersion: 'notice-v1',
        }),
      }),
    );
    expect(result.consentStatus).toBe(DataSubjectConsentStatus.PENDING);
  });

  it('rejects cross-tenant consent lookup', async () => {
    prisma.dataSubjectConsent.findFirst.mockResolvedValue(null);

    await expect(service.findById(otherOrgId, consentId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets grantedAt server-side on grant', async () => {
    prisma.dataSubjectConsent.findFirst.mockResolvedValue(baseConsent);
    prisma.dataSubjectConsent.update.mockResolvedValue({
      ...baseConsent,
      consentStatus: DataSubjectConsentStatus.GRANTED,
      grantedAt: new Date(),
    });

    await service.grant(
      orgId,
      consentId,
      {
        grantedChannel: ConsentInteractionChannel.APP,
        evidenceReference: 'evidence-123',
      },
      actorUserId,
    );

    expect(prisma.dataSubjectConsent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consentStatus: DataSubjectConsentStatus.GRANTED,
          grantedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('withdraw propagates to enforcement policies without touching provider grants', async () => {
    const grantedConsent = {
      ...baseConsent,
      consentStatus: DataSubjectConsentStatus.GRANTED,
      grantedAt: new Date('2026-01-01T00:00:00Z'),
    };
    prisma.dataSubjectConsent.findFirst.mockResolvedValue(grantedConsent);
    prisma.dataSubjectConsent.update.mockResolvedValue({
      ...grantedConsent,
      consentStatus: DataSubjectConsentStatus.WITHDRAWN,
      withdrawnAt: new Date(),
    });
    prisma.enforcementPolicy.findMany.mockResolvedValue([{ id: 'policy-1' }]);

    await service.withdraw(
      orgId,
      consentId,
      {
        withdrawalChannel: ConsentInteractionChannel.APP,
        withdrawalReason: 'User requested deletion',
      },
      actorUserId,
    );

    expect(prisma.enforcementPolicy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: EnforcementPolicyStatus.DISABLED },
      }),
    );
    expect(prisma.consentWithdrawalPropagation.createMany).toHaveBeenCalled();
    expect(prisma.providerAccessGrant.updateMany).not.toHaveBeenCalled();
  });
});
