import { NotificationStatus } from './notification.enums';
import {
  allowedNotificationStatusTargets,
  assertNotificationStatusTransition,
  canTransitionNotificationStatus,
  NotificationStatusTransitionError,
} from './notification-status.transitions';

describe('notification-status.transitions', () => {
  it('allows OPEN → ACKNOWLEDGED', () => {
    expect(canTransitionNotificationStatus(NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED)).toBe(true);
  });

  it('allows OPEN → SNOOZED → OPEN', () => {
    expect(canTransitionNotificationStatus(NotificationStatus.OPEN, NotificationStatus.SNOOZED)).toBe(true);
    expect(canTransitionNotificationStatus(NotificationStatus.SNOOZED, NotificationStatus.OPEN)).toBe(true);
  });

  it('allows OPEN → RESOLVED and ACKNOWLEDGED → RESOLVED', () => {
    expect(canTransitionNotificationStatus(NotificationStatus.OPEN, NotificationStatus.RESOLVED)).toBe(true);
    expect(canTransitionNotificationStatus(NotificationStatus.ACKNOWLEDGED, NotificationStatus.RESOLVED)).toBe(true);
  });

  it('allows RESOLVED → OPEN only with reopenAuthorized', () => {
    expect(canTransitionNotificationStatus(NotificationStatus.RESOLVED, NotificationStatus.OPEN)).toBe(false);
    expect(
      canTransitionNotificationStatus(NotificationStatus.RESOLVED, NotificationStatus.OPEN, {
        reopenAuthorized: true,
      }),
    ).toBe(true);
  });

  it('allows OPEN → ARCHIVED only with administrativeArchive', () => {
    expect(canTransitionNotificationStatus(NotificationStatus.OPEN, NotificationStatus.ARCHIVED)).toBe(false);
    expect(
      canTransitionNotificationStatus(NotificationStatus.OPEN, NotificationStatus.ARCHIVED, {
        administrativeArchive: true,
      }),
    ).toBe(true);
  });

  it('forbids ARCHIVED → OPEN', () => {
    expect(() =>
      assertNotificationStatusTransition(NotificationStatus.ARCHIVED, NotificationStatus.OPEN),
    ).toThrow(NotificationStatusTransitionError);
  });

  it('forbids RESOLVED → SNOOZED', () => {
    expect(canTransitionNotificationStatus(NotificationStatus.RESOLVED, NotificationStatus.SNOOZED)).toBe(false);
  });

  it('lists allowed targets for OPEN', () => {
    const targets = allowedNotificationStatusTargets(NotificationStatus.OPEN);
    expect(targets).toEqual(
      expect.arrayContaining([
        NotificationStatus.ACKNOWLEDGED,
        NotificationStatus.SNOOZED,
        NotificationStatus.RESOLVED,
      ]),
    );
    expect(targets).not.toContain(NotificationStatus.ARCHIVED);
  });
});
