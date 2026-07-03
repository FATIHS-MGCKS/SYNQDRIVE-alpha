import { describe, expect, it } from 'vitest';
import type { EnergyEvent } from '../../../lib/api';
import {
  formatEnergyEventLocationForDisplay,
  resolveEnergyEventLocationLabel,
  shouldHideEnergyEventCoordinates,
} from './energy-event-location';

function makeEvent(overrides: Partial<EnergyEvent> = {}): EnergyEvent {
  return {
    id: 'evt-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'seg-1',
    kind: 'REFUEL',
    detectionMechanism: 'refuel',
    startTime: '2026-07-01T10:00:00.000Z',
    endTime: '2026-07-01T10:20:00.000Z',
    durationSeconds: 1200,
    startLatitude: 51.335,
    startLongitude: 9.506,
    endLatitude: 51.335,
    endLongitude: 9.506,
    fuelDeltaLiters: 26,
    fuelDeltaPercent: null,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 5030,
    odometerEndKm: 5035,
    confidence: 'HIGH',
    locationDisplayName: null,
    locationSource: null,
    locationConfidence: null,
    ...overrides,
  };
}

describe('energy-event-location', () => {
  it('shows Aral Kassel for REFUEL with locationDisplayName', () => {
    const label = resolveEnergyEventLocationLabel(
      makeEvent({ kind: 'REFUEL', locationDisplayName: 'Aral Kassel' }),
    );
    expect(label).toBe('Aral Kassel');
  });

  it('shows Tesla Supercharger Kassel for RECHARGE with locationDisplayName', () => {
    const label = resolveEnergyEventLocationLabel(
      makeEvent({
        kind: 'RECHARGE',
        locationDisplayName: 'Tesla Supercharger Kassel',
      }),
    );
    expect(label).toBe('Tesla Supercharger Kassel');
  });

  it('shows address fallback when only address is present', () => {
    const label = resolveEnergyEventLocationLabel(
      makeEvent({ address: 'Wilhelmshöher Allee 241, Kassel' }),
    );
    expect(label).toBe('Wilhelmshöher Allee 241, Kassel');
  });

  it('shows Standort nicht erkannt when no location label exists', () => {
    const label = formatEnergyEventLocationForDisplay(makeEvent());
    expect(label).toBe('Standort nicht erkannt');
  });

  it('hides coordinates when locationDisplayName is present', () => {
    expect(
      shouldHideEnergyEventCoordinates(
        makeEvent({ locationDisplayName: 'Shell Kassel' }),
      ),
    ).toBe(true);
  });

  it('does not format coordinates into the primary location label', () => {
    const label = formatEnergyEventLocationForDisplay(makeEvent());
    expect(label).not.toContain('51.335');
    expect(label).not.toContain('9.506');
  });
});
