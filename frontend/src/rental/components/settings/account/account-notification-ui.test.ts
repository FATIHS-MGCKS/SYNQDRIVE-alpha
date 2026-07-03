import { describe, expect, it } from 'vitest';
import {
  canToggleNotificationChannel,
  countEnabledNotificationChannels,
  securityChannelBlockMessage,
  SECURITY_CHANNEL_REQUIRED_MESSAGE,
  type NotificationRow,
} from './account-utils';

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
    expect(securityChannelBlockMessage('SECURITY', 'inApp', row, false)).toBe(
      SECURITY_CHANNEL_REQUIRED_MESSAGE,
    );
  });

  it('allows disabling one security channel when the other stays on', () => {
    const row = securityRow({ inApp: true, email: true });
    expect(canToggleNotificationChannel('SECURITY', 'inApp', row, false)).toBe(true);
    expect(securityChannelBlockMessage('SECURITY', 'inApp', row, false)).toBeNull();
  });
});
