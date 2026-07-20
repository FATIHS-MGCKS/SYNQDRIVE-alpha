import { describe, expect, it } from 'vitest';
import {
  FHS_HEALTH_BADGE_DE,
  formatVehiclePlateLabel,
} from './fleet-health-service-labels';

describe('fleet-health-service labels', () => {
  it('uses canonical health badge terminology', () => {
    expect(FHS_HEALTH_BADGE_DE.healthy.label).toBe('Technisch unauffällig');
    expect(FHS_HEALTH_BADGE_DE.review.label).toBe('Technisch prüfen');
    expect(FHS_HEALTH_BADGE_DE.blocked.label).toBe('Mietblockade');
    expect(FHS_HEALTH_BADGE_DE.limited.label).toBe('Nicht bewertbar');
    expect(FHS_HEALTH_BADGE_DE.action.label).toBe('Technisch blockiert');
  });

  it('never uses UUIDs as vehicle labels', () => {
    expect(
      formatVehiclePlateLabel({
        license: '',
        make: 'VW',
        model: 'Golf',
        year: 2022,
      }),
    ).toBe('VW Golf 2022');
    expect(formatVehiclePlateLabel(null)).toBe('Fahrzeug unbekannt');
    expect(formatVehiclePlateLabel({ license: '' })).toBe('Fahrzeug ohne Kennzeichen');
    expect(
      formatVehiclePlateLabel({
        license: '550e8400-e29b-41d4-a716-446655440000',
        make: 'VW',
        model: 'Golf',
        year: 2022,
      }),
    ).toBe('VW Golf 2022');
  });
});
