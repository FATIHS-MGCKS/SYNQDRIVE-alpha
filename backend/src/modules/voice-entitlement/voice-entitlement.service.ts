import { Injectable } from '@nestjs/common';
import type { VoiceSubscriptionStatus } from '@prisma/client';
import { VoiceSubscriptionRepository } from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { isCapabilityAllowed } from './voice-entitlement.policy';
import {
  VOICE_ENTITLEMENT_REASON_CODES,
  VoiceEntitlementDeniedError,
} from './voice-entitlement-reason-codes';
import type {
  VoiceEntitlementCapability,
  VoiceEntitlementContext,
  VoiceEntitlementStatus,
} from './voice-entitlement.types';

const RETENTION_HISTORY_DAYS = 90;

@Injectable()
export class VoiceEntitlementService {
  constructor(private readonly subscriptions: VoiceSubscriptionRepository) {}

  async resolveContext(organizationId: string): Promise<VoiceEntitlementContext> {
    const rows = await this.subscriptions.listByOrganization(organizationId);
    const subscription = rows[0] ?? null;
    const status = this.deriveStatus(subscription?.status ?? null);

    return {
      organizationId,
      status,
      subscriptionId: subscription?.id ?? null,
      subscriptionStatus: subscription?.status ?? null,
      planCode: subscription?.planCode ?? null,
      cancelledAt: subscription?.cancelledAt ?? null,
    };
  }

  deriveStatus(subscriptionStatus: VoiceSubscriptionStatus | null): VoiceEntitlementStatus {
    if (!subscriptionStatus) {
      return 'NO_SUBSCRIPTION';
    }

    switch (subscriptionStatus) {
      case 'PENDING':
        return 'NO_SUBSCRIPTION';
      case 'TRIAL':
        return 'TRIAL';
      case 'ACTIVE':
        return 'ACTIVE';
      case 'PAST_DUE':
        return 'PAST_DUE';
      case 'SUSPENDED':
        return 'SUSPENDED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return 'NO_SUBSCRIPTION';
    }
  }

  async isCapabilityAllowed(
    organizationId: string,
    capability: VoiceEntitlementCapability,
  ): Promise<boolean> {
    try {
      await this.assertCapability(organizationId, capability);
      return true;
    } catch (err) {
      if (err instanceof VoiceEntitlementDeniedError) {
        return false;
      }
      throw err;
    }
  }

  async assertCapability(
    organizationId: string,
    capability: VoiceEntitlementCapability,
  ): Promise<VoiceEntitlementContext> {
    const context = await this.resolveContext(organizationId);

    if (context.status === 'CANCELLED' && capability === 'history.read') {
      if (!this.isWithinCancelledRetention(context.cancelledAt)) {
        throw new VoiceEntitlementDeniedError({
          reasonCode: VOICE_ENTITLEMENT_REASON_CODES.RETENTION_EXPIRED,
          message: 'Voice conversation history is no longer available for this cancelled subscription.',
          entitlementStatus: context.status,
          capability,
        });
      }
    }

    if (!isCapabilityAllowed(context.status, capability)) {
      throw new VoiceEntitlementDeniedError({
        reasonCode: this.reasonForDenied(context.status),
        message: this.messageForDenied(context.status, capability),
        entitlementStatus: context.status,
        capability,
      });
    }

    return context;
  }

  /** Operational subscription suitable for budget/call paths (TRIAL, ACTIVE, PAST_DUE). */
  isOperationalStatus(status: VoiceEntitlementStatus): boolean {
    return status === 'TRIAL' || status === 'ACTIVE' || status === 'PAST_DUE';
  }

  /** Runtime voice operations (calls, MCP, test center, deploy). */
  isRuntimeStatus(status: VoiceEntitlementStatus): boolean {
    return status === 'TRIAL' || status === 'ACTIVE';
  }

  private isWithinCancelledRetention(cancelledAt: Date | null): boolean {
    if (!cancelledAt) {
      return true;
    }
    const cutoff = Date.now() - RETENTION_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    return cancelledAt.getTime() >= cutoff;
  }

  private reasonForDenied(status: VoiceEntitlementStatus) {
    switch (status) {
      case 'NO_SUBSCRIPTION':
        return VOICE_ENTITLEMENT_REASON_CODES.NO_SUBSCRIPTION;
      case 'SUSPENDED':
        return VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_SUSPENDED;
      case 'CANCELLED':
        return VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_CANCELLED;
      case 'PAST_DUE':
        return VOICE_ENTITLEMENT_REASON_CODES.SUBSCRIPTION_PAST_DUE;
      default:
        return VOICE_ENTITLEMENT_REASON_CODES.CAPABILITY_DENIED;
    }
  }

  private messageForDenied(
    status: VoiceEntitlementStatus,
    capability: VoiceEntitlementCapability,
  ): string {
    const base = `Voice capability '${capability}' is not allowed while subscription status is ${status}.`;
    if (status === 'NO_SUBSCRIPTION') {
      return `${base} Start a voice subscription to continue.`;
    }
    if (status === 'SUSPENDED') {
      return `${base} Contact support to restore voice services.`;
    }
    if (status === 'CANCELLED') {
      return `${base} Voice runtime is disabled for cancelled subscriptions.`;
    }
    if (status === 'PAST_DUE') {
      return `${base} Resolve billing to restore full voice access.`;
    }
    return base;
  }
}
