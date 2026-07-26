import { NotificationDomain, NotificationSeverity } from '@prisma/client';
import {
  buildUserHiddenExclusionClause,
  canPersonallyHideNotification,
  isPersonallyHidden,
  isUnreadForUser,
  isUserSnoozeActive,
} from './notification-receipt.policy';
import { buildUserSnoozeExclusionClause } from './notification-preference.query';

describe('notification-receipt.policy — user vs domain separation', () => {
  it('treats unread as per-user readAt absence', () => {
    expect(isUnreadForUser(null)).toBe(true);
    expect(isUnreadForUser(new Date())).toBe(false);
  });

  it('blocks hide for mandatory compliance notifications', () => {
    expect(canPersonallyHideNotification('WEBHOOK_FAILURE', NotificationSeverity.WARNING)).toBe(false);
    expect(canPersonallyHideNotification('TECHNICAL_OBSERVATION_ACTIVE', NotificationSeverity.WARNING)).toBe(true);
  });

  it('detects personal hidden state', () => {
    expect(isPersonallyHidden(null)).toBe(false);
    expect(isPersonallyHidden(new Date())).toBe(true);
  });

  it('buildUserHiddenExclusionClause keeps SECURITY domain visible', () => {
    const clause = buildUserHiddenExclusionClause('user-1');
    expect(clause.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: NotificationDomain.SECURITY }),
      ]),
    );
  });

  it('buildUserSnoozeExclusionClause still surfaces CRITICAL during personal snooze', () => {
    const clause = buildUserSnoozeExclusionClause('user-1', new Date());
    expect(clause.NOT).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          { severity: { not: NotificationSeverity.CRITICAL } },
        ]),
      }),
    );
  });
});
