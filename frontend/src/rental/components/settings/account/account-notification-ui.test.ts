import { describe, expect, it } from 'vitest';
import {
  canToggleNotificationChannel,
  countEnabledNotificationChannels,
  securityChannelBlockMessage,
  type NotificationRow,
} from './account-utils';
import { st } from '../../tasks-settings/settings-i18n';

function securityRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    category: 'SECURITY',
    label: 'Sicherheit',
    description: 'Security alerts',
    inApp: true,
    email: true,
    push: false,
    sms: false,
    criticalOnly: false,
    ...overrides,
  };
}

describe('account notification UI helpers', () => {
  it('counts enabled delivery channels excluding criticalOnly', () => {
    expect(
      countEnabledNotificationChannels({
        category: 'BOOKINGS',
        label: 'Buchungen',
        description: '',
        inApp: true,
        email: false,
        push: true,
        sms: false,
        criticalOnly: true,
      }),
    ).toBe(2);
  });

  it('blocks disabling the last security delivery channel', () => {
    const row = securityRow({ inApp: true, email: false });
    expect(canToggleNotificationChannel('SECURITY', 'inApp', row, false)).toBe(false);
    expect(securityChannelBlockMessage('de', 'SECURITY', 'inApp', row, false)).toBe(
      st('de', 'settings.account.notifications.securityChannelRequired'),
    );
  });

  it('allows disabling one security channel when the other stays on', () => {
    const row = securityRow({ inApp: true, email: true });
    expect(canToggleNotificationChannel('SECURITY', 'inApp', row, false)).toBe(true);
    expect(securityChannelBlockMessage('de', 'SECURITY', 'inApp', row, false)).toBeNull();
  });
});
