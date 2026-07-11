import { NotificationSeverity } from './notification.enums';
import { escalateSeverity, isRecoverySeverity } from './notification-severity.policy';

describe('notification-severity.policy', () => {
  it('detects recovery severity', () => {
    expect(isRecoverySeverity(NotificationSeverity.SUCCESS)).toBe(true);
    expect(isRecoverySeverity(NotificationSeverity.WARNING)).toBe(false);
  });

  it('escalates upward only', () => {
    expect(escalateSeverity(NotificationSeverity.INFO, NotificationSeverity.WARNING)).toBe(
      NotificationSeverity.WARNING,
    );
    expect(escalateSeverity(NotificationSeverity.WARNING, NotificationSeverity.INFO)).toBe(
      NotificationSeverity.WARNING,
    );
    expect(escalateSeverity(NotificationSeverity.WARNING, NotificationSeverity.CRITICAL)).toBe(
      NotificationSeverity.CRITICAL,
    );
  });
});
