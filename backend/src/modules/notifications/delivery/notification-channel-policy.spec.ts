import {
  MembershipRole,
  NotificationCategory,
  NotificationDeliveryChannel,
  NotificationSeverity,
} from '@prisma/client';
import { DEFAULT_CRITICAL_DELIVERY, DEFAULT_IN_APP_DELIVERY } from '../registry/notification-event-registry.policies';
import { NotificationPreferenceService } from '../access/notification-preference.service';
import { NotificationChannelPolicyService } from './notification-channel-policy.service';
import {
  NOTIFICATION_CHANNEL_MATRIX,
  isEngineDeliverableChannel,
  isStubOrDisabledChannel,
} from './notification-channel-matrix';
import { isWithinQuietHours } from './notification-delivery-quiet-hours.util';

const policy = new NotificationChannelPolicyService();
const preferenceService = new NotificationPreferenceService();

function basePrefs(overrides: Partial<{
  inApp: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
  criticalOnly: boolean;
}> = {}) {
  return [
    {
      category: NotificationCategory.BOOKINGS,
      inApp: overrides.inApp ?? true,
      email: overrides.email ?? true,
      push: overrides.push ?? false,
      sms: overrides.sms ?? false,
      criticalOnly: overrides.criticalOnly ?? false,
    } as any,
  ];
}

