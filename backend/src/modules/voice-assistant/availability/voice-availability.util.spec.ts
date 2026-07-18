import { detectAvailabilityConflicts, parseAvailabilityConfig } from './voice-availability.util';
import { defaultAvailabilityConfig } from './voice-availability.util';

describe('voice-availability.util', () => {
  it('detects overlapping windows', () => {
    const config = defaultAvailabilityConfig();
    config.weeklySchedule[0].windows = [
      { open: '09:00', close: '12:00' },
      { open: '11:00', close: '13:00' },
    ];
    const conflicts = detectAvailabilityConflicts(config);
    expect(conflicts.some(c => c.code === 'overlap')).toBe(true);
  });

  it('parses legacy flat hours into weekly schedule', () => {
    const config = parseAvailabilityConfig({
      businessHoursStart: '08:00',
      businessHoursEnd: '17:00',
      businessHoursTimezone: 'Europe/Berlin',
      afterHoursMessage: 'Closed',
      escalationPhone: '+491234',
      fallbackMessage: 'Please call back',
      businessHours: null,
      escalateOnRequest: true,
      escalateOnLowConf: true,
      escalateOnSensitive: true,
    } as never);
    expect(config.weeklySchedule.find(d => d.day === 'mon')?.windows[0]).toEqual({
      open: '08:00',
      close: '17:00',
    });
  });
});
