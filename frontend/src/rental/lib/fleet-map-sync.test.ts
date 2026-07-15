import { describe, expect, it } from 'vitest';
import { VEHICLE_OPERATIONAL_STATUS } from './vehicle-operational-state';
import {
  fleetStatusToOperatorTab,
  formatFleetMapRefreshAgo,
} from './fleet-map-sync';

describe('fleet-map-sync', () => {
  it('maps fleet status to operator tab', () => {
    expect(fleetStatusToOperatorTab('Available')).toBe(VEHICLE_OPERATIONAL_STATUS.AVAILABLE);
    expect(fleetStatusToOperatorTab('Active Rented')).toBe(
      VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
    );
    expect(fleetStatusToOperatorTab('Reserved')).toBe(VEHICLE_OPERATIONAL_STATUS.RESERVED);
    expect(fleetStatusToOperatorTab('Maintenance')).toBe(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE);
    expect(fleetStatusToOperatorTab('Unknown')).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
  });

  it('formats refresh ago labels', () => {
    const now = 1_000_000;
    expect(formatFleetMapRefreshAgo(null, now)).toBe('—');
    expect(formatFleetMapRefreshAgo(now - 3_000, now)).toBe('just now');
    expect(formatFleetMapRefreshAgo(now - 12_000, now)).toBe('12s ago');
    expect(formatFleetMapRefreshAgo(now - 90_000, now)).toBe('1m ago');
  });
});
