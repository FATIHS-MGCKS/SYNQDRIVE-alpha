import { describe, expect, it } from 'vitest';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  formatVehicleOperationalStatusLabel,
  formatVehicleOperationalStatusLabelFromRaw,
  normalizeVehicleOperationalStatus,
  normalizeVehicleOperationalStatusKey,
  vehicleOperationalStatusMatchesTab,
} from './index';

describe('normalizeVehicleOperationalStatus', () => {
  it('maps legacy display strings to canonical enums', () => {
    expect(normalizeVehicleOperationalStatusKey('Available')).toBe(
      VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    );
    expect(normalizeVehicleOperationalStatusKey('Reserved')).toBe(
      VEHICLE_OPERATIONAL_STATUS.RESERVED,
    );
    expect(normalizeVehicleOperationalStatusKey('Active Rented')).toBe(
      VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
    );
    expect(normalizeVehicleOperationalStatusKey('Rented')).toBe(
      VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
    );
    expect(normalizeVehicleOperationalStatusKey('Maintenance')).toBe(
      VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
    );
    expect(normalizeVehicleOperationalStatusKey('Blocked')).toBe(
      VEHICLE_OPERATIONAL_STATUS.BLOCKED,
    );
  });

  it('maps prisma tokens to canonical enums', () => {
    expect(normalizeVehicleOperationalStatusKey('AVAILABLE')).toBe(
      VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
    );
    expect(normalizeVehicleOperationalStatusKey('RENTED')).toBe(
      VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
    );
    expect(normalizeVehicleOperationalStatusKey('RESERVED')).toBe(
      VEHICLE_OPERATIONAL_STATUS.RESERVED,
    );
    expect(normalizeVehicleOperationalStatusKey('IN_SERVICE')).toBe(
      VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
    );
  });

  it('maps unknown backend values to UNKNOWN — never AVAILABLE', () => {
    expect(normalizeVehicleOperationalStatusKey('')).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(normalizeVehicleOperationalStatusKey('???')).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(normalizeVehicleOperationalStatusKey('Unknown')).toBe(
      VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    );
    expect(normalizeVehicleOperationalStatusKey('garbage-status')).toBe(
      VEHICLE_OPERATIONAL_STATUS.UNKNOWN,
    );
  });

  it('fails closed on UNAVAILABLE data quality', () => {
    const result = normalizeVehicleOperationalStatus({
      status: 'Available',
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE,
    });
    expect(result.status).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
    expect(result.isUnknown).toBe(true);
    expect(result.isReliable).toBe(false);
  });

  it('fails closed on DEGRADED with explicit isReliable=false', () => {
    const result = normalizeVehicleOperationalStatus({
      status: 'Available',
      dataQualityState: VEHICLE_DATA_QUALITY_STATE.DEGRADED,
      isReliable: false,
    });
    expect(result.status).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
  });
});

describe('formatVehicleOperationalStatusLabel', () => {
  it('renders German labels from canonical enums', () => {
    expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, 'de')).toBe(
      'Verfügbar',
    );
    expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.RESERVED, 'de')).toBe(
      'Reserviert',
    );
    expect(
      formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED, 'de'),
    ).toBe('Aktiv vermietet');
    expect(
      formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE, 'de'),
    ).toBe('Wartung');
    expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.BLOCKED, 'de')).toBe(
      'Blockiert',
    );
    expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.UNKNOWN, 'de')).toBe(
      'Unbekannt',
    );
  });

  it('renders English labels when requested', () => {
    expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.AVAILABLE, 'en')).toBe(
      'Available',
    );
    expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.UNKNOWN, 'en')).toBe(
      'Unknown',
    );
  });

  it('formats labels from raw legacy strings via normalizer', () => {
    expect(formatVehicleOperationalStatusLabelFromRaw('Active Rented', {}, 'de')).toBe(
      'Aktiv vermietet',
    );
    expect(formatVehicleOperationalStatusLabelFromRaw('???', {}, 'de')).toBe('Unbekannt');
  });
});

describe('vehicleOperationalStatusMatchesTab', () => {
  it('never matches UNKNOWN to AVAILABLE tab', () => {
    expect(
      vehicleOperationalStatusMatchesTab('Unknown', VEHICLE_OPERATIONAL_STATUS.AVAILABLE),
    ).toBe(false);
    expect(
      vehicleOperationalStatusMatchesTab('???', VEHICLE_OPERATIONAL_STATUS.AVAILABLE),
    ).toBe(false);
  });

  it('buckets BLOCKED under maintenance tab', () => {
    expect(
      vehicleOperationalStatusMatchesTab('Blocked', VEHICLE_OPERATIONAL_STATUS.MAINTENANCE),
    ).toBe(true);
  });
});
