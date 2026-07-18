import { Injectable } from '@nestjs/common';
import {
  OrganizationStatus,
  VoiceAssistantStatus,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceBudgetEnforcementService } from '@modules/voice-protection/voice-budget-enforcement.service';
import { isVoiceCallProviderStagingEnabled } from '@modules/voice-call-orchestration/voice-feature-flags.config';
import { VoiceSubscriptionRepository } from '../control-plane/voice-control-plane.repository';
import { VoiceAssistantService } from '../voice-assistant.service';
import { isAvailabilityConfigured } from '../availability/voice-availability.util';
import { VoiceTestCenterService } from '../test-center/voice-test-center.service';

export type VoiceActivationSummaryLevel = 'BLOCKER' | 'WARNING' | 'READY';

export type VoiceActivationSummaryItem = {
  id: string;
  section: string;
  label: string;
  level: VoiceActivationSummaryLevel;
  message: string;
};

export type VoiceActivationSummary = {
  canActivate: boolean;
  blockers: VoiceActivationSummaryItem[];
  warnings: VoiceActivationSummaryItem[];
  ready: VoiceActivationSummaryItem[];
  rolloutStatus: 'DISABLED' | 'ENABLED' | 'SUSPENDED';
  stagingLiveCallsEnabled: boolean;
};

