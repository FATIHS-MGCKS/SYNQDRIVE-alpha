import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_CARD_NEUTRAL_SURFACE,
  notificationCriticalSurface,
  notificationEntrySurface,
  notificationWatchSurface,
} from './notificationCardSurface';

describe('notificationCardSurface', () => {
  it('matches legacy critical and warning surfaces', () => {
    expect(notificationEntrySurface(false, 'critical')).toBe(notificationCriticalSurface('default'));
    expect(notificationEntrySurface(false, 'warning')).toBe(notificationWatchSurface());
    expect(notificationEntrySurface(false, 'info')).toBe(NOTIFICATION_CARD_NEUTRAL_SURFACE);
  });
});
