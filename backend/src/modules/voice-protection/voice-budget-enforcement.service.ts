import { Injectable, Logger } from '@nestjs/common';
import {
  VoiceBudgetOverflowBehavior,
  VoiceProtectionOverrideScope,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceBudgetPolicyRepository } from '@modules/voice-assistant/control-plane/voice-audit-persistence.repository';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { VoiceSubscriptionService } from '@modules/voice-billing/voice-subscription.service';
import { VoiceBillingService } from '@modules/voice-billing/voice-billing.service';
import { currentBillingPeriodBounds } from '@modules/voice-billing/voice-billing-period.util';
import { billableMinutesFromSeconds } from '@modules/voice-billing/voice-billing-minute.util';
import { VoiceAbuseDetectionService } from './voice-abuse-detection.service';
import { VoiceConcurrentCallReservationService } from './voice-concurrent-call.reservation.service';
import { VoiceProtectionAuditService } from './voice-protection-audit.service';
import { VoiceProtectionOverrideService } from './voice-protection-override.service';
import {
  isBlockedSpecialDestination,
  isDestinationCountryAllowed,
  normalizeDestinationE164,
  resolveAllowedCountries,
} from './voice-destination-policy.util';
import {
  effectiveLimit,
  VOICE_BUDGET_WARN_THRESHOLDS_PCT,
  VOICE_PROTECTION_DEFAULTS,
} from './voice-protection-limits.config';
import {
  VOICE_PROTECTION_REASON_CODES,
  VoiceProtectionDeniedError,
  type VoiceProtectionReasonCode,
} from './voice-protection-reason-codes';

export type OutboundEnforcementContext = {
  organizationId: string;
  toE164: string;
  voiceAssistantId: string;
  conversationId?: string;
  skipConcurrencyReserve?: boolean;
};

export type EnforcementSnapshot = {
  consumedMonthlyCents: number;
  consumedDailyOutboundMinutes: number;
  monthlyBudgetCents: number | null;
  usagePct: number | null;
  activeOverrides: number;
};

@Injectable()
export class VoiceBudgetEnforcementService {
  private readonly logger = new Logger(VoiceBudgetEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: VoiceSubscriptionRepository,
    private readonly subscriptionService: VoiceSubscriptionService,
    private readonly budgetPolicies: VoiceBudgetPolicyRepository,
    private readonly billing: VoiceBillingService,
    private readonly overrides: VoiceProtectionOverrideService,
    private readonly audit: VoiceProtectionAuditService,
    private readonly concurrent: VoiceConcurrentCallReservationService,
    private readonly abuse: VoiceAbuseDetectionService,
  ) {}

