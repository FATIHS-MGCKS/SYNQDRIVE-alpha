import { isWithinBusinessHours } from './agent-business-hours.util';

describe('agent-business-hours.util', () => {
  it('treats missing business hours as open', () => {
    expect(isWithinBusinessHours(null, new Date('2026-07-17T12:00:00Z'))).toBe(true);
  });

  it('respects simple start/end windows', () => {
    const open = isWithinBusinessHours(
      { timezone: 'Europe/Berlin', start: '09:00', end: '18:00' },
      new Date('2026-07-17T10:30:00Z'),
    );
    expect(open).toBe(true);
  });

  it('marks schedule closed days as closed', () => {
    const friday = new Date('2026-07-17T12:00:00Z');
    expect(
      isWithinBusinessHours(
        {
          schedule: [{ day: 'fri', closed: true }],
        },
        friday,
      ),
    ).toBe(false);
  });
});
