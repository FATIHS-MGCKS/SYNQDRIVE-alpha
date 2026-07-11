import {
  MembershipRole,
  NotificationEventKind,
  NotificationStatus,
} from '@prisma/client';
import { deriveAvailableActions } from './notification-available-actions';

describe('deriveAvailableActions', () => {
  const base = {
    eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
    eventKind: NotificationEventKind.STATE,
    membershipRole: MembershipRole.ORG_ADMIN,
    isRead: false,
    isPersonallyAcknowledged: false,
    userSnoozedUntil: null,
    hasActionTarget: true,
  };

  it('includes read and open_entity for open technical observation', () => {
    const actions = deriveAvailableActions({
      ...base,
      status: NotificationStatus.OPEN,
    });
    expect(actions).toEqual(expect.arrayContaining(['read', 'acknowledge', 'snooze', 'resolve', 'open_entity']));
  });

  it('excludes resolve for auto telemetry when worker', () => {
    const actions = deriveAvailableActions({
      status: NotificationStatus.OPEN,
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      eventKind: NotificationEventKind.STATE,
      membershipRole: MembershipRole.WORKER,
      isRead: false,
      isPersonallyAcknowledged: false,
      userSnoozedUntil: null,
      hasActionTarget: true,
    });
    expect(actions).not.toContain('resolve');
    expect(actions).toContain('snooze');
  });

  it('excludes archive for worker', () => {
    const actions = deriveAvailableActions({
      ...base,
      status: NotificationStatus.OPEN,
      membershipRole: MembershipRole.WORKER,
    });
    expect(actions).not.toContain('archive');
    expect(actions).toContain('resolve');
  });

  it('returns empty when role not in registry supportedRoles', () => {
    const actions = deriveAvailableActions({
      status: NotificationStatus.OPEN,
      eventType: 'STATION_SHORTAGE',
      eventKind: NotificationEventKind.STATE,
      membershipRole: MembershipRole.DRIVER,
      isRead: false,
      isPersonallyAcknowledged: false,
      userSnoozedUntil: null,
      hasActionTarget: true,
    });
    expect(actions).toEqual([]);
  });

  it('includes unsnooze when user personally snoozed', () => {
    const actions = deriveAvailableActions({
      ...base,
      status: NotificationStatus.OPEN,
      userSnoozedUntil: new Date(Date.now() + 60_000),
    });
    expect(actions).toContain('unsnooze');
    expect(actions).not.toContain('snooze');
  });

  it('excludes acknowledge when already personally acknowledged', () => {
    const actions = deriveAvailableActions({
      ...base,
      status: NotificationStatus.OPEN,
      isPersonallyAcknowledged: true,
    });
    expect(actions).not.toContain('acknowledge');
  });
});