  async assertOutboundAllowed(ctx: OutboundEnforcementContext): Promise<{ conversationSlotId: string }> {
    await this.assertSubscriptionOperational(ctx.organizationId);

    const destination = normalizeDestinationE164(ctx.toE164);
    if (!destination) {
      await this.block(ctx.organizationId, 'OUTBOUND_BLOCKED', VOICE_PROTECTION_REASON_CODES.DESTINATION_NOT_NORMALIZABLE, 'Destination number is not valid E.164.');
      throw new VoiceProtectionDeniedError({
        reasonCode: VOICE_PROTECTION_REASON_CODES.DESTINATION_NOT_NORMALIZABLE,
        message: 'Destination number must be valid E.164 format.',
        httpStatus: 400,
      });
    }

    if (isBlockedSpecialDestination(destination.e164)) {
      await this.block(ctx.organizationId, 'OUTBOUND_BLOCKED', VOICE_PROTECTION_REASON_CODES.DESTINATION_BLOCKED_SPECIAL, 'Special or premium destination blocked.');
      throw new VoiceProtectionDeniedError({
        reasonCode: VOICE_PROTECTION_REASON_CODES.DESTINATION_BLOCKED_SPECIAL,
        message: 'Destination number is blocked.',
        httpStatus: 400,
      });
    }

    const policy = await this.budgetPolicies.findByOrganization(ctx.organizationId);
    const activeOverrides = await this.overrides.listActive(ctx.organizationId);

    if (!this.overrides.hasActiveOverride(activeOverrides, 'OUTBOUND_DESTINATION', destination.digest)) {
      const allowedCountries = resolveAllowedCountries({
        regionPolicy: policy?.destinationRegionPolicy ?? 'DE_EEA',
        customAllowedCountries: policy?.allowedCountries ?? [],
      });
      if (!isDestinationCountryAllowed(destination, allowedCountries)) {
        await this.block(ctx.organizationId, 'OUTBOUND_BLOCKED', VOICE_PROTECTION_REASON_CODES.DESTINATION_COUNTRY_DENIED, 'Destination country not allowed.');
        throw new VoiceProtectionDeniedError({
          reasonCode: VOICE_PROTECTION_REASON_CODES.DESTINATION_COUNTRY_DENIED,
          message: 'Destination country is not allowed for this organization.',
        });
      }

      const repeatCheck = await this.concurrent.recordDestinationAttempt({
        organizationId: ctx.organizationId,
        destinationDigest: destination.digest,
        maxRepeats: effectiveLimit(
          policy?.maxRepeatsPerDestination,
          null,
          VOICE_PROTECTION_DEFAULTS.maxRepeatsPerDestination,
        ),
        cooldownSeconds: effectiveLimit(
          policy?.destinationCooldownSeconds,
          null,
          VOICE_PROTECTION_DEFAULTS.destinationCooldownSeconds,
        ),
      });
      if (!repeatCheck.allowed) {
        const code =
          repeatCheck.reason === 'cooldown'
            ? VOICE_PROTECTION_REASON_CODES.DESTINATION_COOLDOWN
            : VOICE_PROTECTION_REASON_CODES.DESTINATION_REPEAT_LIMIT;
        await this.block(ctx.organizationId, 'OUTBOUND_BLOCKED', code, 'Destination repeat limit reached.');
        throw new VoiceProtectionDeniedError({
          reasonCode: code,
          message: 'Destination call frequency limit reached. Please wait before retrying.',
        });
      }
    }

    await this.assertBudgetAndUsageLimits(ctx.organizationId, activeOverrides);

    const plan = await this.resolvePlan(ctx.organizationId);
    const maxConcurrent = effectiveLimit(
      policy?.maxConcurrentCalls,
      plan?.entitlements.maxConcurrentCalls,
      1,
    );

    if (
      !ctx.skipConcurrencyReserve &&
      !this.overrides.hasActiveOverride(activeOverrides, 'CONCURRENT_CALLS')
    ) {
      const slotId = ctx.conversationId ?? `pending:${destination.digest}:${Date.now()}`;
      const reserved = await this.concurrent.reserve({
        organizationId: ctx.organizationId,
        conversationId: slotId,
        maxConcurrent,
      });
      if (!reserved) {
        await this.block(ctx.organizationId, 'CONCURRENT_LIMIT', VOICE_PROTECTION_REASON_CODES.CONCURRENT_CALL_LIMIT, 'Concurrent call limit reached.');
        throw new VoiceProtectionDeniedError({
          reasonCode: VOICE_PROTECTION_REASON_CODES.CONCURRENT_CALL_LIMIT,
          message: 'Maximum parallel calls reached for this organization.',
        });
      }
      return { conversationSlotId: slotId };
    }

    return { conversationSlotId: ctx.conversationId ?? `pending:${destination.digest}` };
  }

  async assertActivationAllowed(organizationId: string): Promise<void> {
    await this.assertSubscriptionOperational(organizationId);
    const activeOverrides = await this.overrides.listActive(organizationId);
    try {
      await this.assertBudgetAndUsageLimits(organizationId, activeOverrides);
    } catch (err) {
      if (err instanceof VoiceProtectionDeniedError) {
        await this.block(organizationId, 'ACTIVATION_BLOCKED', VOICE_PROTECTION_REASON_CODES.ACTIVATION_BUDGET_BLOCKED, err.message);
        throw err;
      }
      throw err;
    }
  }

  async evaluateInboundDegradation(organizationId: string): Promise<{
    degraded: boolean;
    reasonCode?: VoiceProtectionReasonCode;
    message?: string;
  }> {
    const policy = await this.budgetPolicies.findByOrganization(organizationId);
    const activeOverrides = await this.overrides.listActive(organizationId);
    if (this.overrides.hasActiveOverride(activeOverrides, 'MONTHLY_BUDGET')) {
      return { degraded: false };
    }

    try {
      await this.assertBudgetAndUsageLimits(organizationId, activeOverrides);
      return { degraded: false };
    } catch (err) {
      if (err instanceof VoiceProtectionDeniedError) {
        await this.audit.record({
          organizationId,
          action: 'INBOUND_DEGRADED',
          reasonCode: VOICE_PROTECTION_REASON_CODES.INBOUND_BUDGET_DEGRADED,
          message: 'Inbound routed to safe fallback due to budget hard limit.',
        });
        return {
          degraded: true,
          reasonCode: VOICE_PROTECTION_REASON_CODES.INBOUND_BUDGET_DEGRADED,
          message: err.message,
        };
      }
      return { degraded: false };
    }
  }

