import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { VoicePhoneOnboardingService } from './voice-phone-onboarding.service';

describe('VoicePhoneOnboardingService', () => {
  const prisma = {
    voiceAssistant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    voicePhoneNumber: {
      findFirst: jest.fn(),
    },
    voiceProvisioningJob: {
      findFirst: jest.fn(),
    },
  };

  const twilioProvisioning = {
    previewProvisioning: jest.fn(),
    searchPhoneNumbers: jest.fn(),
    purchasePhoneNumberBySelectionToken: jest.fn(),
  };

  const activityLog = { log: jest.fn() };

  const service = new VoicePhoneOnboardingService(
    prisma as never,
    twilioProvisioning as never,
    activityLog as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: 'va-1',
      organizationId: 'org-1',
      phoneNumber: null,
      phoneOnboarding: null,
    } as never);
    prisma.voicePhoneNumber.findFirst.mockResolvedValue(null as never);
    prisma.voiceProvisioningJob.findFirst.mockResolvedValue(null as never);
    twilioProvisioning.previewProvisioning.mockResolvedValue({
      ready: true,
      trialRestricted: false,
      regulatory: { overall: 'APPROVED', bundle: 'approved', address: 'approved', endUser: 'approved' },
    } as never);
  });

  it('requires explicit confirmation for purchase', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: 'va-1',
      organizationId: 'org-1',
      phoneNumber: null,
      phoneOnboarding: { path: 'new_synqdrive_number', status: 'path_selected', updatedAt: new Date().toISOString() },
    } as never);

    await expect(
      service.confirmPurchase('org-1', 'token-1', false, 'idem-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(twilioProvisioning.purchasePhoneNumberBySelectionToken).not.toHaveBeenCalled();
  });

  it('blocks purchase for cross-tenant path mismatch', async () => {
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      id: 'va-1',
      organizationId: 'org-1',
      phoneNumber: null,
      phoneOnboarding: { path: 'forward_existing', status: 'path_selected', updatedAt: new Date().toISOString() },
    } as never);

    await expect(
      service.confirmPurchase('org-1', 'token-1', true, 'idem-1', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns regulatory requirements for new number path', async () => {
    const view = await service.getOnboarding('org-1');
    expect(view.regulatoryRequirements.length).toBeGreaterThan(0);
    expect(view.monthlyNumberCostCents).toBeGreaterThan(0);
  });
});
