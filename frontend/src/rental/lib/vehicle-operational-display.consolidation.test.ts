import { describe, expect, it } from 'vitest';
import {
  ALL_VEHICLE_OPERATIONAL_STATUSES,
  VEHICLE_OPERATIONAL_EDIT_STATUSES,
  formatVehicleOperationalEditStatusLabel,
  formatVehicleOperationalStatusLabel,
  formatVehicleOperationalStatusLabelFromRaw,
  mapCanonicalOperationalStatusToEditStatus,
  mapVehicleOperationalEditStatusToCanonical,
  normalizeVehicleOperationalStatusKey,
  operationalStatusIconName,
  operationalStatusToneFor,
  VEHICLE_OPERATIONAL_STATUS,
} from './vehicle-operational-state';

describe('vehicle operational display consolidation', () => {
  describe('canonical status matrix', () => {
    it.each(ALL_VEHICLE_OPERATIONAL_STATUSES)('defines label, tone, and icon for %s', (status) => {
      expect(formatVehicleOperationalStatusLabel(status, 'de').length).toBeGreaterThan(0);
      expect(formatVehicleOperationalStatusLabel(status, 'en').length).toBeGreaterThan(0);
      expect(operationalStatusToneFor(status)).toBeTruthy();
      expect(operationalStatusIconName(status).length).toBeGreaterThan(0);
    });

    it('UNKNOWN uses neutral tone — never success', () => {
      expect(operationalStatusToneFor(VEHICLE_OPERATIONAL_STATUS.UNKNOWN)).toBe('neutral');
      expect(operationalStatusToneFor(VEHICLE_OPERATIONAL_STATUS.UNKNOWN)).not.toBe('success');
    });

    it('BLOCKED and MAINTENANCE use distinct tones', () => {
      expect(operationalStatusToneFor(VEHICLE_OPERATIONAL_STATUS.BLOCKED)).toBe('critical');
      expect(operationalStatusToneFor(VEHICLE_OPERATIONAL_STATUS.MAINTENANCE)).toBe('warning');
    });
  });

  describe('invalid and unknown raw values', () => {
    it.each(['', '???', 'garbage-status', 'Unknown', null, undefined])(
      'normalizes %j to UNKNOWN presentation',
      (raw) => {
        const status = normalizeVehicleOperationalStatusKey(raw as string | null | undefined);
        expect(status).toBe(VEHICLE_OPERATIONAL_STATUS.UNKNOWN);
        expect(formatVehicleOperationalStatusLabelFromRaw(raw as string | null | undefined, {}, 'de')).toBe(
          'Status nicht verfügbar',
        );
        expect(operationalStatusToneFor(status)).toBe('neutral');
        expect(operationalStatusIconName(status)).toBe('alert-triangle');
      },
    );
  });

  describe('edit status mapping (header dropdown)', () => {
    it.each(VEHICLE_OPERATIONAL_EDIT_STATUSES)('round-trips edit token %s', (editStatus) => {
      const canonical = mapVehicleOperationalEditStatusToCanonical(editStatus);
      expect(mapCanonicalOperationalStatusToEditStatus(canonical)).toBe(editStatus);
      expect(formatVehicleOperationalEditStatusLabel(editStatus, 'en').length).toBeGreaterThan(0);
    });

    it('UNKNOWN maps to Manual Block edit token — not Available', () => {
      expect(mapCanonicalOperationalStatusToEditStatus(VEHICLE_OPERATIONAL_STATUS.UNKNOWN)).toBe(
        'Manual Block',
      );
    });

    it('RESERVED maps to Available edit baseline without implying ready-to-rent', () => {
      expect(mapCanonicalOperationalStatusToEditStatus(VEHICLE_OPERATIONAL_STATUS.RESERVED)).toBe(
        'Available',
      );
      expect(formatVehicleOperationalStatusLabel(VEHICLE_OPERATIONAL_STATUS.RESERVED, 'de')).toBe(
        'Reserviert',
      );
    });
  });

  describe('prisma token normalization', () => {
    it.each([
      ['AVAILABLE', VEHICLE_OPERATIONAL_STATUS.AVAILABLE],
      ['RENTED', VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED],
      ['RESERVED', VEHICLE_OPERATIONAL_STATUS.RESERVED],
      ['IN_SERVICE', VEHICLE_OPERATIONAL_STATUS.MAINTENANCE],
      ['OUT_OF_SERVICE', VEHICLE_OPERATIONAL_STATUS.BLOCKED],
    ] as const)('maps %s → %s with consistent presentation', (raw, expected) => {
      expect(normalizeVehicleOperationalStatusKey(raw)).toBe(expected);
      expect(operationalStatusToneFor(expected)).not.toBe('neutral');
    });
  });
});