  async onConversationProgress(params: {
    organizationId: string;
    conversationId: string;
    durationSeconds: number;
    destinationE164?: string | null;
    outcomeFailed?: boolean;
  }): Promise<void> {
    const policy = await this.budgetPolicies.findByOrganization(params.organizationId);
    const maxDuration = effectiveLimit(
      policy?.maxConversationDurationSeconds,
      null,
      VOICE_PROTECTION_DEFAULTS.maxConversationDurationSeconds,
    );

    if (params.durationSeconds > maxDuration) {
      await this.audit.record({
        organizationId: params.organizationId,
        action: 'DURATION_LIMIT_FLAG',
        reasonCode: VOICE_PROTECTION_REASON_CODES.MAX_DURATION_EXCEEDED,
        message: 'Conversation exceeded configured maximum duration (active call not terminated).',
        metadata: { conversationId: params.conversationId, durationSeconds: params.durationSeconds, maxDuration },
      });
    }

    const signals = await this.abuse.detectSignals({
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      destinationE164: params.destinationE164,
      durationSeconds: params.durationSeconds,
      outcomeFailed: params.outcomeFailed,
    });

    for (const signal of signals) {
      await this.audit.record({
        organizationId: params.organizationId,
        action: 'ABUSE_DETECTED',
        reasonCode: signal.reasonCode,
        message: signal.message,
        metadata: { conversationId: params.conversationId, ...signal.metadata },
      });
    }
  }

  async releaseConversationSlot(organizationId: string, conversationId: string): Promise<void> {
    await this.concurrent.release(organizationId, conversationId);
  }

  async getEnforcementSnapshot(organizationId: string): Promise<EnforcementSnapshot> {
    const policy = await this.budgetPolicies.findByOrganization(organizationId);
    const { periodStart } = currentBillingPeriodBounds();
    const monthlyBudgetCents = policy?.monthlyBudgetCents ?? null;

    const usage = await this.prisma.voiceUsageEvent.aggregate({
      where: { organizationId, occurredAt: { gte: periodStart } },
      _sum: { customerPriceCents: true },
    });
    const consumedMonthlyCents = usage._sum.customerPriceCents ?? 0;
    const consumedDailyOutboundMinutes = await this.sumDailyOutboundMinutes(organizationId);

    const usagePct =
      monthlyBudgetCents && monthlyBudgetCents > 0
        ? Math.round((consumedMonthlyCents / monthlyBudgetCents) * 100)
        : null;

    const activeOverrides = await this.overrides.listActive(organizationId);

    return {
      consumedMonthlyCents,
      consumedDailyOutboundMinutes,
      monthlyBudgetCents,
      usagePct,
      activeOverrides: activeOverrides.length,
    };
  }

  private async assertSubscriptionOperational(organizationId: string): Promise<void> {
    const subscriptions = await this.subscriptions.listByOrganization(organizationId);
    const operational = subscriptions.find((row) =>
      ['TRIAL', 'ACTIVE', 'PAST_DUE'].includes(row.status),
    );
    if (!operational) {
      const suspended = subscriptions.find((row) => row.status === VoiceSubscriptionStatus.SUSPENDED);
      const code = suspended
        ? VOICE_PROTECTION_REASON_CODES.SUBSCRIPTION_SUSPENDED
        : VOICE_PROTECTION_REASON_CODES.SUBSCRIPTION_INACTIVE;
      await this.block(organizationId, 'OUTBOUND_BLOCKED', code, 'Voice subscription not operational.');
      throw new VoiceProtectionDeniedError({
        reasonCode: code,
        message: suspended
          ? 'Voice AI subscription is suspended.'
          : 'Voice AI subscription is not active for this organization.',
      });
    }
  }