function evaluateEmail(overrides: {
  severity?: NotificationSeverity;
  eventType?: string;
  prefs?: ReturnType<typeof basePrefs>;
  email?: string | null;
  mandatory?: boolean;
  referenceNow?: Date;
  deliveryPolicy?: typeof DEFAULT_IN_APP_DELIVERY;
}) {
  const prefs = overrides.prefs ?? basePrefs();
  const decision = preferenceService.evaluateInAppDelivery(
    overrides.eventType ?? 'STATION_SHORTAGE',
    overrides.severity ?? NotificationSeverity.WARNING,
    prefs,
  );
  return policy.evaluateExternalChannel({
    channel: NotificationDeliveryChannel.EMAIL,
    eventType: overrides.eventType ?? 'STATION_SHORTAGE',
    severity: overrides.severity ?? NotificationSeverity.WARNING,
    deliveryPolicy: overrides.deliveryPolicy ?? DEFAULT_IN_APP_DELIVERY,
    preferenceDecision: decision,
    membershipRole: MembershipRole.ORG_ADMIN,
    supportedRoles: [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
    recipientEmail: overrides.email !== undefined ? overrides.email : 'admin@example.com',
    recipientChannelVerified: false,
    referenceNow: overrides.referenceNow ?? new Date('2026-07-11T12:00:00.000Z'),
    userTimezone: 'Europe/Berlin',
    quietHours: { startLocal: '22:00', endLocal: '07:00' },
  });
}

describe('notification-channel-matrix', () => {
  it('documents all channels with implementation status', () => {
    expect(NOTIFICATION_CHANNEL_MATRIX.IN_APP.implementationStatus).toBe('active');
    expect(NOTIFICATION_CHANNEL_MATRIX.EMAIL.implementationStatus).toBe('active');
    expect(NOTIFICATION_CHANNEL_MATRIX.PUSH.implementationStatus).toBe('stub');
    expect(NOTIFICATION_CHANNEL_MATRIX.SMS.implementationStatus).toBe('disabled');
    expect(NOTIFICATION_CHANNEL_MATRIX.WHATSAPP.implementationStatus).toBe('disabled');
    expect(NOTIFICATION_CHANNEL_MATRIX.VOICE.implementationStatus).toBe('disabled');
  });

  it('only EMAIL is engine-deliverable today', () => {
    expect(isEngineDeliverableChannel(NotificationDeliveryChannel.EMAIL)).toBe(true);
    expect(isEngineDeliverableChannel(NotificationDeliveryChannel.PUSH)).toBe(false);
    expect(isStubOrDisabledChannel('WHATSAPP')).toBe(true);
    expect(isStubOrDisabledChannel('VOICE')).toBe(true);
  });
});

describe('NotificationChannelPolicyService', () => {
  it('blocks user email opt-out for non-mandatory events', () => {
    const result = evaluateEmail({
      prefs: basePrefs({ email: false }),
      deliveryPolicy: { ...DEFAULT_IN_APP_DELIVERY, channels: ['IN_APP', 'EMAIL'] },
    });
    expect(result).toEqual({ allowed: false, reason: 'USER_OPT_OUT', mandatory: false });
  });

  it('allows mandatory SECURITY email despite user opt-out', () => {
    const result = evaluateEmail({
      eventType: 'WEBHOOK_FAILURE',
      prefs: basePrefs({ email: false }),
      deliveryPolicy: DEFAULT_CRITICAL_DELIVERY,
    });
    expect(result.allowed).toBe(true);
    expect(result.mandatory).toBe(true);
  });

  it('defers non-critical email during quiet hours', () => {
    const result = evaluateEmail({
      deliveryPolicy: { ...DEFAULT_IN_APP_DELIVERY, channels: ['IN_APP', 'EMAIL'] },
      referenceNow: new Date('2026-07-11T21:00:00.000Z'),
    });
    expect(result.allowed).toBe(true);
    expect(result.deferredUntil).toBeInstanceOf(Date);
  });

  it('does not defer CRITICAL email during quiet hours', () => {
    const result = evaluateEmail({
      severity: NotificationSeverity.CRITICAL,
      eventType: 'INTEGRATION_DISCONNECTED',
      deliveryPolicy: DEFAULT_CRITICAL_DELIVERY,
      referenceNow: new Date('2026-07-11T21:00:00.000Z'),
    });
    expect(result.allowed).toBe(true);
    expect(result.deferredUntil).toBeUndefined();
  });

  it('does not defer mandatory email during quiet hours', () => {
    const result = evaluateEmail({
      eventType: 'WEBHOOK_FAILURE',
      deliveryPolicy: DEFAULT_CRITICAL_DELIVERY,
      referenceNow: new Date('2026-07-11T21:00:00.000Z'),
    });
    expect(result.allowed).toBe(true);
    expect(result.deferredUntil).toBeUndefined();
  });

  it('blocks push stub channel', () => {
    const decision = preferenceService.evaluateInAppDelivery(
      'INTEGRATION_DISCONNECTED',
      NotificationSeverity.CRITICAL,
      basePrefs({ push: true }),
    );
    const result = policy.evaluateExternalChannel({
      channel: NotificationDeliveryChannel.PUSH,
      eventType: 'INTEGRATION_DISCONNECTED',
      severity: NotificationSeverity.CRITICAL,
      deliveryPolicy: DEFAULT_CRITICAL_DELIVERY,
      preferenceDecision: decision,
      membershipRole: MembershipRole.ORG_ADMIN,
      supportedRoles: [MembershipRole.ORG_ADMIN],
      recipientEmail: 'admin@example.com',
      recipientChannelVerified: false,
      referenceNow: new Date('2026-07-11T12:00:00.000Z'),
      userTimezone: 'Europe/Berlin',
      quietHours: { startLocal: '22:00', endLocal: '07:00' },
    });
    expect(result).toEqual({ allowed: false, reason: 'CHANNEL_STUB', mandatory: true });
  });

  it('blocks email when recipient address is missing', () => {
    const result = evaluateEmail({
      email: null,
      deliveryPolicy: { ...DEFAULT_IN_APP_DELIVERY, channels: ['IN_APP', 'EMAIL'] },
    });
    expect(result).toEqual({ allowed: false, reason: 'MISSING_RECIPIENT_EMAIL', mandatory: false });
  });

  it('blocks unverified push recipient even when user enabled push', () => {
    const decision = preferenceService.evaluateInAppDelivery(
      'STATION_SHORTAGE',
      NotificationSeverity.WARNING,
      basePrefs({ push: true }),
    );
    const result = policy.evaluateExternalChannel({
      channel: NotificationDeliveryChannel.PUSH,
      eventType: 'STATION_SHORTAGE',
      severity: NotificationSeverity.WARNING,
      deliveryPolicy: { ...DEFAULT_IN_APP_DELIVERY, channels: ['IN_APP', 'PUSH'] },
      preferenceDecision: decision,
      membershipRole: MembershipRole.ORG_ADMIN,
      supportedRoles: [MembershipRole.ORG_ADMIN],
      recipientEmail: 'admin@example.com',
      recipientChannelVerified: false,
      referenceNow: new Date('2026-07-11T12:00:00.000Z'),
      userTimezone: 'Europe/Berlin',
      quietHours: { startLocal: '22:00', endLocal: '07:00' },
    });
    expect(result.reason).toBe('CHANNEL_STUB');
  });
});

describe('NotificationPreferenceService — org vs user defaults', () => {
  it('seeds user prefs from org category defaults when no row exists', () => {
    const effective = preferenceService.resolveEffectivePreferences(
      NotificationCategory.DOCUMENTS,
      [],
    );
    expect(effective.orgDefaults.email).toBe(false);
    expect(effective.userOverrides.email).toBe(false);
  });

  it('user overrides win over org defaults for non-mandatory delivery', () => {
    const effective = preferenceService.resolveEffectivePreferences(
      NotificationCategory.BOOKINGS,
      [
        {
          category: NotificationCategory.BOOKINGS,
          inApp: true,
          email: false,
          push: false,
          sms: false,
          criticalOnly: false,
        } as any,
      ],
    );
    expect(effective.orgDefaults.email).toBe(true);
    expect(effective.userOverrides.email).toBe(false);
  });
});
