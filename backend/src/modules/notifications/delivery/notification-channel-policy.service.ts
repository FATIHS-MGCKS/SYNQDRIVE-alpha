import { Injectable } from '@nestjs/common';
import { NotificationDeliveryChannel, NotificationSeverity } from '@prisma/client';
import {
  getChannelDefinition,
  isEngineDeliverableChannel,
  isStubOrDisabledChannel,
} from './notification-channel-matrix';
import {
  criticalOverridesQuietHours,
  isWithinQuietHours,
} from './notification-delivery-quiet-hours.util';
import type {
  ChannelPolicyEvaluationInput,
  ChannelPolicyEvaluationResult,
} from './notification-channel-policy.types';

@Injectable()
export class NotificationChannelPolicyService {
  evaluateExternalChannel(
    input: ChannelPolicyEvaluationInput,
  ): ChannelPolicyEvaluationResult {
    const { channel, preferenceDecision } = input;
    const channelDef = getChannelDefinition(channel);

    if (!channelDef) {
      return { allowed: false, reason: 'CHANNEL_DISABLED', mandatory: false };
    }

    if (channelDef.implementationStatus === 'disabled') {
      return { allowed: false, reason: 'CHANNEL_DISABLED', mandatory: preferenceDecision.mandatory };
    }

    if (channelDef.implementationStatus === 'stub') {
      return { allowed: false, reason: 'CHANNEL_STUB', mandatory: preferenceDecision.mandatory };
    }

    if (!isEngineDeliverableChannel(channel)) {
      return { allowed: false, reason: 'CHANNEL_DISABLED', mandatory: preferenceDecision.mandatory };
    }

    if (!input.deliveryPolicy.channels.includes(channel as 'EMAIL' | 'PUSH' | 'SMS')) {
      return { allowed: false, reason: 'NOT_IN_EVENT_POLICY', mandatory: false };
    }

    if (!input.supportedRoles.includes(input.membershipRole)) {
      return { allowed: false, reason: 'ROLE_NOT_SUPPORTED', mandatory: false };
    }

    const mandatory = preferenceDecision.mandatory;

    const channelEnabled = this.isUserChannelEnabled(channel, preferenceDecision, mandatory);
    if (!channelEnabled) {
      return { allowed: false, reason: 'USER_OPT_OUT', mandatory };
    }

    if (channel === NotificationDeliveryChannel.EMAIL) {
      if (!input.recipientEmail?.trim()) {
        return { allowed: false, reason: 'MISSING_RECIPIENT_EMAIL', mandatory };
      }
    }

    if (channelDef.requiresVerifiedRecipient && !input.recipientChannelVerified) {
      return { allowed: false, reason: 'UNVERIFIED_CHANNEL', mandatory };
    }

    const deferredUntil = this.resolveQuietHoursDeferral(input, mandatory);

    return { allowed: true, mandatory, deferredUntil };
  }

  private isUserChannelEnabled(
    channel: NotificationDeliveryChannel,
    decision: ChannelPolicyEvaluationInput['preferenceDecision'],
    mandatory: boolean,
  ): boolean {
    if (channel === NotificationDeliveryChannel.EMAIL) {
      return mandatory ? true : decision.email;
    }
    if (channel === NotificationDeliveryChannel.PUSH) {
      return mandatory ? true : decision.push;
    }
    if (channel === NotificationDeliveryChannel.SMS) {
      return mandatory ? true : decision.sms;
    }
    return false;
  }

  private resolveQuietHoursDeferral(
    input: ChannelPolicyEvaluationInput,
    mandatory: boolean,
  ): Date | undefined {
    const inQuietHours = isWithinQuietHours(
      input.referenceNow,
      input.userTimezone,
      input.quietHours,
    );
    if (!inQuietHours) return undefined;

    if (criticalOverridesQuietHours(input.severity)) return undefined;
    if (mandatory) return undefined;

    const [endH, endM] = input.quietHours.endLocal.split(':').map(Number);
    const defer = new Date(input.referenceNow);
    defer.setHours(endH, endM, 0, 0);
    return defer > input.referenceNow ? defer : input.referenceNow;
  }
}

/** Filter registry channels to engine-routable outbound channels only. */
export function filterRoutableOutboundChannels(
  channels: Array<'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS'>,
): NotificationDeliveryChannel[] {
  return channels
    .filter((c) => c !== 'IN_APP')
    .map((c) => c as NotificationDeliveryChannel)
    .filter((c) => isEngineDeliverableChannel(c) && !isStubOrDisabledChannel(c));
}