@Injectable()
export class VoiceActivationSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistantService: VoiceAssistantService,
    private readonly subscriptions: VoiceSubscriptionRepository,
    private readonly protection: VoiceBudgetEnforcementService,
    private readonly testCenter: VoiceTestCenterService,
  ) {}

  async getSummary(organizationId: string): Promise<VoiceActivationSummary> {
    const [assistant, subscription, readiness, testSummary, org, protectionPolicy] =
      await Promise.all([
        this.prisma.voiceAssistant.findUnique({ where: { organizationId } }),
        this.subscriptions.listByOrganization(organizationId).then((rows) => rows[0] ?? null),
        this.assistantService.getReadiness(organizationId),
        this.testCenter.getSummary(organizationId),
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { status: true },
        }),
        this.prisma.voiceBudgetPolicy.findUnique({ where: { organizationId } }),
      ]);

    const items: VoiceActivationSummaryItem[] = [];

    const rolloutStatus = this.deriveRolloutStatus(subscription, org?.status);

    items.push({
      id: 'plan',
      section: 'plan',
      label: 'Voice plan',
      level: subscription?.planCode ? 'READY' : 'BLOCKER',
      message: subscription?.planCode
        ? `Plan ${subscription.planCode} selected`
        : 'No voice subscription plan selected',
    });

    items.push({
      id: 'assistant',
      section: 'assistant',
      label: 'Assistant profile',
      level:
        assistant?.name?.trim() && assistant.voiceId && assistant.greetingMessage?.trim()
          ? 'READY'
          : 'BLOCKER',
      message:
        assistant?.name?.trim() && assistant.voiceId
          ? 'Name, voice, and greeting configured'
          : 'Complete assistant identity and voice',
    });

    items.push({
      id: 'knowledge',
      section: 'knowledge',
      label: 'Knowledge sources',
      level:
        assistant?.companyContext?.trim() ||
        assistant?.businessRules?.trim() ||
        assistant?.knowledgeSnippets?.trim()
          ? 'READY'
          : 'WARNING',
      message: 'Knowledge snippets connected for grounded answers',
    });

    items.push({
      id: 'permissions',
      section: 'permissions',
      label: 'Tool permissions',
      level: assistant?.toolPermissions ? 'READY' : 'BLOCKER',
      message: assistant?.toolPermissions
        ? 'Permission groups configured'
        : 'Configure MCP tool permission groups',
    });

    const telephonyRequired = Boolean(assistant?.telephonyEnabled || assistant?.inboundEnabled);
    items.push({
      id: 'phone',
      section: 'phone',
      label: 'Phone number',
      level:
        !telephonyRequired || assistant?.phoneNumber
          ? 'READY'
          : 'BLOCKER',
      message: telephonyRequired
        ? assistant?.phoneNumber
          ? 'Inbound number assigned'
          : 'Assign or connect a phone number'
        : 'Telephony disabled — number optional',
    });

    items.push({
      id: 'availability',
      section: 'availability',
      label: 'Availability & routing',
      level: assistant && isAvailabilityConfigured(assistant) ? 'READY' : 'BLOCKER',
      message:
        assistant && isAvailabilityConfigured(assistant)
          ? 'Business hours and fallback routing configured'
          : 'Complete weekly plan and fallback routing',
    });

    items.push({
      id: 'tests',
      section: 'tests',
      label: 'Test center',
      level: testSummary.ready ? 'READY' : testSummary.failedCount > 0 ? 'BLOCKER' : 'WARNING',
      message: testSummary.ready
        ? `${testSummary.passedCount + testSummary.partialCount}/${testSummary.requiredCount} scenarios validated`
        : `${testSummary.pendingCount} scenarios still pending`,
    });

    items.push({
      id: 'budget',
      section: 'budget',
      label: 'Budget guardrails',
      level: protectionPolicy ? 'READY' : 'WARNING',
      message: protectionPolicy
        ? 'Monthly budget policy configured'
        : 'Optional — set a monthly budget limit',
    });

    items.push({
      id: 'privacy',
      section: 'privacy',
      label: 'Privacy & retention',
      level:
        assistant?.forbiddenActions?.trim() || assistant?.businessRules?.trim()
          ? 'READY'
          : 'WARNING',
      message:
        assistant?.forbiddenActions?.trim() || assistant?.businessRules?.trim()
          ? 'Privacy guardrails documented in assistant rules'
          : 'Review privacy and forbidden actions before go-live',
    });

    const providerCheck = readiness.checks.find((check) => check.key === 'elevenlabs');
    items.push({
      id: 'provider',
      section: 'provider',
      label: 'Provider health',
      level: providerCheck?.ok ? 'READY' : 'BLOCKER',
      message: providerCheck?.ok
        ? 'ElevenLabs provider reachable'
        : 'ElevenLabs provider not healthy',
    });

    items.push({
      id: 'rollout',
      section: 'rollout',
      label: 'Tenant rollout',
      level: rolloutStatus === 'ENABLED' ? 'READY' : 'BLOCKER',
      message:
        rolloutStatus === 'ENABLED'
          ? 'Voice entitlement active for this tenant'
          : rolloutStatus === 'SUSPENDED'
            ? 'Tenant or subscription suspended'
            : 'Voice entitlement not enabled',
    });

    if (!isVoiceCallProviderStagingEnabled()) {
      items.push({
        id: 'staging_kill_switch',
        section: 'rollout',
        label: 'Live call kill-switch',
        level: 'READY',
        message: 'Live provider calls disabled globally — simulation mode only',
      });
    }

    let protectionAllowed = true;
    try {
      await this.protection.assertActivationAllowed(organizationId);
    } catch {
      protectionAllowed = false;
      items.push({
        id: 'protection',
        section: 'budget',
        label: 'Protection policy',
        level: 'BLOCKER',
        message: 'Activation blocked by budget or protection policy',
      });
    }

    if (protectionAllowed && protectionPolicy) {
      items.push({
        id: 'protection',
        section: 'budget',
        label: 'Protection policy',
        level: 'READY',
        message: 'Protection checks passed',
      });
    }

    if (assistant?.status === VoiceAssistantStatus.ACTIVE) {
      items.push({
        id: 'active',
        section: 'rollout',
        label: 'Activation state',
        level: 'READY',
        message: 'Voice assistant already active',
      });
    }

    const blockers = items.filter((item) => item.level === 'BLOCKER');
    const warnings = items.filter((item) => item.level === 'WARNING');
    const ready = items.filter((item) => item.level === 'READY');

    const canActivate =
      blockers.length === 0 &&
      readiness.ready &&
      testSummary.ready &&
      rolloutStatus === 'ENABLED' &&
      protectionAllowed &&
      assistant?.status !== VoiceAssistantStatus.ACTIVE;

    return {
      canActivate,
      blockers,
      warnings,
      ready,
      rolloutStatus,
      stagingLiveCallsEnabled: isVoiceCallProviderStagingEnabled(),
    };
  }

  private deriveRolloutStatus(
    subscription: { status: VoiceSubscriptionStatus } | null,
    orgStatus: OrganizationStatus | undefined,
  ): 'DISABLED' | 'ENABLED' | 'SUSPENDED' {
    if (orgStatus === OrganizationStatus.SUSPENDED) return 'SUSPENDED';
    if (
      subscription?.status === VoiceSubscriptionStatus.SUSPENDED ||
      subscription?.status === VoiceSubscriptionStatus.CANCELLED
    ) {
      return 'SUSPENDED';
    }
    if (
      subscription &&
      (subscription.status === VoiceSubscriptionStatus.TRIAL ||
        subscription.status === VoiceSubscriptionStatus.ACTIVE ||
        subscription.status === VoiceSubscriptionStatus.PAST_DUE)
    ) {
      return 'ENABLED';
    }
    return 'DISABLED';
  }
}
