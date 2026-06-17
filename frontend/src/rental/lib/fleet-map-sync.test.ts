import { describe, expect, it } from 'vitest';
import {
  fleetStatusToOperatorTab,
  formatFleetMapRefreshAgo,
} from './fleet-map-sync';

describe('fleet-map-sync', () => {
  it('maps fleet status to operator tab', () => {
    expect(fleetStatusToOperatorTab('Available')).toBe('Available');
    expect(fleetStatusToOperatorTab('Active Rented')).toBe('Active Rented');
    expect(fleetStatusToOperatorTab('Reserved')).toBe('Reserved');
    expect(fleetStatusToOperatorTab('Maintenance')).toBe('Maintenance');
    expect(fleetStatusToOperatorTab('Unknown')).toBe('Available');
  });

  it('formats refresh ago labels', () => {
    const now = 1_000_000;
    expect(formatFleetMapRefreshAgo(null, now)).toBe('—');
    expect(formatFleetMapRefreshAgo(now - 3_000, now)).toBe('just now');
    expect(formatFleetMapRefreshAgo(now - 12_000, now)).toBe('12s ago');
    expect(formatFleetMapRefreshAgo(now - 90_000, now)).toBe('1m ago');
  });
});
