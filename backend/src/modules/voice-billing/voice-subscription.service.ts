import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { VoiceSubscriptionStatus } from '@prisma/client';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import {
  VOICE_PLAN_CATALOG_VERSION,
  resolveVoicePlan,
  type VoicePlanCode,
} from './voice-plan-catalog';
import { currentBillingPeriodBounds } from './voice-billing-period.util';

export type VoicePlanChangeTiming = 'IMMEDIATE' | 'NEXT_PERIOD';

const USABLE_STATUSES: VoiceSubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE'];

@Injectable()
export class VoiceSubscriptionService {
  constructor(private readonly subscriptions: VoiceSubscriptionRepository) {}

  async getActiveSubscription(organizationId: string) {
    return this.subscriptions.findActiveByOrganization(organizationId);
  }

  async createSubscription(params: {
    organizationId: string;
    planCode: VoicePlanCode;
    status?: VoiceSubscriptionStatus;
    trialDays?: number;
  }) {
    const plan = resolveVoicePlan(params.planCode);
    const { periodStart, periodEnd } = currentBillingPeriodBounds();
    const status = params.status ?? 'PENDING';
    const trialEndsAt =
      status === 'TRIAL' && params.trialDays
        ? new Date(Date.now() + params.trialDays * 24 * 60 * 60 * 1000)
        : null;

    return this.subscriptions.create({
      organizationId: params.organizationId,
      planCode: plan.code,
      planCatalogVersion: plan.catalogVersion,
      setupFeeCents: plan.setupFeeCents,
      status,
      trialEndsAt,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    });
  }

  async activateSubscription(organizationId: string, subscriptionId: string) {
    const row = await this.subscriptions.findById(organizationId, subscriptionId);
    if (!row) {
      throw new NotFoundException('Voice subscription not found for organization');
    }
    if (row.status === 'CANCELLED' || row.status === 'SUSPENDED') {
      throw new BadRequestException(`Cannot activate subscription in status ${row.status}`);
    }

    const { periodStart, periodEnd } = currentBillingPeriodBounds();
    return this.subscriptions.update(organizationId, subscriptionId, {
      status: 'ACTIVE',
      activatedAt: new Date(),
      currentPeriodStart: row.currentPeriodStart ?? periodStart,
      currentPeriodEnd: row.currentPeriodEnd ?? periodEnd,
    });
  }

  async markPastDue(organizationId: string, subscriptionId: string) {
    return this.subscriptions.update(organizationId, subscriptionId, {
      status: 'PAST_DUE',
    });
  }

  async suspendSubscription(organizationId: string, subscriptionId: string) {
    return this.subscriptions.update(organizationId, subscriptionId, {
      status: 'SUSPENDED',
      suspendedAt: new Date(),
    });
  }

  async cancelSubscription(organizationId: string, subscriptionId: string) {
    return this.subscriptions.update(organizationId, subscriptionId, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });
  }

  async markSetupFeePaid(organizationId: string, subscriptionId: string) {
    return this.subscriptions.update(organizationId, subscriptionId, {
      setupFeePaidAt: new Date(),
    });
  }

  async changePlan(params: {
    organizationId: string;
    subscriptionId: string;
    newPlanCode: VoicePlanCode;
    timing?: VoicePlanChangeTiming;
  }) {
    const row = await this.subscriptions.findById(params.organizationId, params.subscriptionId);
    if (!row) {
      throw new NotFoundException('Voice subscription not found for organization');
    }
    if (!USABLE_STATUSES.includes(row.status) && row.status !== 'PENDING') {
      throw new BadRequestException(`Cannot change plan while subscription is ${row.status}`);
    }

    const plan = resolveVoicePlan(params.newPlanCode);
    const timing = params.timing ?? 'NEXT_PERIOD';

    if (timing === 'IMMEDIATE') {
      return this.subscriptions.update(params.organizationId, params.subscriptionId, {
        planCode: plan.code,
        planCatalogVersion: plan.catalogVersion,
        setupFeeCents: plan.setupFeeCents,
        pendingPlanCode: null,
        pendingPlanCatalogVersion: null,
        pendingPlanEffectiveAt: null,
      });
    }

    const effectiveAt = row.currentPeriodEnd ?? currentBillingPeriodBounds().periodEnd;
    return this.subscriptions.update(params.organizationId, params.subscriptionId, {
      pendingPlanCode: plan.code,
      pendingPlanCatalogVersion: plan.catalogVersion,
      pendingPlanEffectiveAt: effectiveAt,
    });
  }

  async applyPendingPlanChanges(organizationId: string, reference = new Date()) {
    const row = await this.subscriptions.findActiveByOrganization(organizationId);
    if (!row?.pendingPlanCode || !row.pendingPlanEffectiveAt) {
      return null;
    }
    if (row.pendingPlanEffectiveAt.getTime() > reference.getTime()) {
      return null;
    }

    const plan = resolveVoicePlan(
      row.pendingPlanCode,
      row.pendingPlanCatalogVersion ?? VOICE_PLAN_CATALOG_VERSION,
    );

    return this.subscriptions.update(organizationId, row.id, {
      planCode: plan.code,
      planCatalogVersion: plan.catalogVersion,
      setupFeeCents: plan.setupFeeCents,
      pendingPlanCode: null,
      pendingPlanCatalogVersion: null,
      pendingPlanEffectiveAt: null,
    });
  }

  resolvePlanForSubscription(subscription: {
    planCode: string;
    planCatalogVersion: string;
  }) {
    return resolveVoicePlan(subscription.planCode, subscription.planCatalogVersion);
  }

  isSubscriptionOperational(status: VoiceSubscriptionStatus): boolean {
    return USABLE_STATUSES.includes(status);
  }
}
