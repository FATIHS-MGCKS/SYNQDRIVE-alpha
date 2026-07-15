import { describe, expect, it } from 'vitest';
import {
  countFleetStatusTab,
  fleetStatusMatchesTab,
  isFleetReadyForRent,
  isFleetStatusAvailableTab,
  isFleetStatusUnknown,
  normalizeFleetOperationalStatus,
  normalizeFleetStatusKey,
} from './vehicle-status';

describe('normalizeFleetOperationalStatus', () => {
  it.each([
    ['Available', 'Available'],
    ['Active Rented', 'Active Rented'],
    ['Reserved', 'Reserved'],
    ['Maintenance', 'Maintenance'],
    ['RENTED', 'Active Rented'],
    ['RESERVED', 'Reserved'],
    ['IN_SERVICE', 'Maintenance'],
    ['OUT_OF_SERVICE', 'Maintenance'],
    ['AVAILABLE', 'Available'],
  ] as const)('maps known value %s → %s', (input, expected) => {
    expect(normalizeFleetStatusKey(input)).toBe(expected);
    expect(normalizeFleetOperationalStatus(input).isUnknown).toBe(false);
  });

  it('maps explicit Unknown token with isUnknown true', () => {
    const result = normalizeFleetOperationalStatus('Unknown');
    expect(result.status).toBe('Unknown');
    expect(result.isUnknown).toBe(true);
  });

  it('maps null to Unknown', () => {
    const result = normalizeFleetOperationalStatus(null);
    expect(result.status).toBe('Unknown');
    expect(result.isUnknown).toBe(true);
    expect(result.isReliable).toBe(false);
  });

  it('maps undefined to Unknown', () => {
    expect(normalizeFleetStatusKey(undefined)).toBe('Unknown');
  });

  it('maps empty string to Unknown', () => {
    expect(normalizeFleetStatusKey('')).toBe('Unknown');
    expect(normalizeFleetStatusKey('   ')).toBe('Unknown');
  });

  it('maps unexpected string to Unknown', () => {
    expect(normalizeFleetStatusKey('BROKEN_STATUS')).toBe('Unknown');
    expect(normalizeFleetStatusKey('ghost-rented')).toBe('Unknown');
  });

  it('forces Unknown when dataQualityState is UNAVAILABLE', () => {
    const result = normalizeFleetOperationalStatus({
      status: 'Available',
      dataQualityState: 'UNAVAILABLE',
    });
    expect(result.status).toBe('Unknown');
    expect(result.isReliable).toBe(false);
    expect(result.isUnknown).toBe(true);
  });

  it('forces Unknown when isReliable is false with DEGRADED quality', () => {
    const result = normalizeFleetOperationalStatus({
      status: 'Available',
      dataQualityState: 'DEGRADED',
      isReliable: false,
    });
    expect(result.status).toBe('Unknown');
    expect(result.isUnknown).toBe(true);
  });

  it('keeps Available when RELIABLE', () => {
    const result = normalizeFleetOperationalStatus({
      status: 'Available',
      dataQualityState: 'RELIABLE',
      isReliable: true,
    });
    expect(result.status).toBe('Available');
    expect(result.isReliable).toBe(true);
  });

  it('never falls back to Available for missing status', () => {
    expect(normalizeFleetStatusKey(null)).not.toBe('Available');
    expect(normalizeFleetStatusKey(undefined)).not.toBe('Available');
    expect(normalizeFleetStatusKey('')).not.toBe('Available');
  });
});

describe('fleet tab eligibility', () => {
  it('Unknown does not match Available tab', () => {
    expect(fleetStatusMatchesTab('Unknown', 'Available')).toBe(false);
    expect(fleetStatusMatchesTab(null, 'Available')).toBe(false);
    expect(isFleetStatusAvailableTab('Unknown')).toBe(false);
    expect(isFleetReadyForRent('Unknown')).toBe(false);
  });

  it('Available matches Available tab only when explicit', () => {
    expect(fleetStatusMatchesTab('Available', 'Available')).toBe(true);
    expect(isFleetReadyForRent('Available')).toBe(true);
  });

  it('countFleetStatusTab excludes Unknown from Available', () => {
    const vehicles = [
      { status: 'Available' },
      { status: 'Unknown' },
      { status: null },
      { status: 'Reserved' },
    ];
    expect(countFleetStatusTab(vehicles, 'Available')).toBe(1);
    expect(countFleetStatusTab(vehicles, 'Reserved')).toBe(1);
  });

  it('isFleetStatusUnknown detects unknown inputs', () => {
    expect(isFleetStatusUnknown('Unknown')).toBe(true);
    expect(isFleetStatusUnknown(null)).toBe(true);
    expect(isFleetStatusUnknown('Available')).toBe(false);
  });
});
