import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  VoiceAssistantStatus,
  VoiceBudgetOverflowBehavior,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceBudgetPolicyRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { isVoiceNativeTwilioIntegrationEnabled } from './voice-feature-flags.config';

const BLOCKED_DESTINATION_PREFIXES = [
  '+49112',
  '+49110',
  '+49116',
  '+49115',
  '+49118',
  '+49119',
  '+911',
  '+999',
  '+112',
  '+110',
  '+116',
  '+118',
  '+119',
];

@Injectable()
export class VoiceCallPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: VoiceSubscriptionRepository,
    private readonly budgetPolicies: VoiceBudgetPolicyRepository,
  ) {}

  async assertOutboundCallAllowed(params: {
    organizationId: string;
    toE164: string;
    voiceAssistantId: string;
  }): Promise<void> {
    if (!isVoiceNativeTwilioIntegrationEnabled()) {
      throw new ForbiddenException(
        'Native ElevenLabs-Twilio outbound calls are not enabled for this environment.',
      );
    }

    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { id: params.voiceAssistantId, organizationId: params.organizationId },
    });
    if (!assistant) {
      throw new ForbiddenException('Voice assistant not found for organization.');
    }
    if (assistant.status !== VoiceAssistantStatus.ACTIVE) {
      throw new ForbiddenException('Voice assistant is not active.');
    }
    if (!assistant.outboundEnabled) {
      throw new ForbiddenException('Outbound calls are disabled for this assistant.');
    }

    await this.assertSubscriptionActive(params.organizationId);
    await this.assertBudgetAllows(params.organizationId);
    this.assertDestinationAllowed(params.toE164, await this.budgetPolicies.findByOrganization(params.organizationId));
  }

  async assertLegacyDiagnosticAllowed(params: {
    organizationId: string;
    toE164: string;
    initiatedByUserId: string;
  }): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId: params.organizationId,
        userId: params.initiatedByUserId,
        status: 'ACTIVE',
        role: { in: ['ORG_ADMIN', 'SUB_ADMIN'] },
      },
    });
    if (!membership) {
      throw new ForbiddenException('Legacy diagnostic calls require an organization administrator.');
    }
    this.assertDestinationAllowed(params.toE164, null);
  }

  private async assertSubscriptionActive(organizationId: string): Promise<void> {
    const subscriptions = await this.subscriptions.listByOrganization(organizationId);
    const active = subscriptions.find((row) => row.status === VoiceSubscriptionStatus.ACTIVE);
    if (!active) {
      throw new ForbiddenException('Voice AI subscription is not active for this organization.');
    }
    const suspended = subscriptions.find((row) => row.status === VoiceSubscriptionStatus.SUSPENDED);
    if (suspended && !active) {
      throw new ForbiddenException('Voice AI subscription is suspended.');
    }
  }

  private async assertBudgetAllows(organizationId: string): Promise<void> {
    const policy = await this.budgetPolicies.findByOrganization(organizationId);
    if (!policy?.monthlyBudgetCents || !policy.hardLimitThresholdPct) {
      return;
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const usage = await this.prisma.voiceUsageEvent.aggregate({
      where: { organizationId, occurredAt: { gte: monthStart } },
      _sum: { customerPriceCents: true },
    });
    const consumed = usage._sum.customerPriceCents ?? 0;
    const threshold = Math.floor(
      (policy.monthlyBudgetCents * policy.hardLimitThresholdPct) / 100,
    );

    if (consumed >= threshold && policy.overflowBehavior === VoiceBudgetOverflowBehavior.HARD_STOP) {
      throw new ForbiddenException('Voice AI monthly budget hard limit reached.');
    }
  }

  private assertDestinationAllowed(
    toE164: string,
    budgetPolicy: { allowedCountries: string[] } | null,
  ): void {
    const normalized = toE164.trim();
    if (!normalized.startsWith('+') || normalized.length < 8) {
      throw new BadRequestException('Destination number must be E.164 format.');
    }

    for (const prefix of BLOCKED_DESTINATION_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        throw new BadRequestException('Destination number is blocked.');
      }
    }

    const allowed = budgetPolicy?.allowedCountries ?? [];
    if (allowed.length > 0) {
      const countryMatch = allowed.some((code) => {
        const dial = this.countryDialPrefix(code);
        return dial ? normalized.startsWith(dial) : false;
      });
      if (!countryMatch) {
        throw new ForbiddenException('Destination country is not allowed for this organization.');
      }
    }
  }

  private countryDialPrefix(countryCode: string): string | null {
    const map: Record<string, string> = {
      DE: '+49',
      AT: '+43',
      CH: '+41',
      NL: '+31',
      FR: '+33',
      GB: '+44',
      US: '+1',
    };
    return map[countryCode.trim().toUpperCase()] ?? null;
  }
}