  private async assertBudgetAndUsageLimits(
    organizationId: string,
    activeOverrides: Array<{ scope: VoiceProtectionOverrideScope; targetRef: string | null }>,
  ): Promise<void> {
    const policy = await this.budgetPolicies.findByOrganization(organizationId);
    const { periodStart } = currentBillingPeriodBounds();
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    if (!this.overrides.hasActiveOverride(activeOverrides, 'MONTHLY_BUDGET')) {
      const monthlyBudgetCents = policy?.monthlyBudgetCents;
      if (monthlyBudgetCents && monthlyBudgetCents > 0) {
        const usage = await this.prisma.voiceUsageEvent.aggregate({
          where: { organizationId, occurredAt: { gte: periodStart } },
          _sum: { customerPriceCents: true },
        });
        const consumed = usage._sum.customerPriceCents ?? 0;
        const thresholdPct = policy?.hardLimitThresholdPct ?? VOICE_PROTECTION_DEFAULTS.hardLimitThresholdPct;
        const threshold = Math.floor((monthlyBudgetCents * thresholdPct) / 100);
        const graceMinutes = policy?.hardLimitGraceMinutes ?? VOICE_PROTECTION_DEFAULTS.hardLimitGraceMinutes;

        if (consumed >= threshold) {
          const overflow = policy?.overflowBehavior ?? VoiceBudgetOverflowBehavior.WARN;
          if (overflow === VoiceBudgetOverflowBehavior.HARD_STOP) {
            const usageSummary = await this.billing.getOrganizationUsage(organizationId);
            if (usageSummary.overageMinutes <= graceMinutes) {
              await this.audit.record({
                organizationId,
                action: 'BUDGET_HARD_LIMIT',
                reasonCode: VOICE_PROTECTION_REASON_CODES.MONTHLY_BUDGET_GRACE,
                message: 'Operating within hard-limit grace minutes.',
                metadata: { overageMinutes: usageSummary.overageMinutes, graceMinutes },
              });
            } else {
              await this.block(organizationId, 'BUDGET_HARD_LIMIT', VOICE_PROTECTION_REASON_CODES.MONTHLY_BUDGET_HARD_LIMIT, 'Monthly budget hard limit reached.');
              throw new VoiceProtectionDeniedError({
                reasonCode: VOICE_PROTECTION_REASON_CODES.MONTHLY_BUDGET_HARD_LIMIT,
                message: 'Voice AI monthly budget hard limit reached.',
              });
            }
          }
        }
      }
    }

    if (!this.overrides.hasActiveOverride(activeOverrides, 'DAILY_OUTBOUND')) {
      const dailyMinutesLimit = effectiveLimit(
        policy?.dailyOutboundMinutesLimit,
        null,
        VOICE_PROTECTION_DEFAULTS.dailyOutboundMinutesLimit,
      );
      const consumedDaily = await this.sumDailyOutboundMinutes(organizationId);
      if (consumedDaily >= dailyMinutesLimit) {
        await this.block(organizationId, 'OUTBOUND_BLOCKED', VOICE_PROTECTION_REASON_CODES.DAILY_OUTBOUND_MINUTES, 'Daily outbound minute limit reached.');
        throw new VoiceProtectionDeniedError({
          reasonCode: VOICE_PROTECTION_REASON_CODES.DAILY_OUTBOUND_MINUTES,
          message: 'Daily outbound minute limit reached.',
        });
      }

      if (policy?.dailyLimitCents && policy.dailyLimitCents > 0) {
        const dailySpend = await this.prisma.voiceUsageEvent.aggregate({
          where: { organizationId, occurredAt: { gte: dayStart } },
          _sum: { customerPriceCents: true },
        });
        if ((dailySpend._sum.customerPriceCents ?? 0) >= policy.dailyLimitCents) {
          await this.block(organizationId, 'OUTBOUND_BLOCKED', VOICE_PROTECTION_REASON_CODES.DAILY_SPEND_LIMIT, 'Daily spend limit reached.');
          throw new VoiceProtectionDeniedError({
            reasonCode: VOICE_PROTECTION_REASON_CODES.DAILY_SPEND_LIMIT,
            message: 'Daily voice spend limit reached.',
          });
        }
      }
    }
  }

  private async sumDailyOutboundMinutes(organizationId: string): Promise<number> {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.voiceUsageEvent.findMany({
      where: {
        organizationId,
        occurredAt: { gte: dayStart },
        eventType: 'OUTBOUND_CALL',
      },
      select: { billableMinutes: true, billableSeconds: true },
    });
    return rows.reduce((sum, row) => {
      if (typeof row.billableMinutes === 'number') {
        return sum + row.billableMinutes;
      }
      return sum + billableMinutesFromSeconds(row.billableSeconds ?? 0);
    }, 0);
  }

  private async resolvePlan(organizationId: string) {
    const sub = await this.subscriptionService.getActiveSubscription(organizationId);
    if (!sub) {
      return null;
    }
    return this.subscriptionService.resolvePlanForSubscription(sub);
  }

  private async block(
    organizationId: string,
    action: 'OUTBOUND_BLOCKED' | 'BUDGET_HARD_LIMIT' | 'CONCURRENT_LIMIT' | 'ACTIVATION_BLOCKED',
    reasonCode: VoiceProtectionReasonCode,
    message: string,
  ) {
    await this.audit.record({ organizationId, action, reasonCode, message });
  }
}

export { VOICE_BUDGET_WARN_THRESHOLDS_PCT };
