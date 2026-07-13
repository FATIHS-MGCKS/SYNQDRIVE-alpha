import { describe, expect, it } from 'vitest';
import {
  activeRentalKmBarFillPercent,
  activeRentalKmBarTone,
  activeRentalRentedTillText,
  formatKmRemainingLabel,
  kmProgressPercent,
  kmRemainingPercent,
} from './activeRentalDrawer.utils';

describe('activeRentalDrawer.utils', () => {
  it('computes km progress and remaining percent', () => {
    expect(kmProgressPercent(250, 1000)).toBe(25);
    expect(kmRemainingPercent(250, 1000)).toBe(75);
    expect(kmProgressPercent(null, 1000)).toBeNull();
    expect(kmProgressPercent(100, 0)).toBeNull();
  });

  it('formats remaining km label in de and en', () => {
    expect(formatKmRemainingLabel(250, 1000, 'de')).toBe('750 km Rest');
    expect(formatKmRemainingLabel(250, 1000, 'en')).toBe('750 km left');
    expect(formatKmRemainingLabel(1100, 1000, 'de')).toBe('+100 km');
  });

  it('derives bar tone from consumed share', () => {
    expect(activeRentalKmBarTone(500, 1000)).toBe('success');
    expect(activeRentalKmBarTone(900, 1000)).toBe('watch');
    expect(activeRentalKmBarTone(1100, 1000)).toBe('critical');
  });

  it('fills bar by remaining percent', () => {
    expect(activeRentalKmBarFillPercent(250, 1000)).toBe(75);
    expect(activeRentalKmBarFillPercent(1100, 1000)).toBe(0);
  });

  it('formats rented till prefix with locale', () => {
    const text = activeRentalRentedTillText('2026-07-20T18:00:00.000Z', 'de');
    expect(text.startsWith('Gemietet bis:')).toBe(true);
    expect(activeRentalRentedTillText('2026-07-20T18:00:00.000Z', 'en').startsWith('Rented till:')).toBe(true);
  });
});
