import { BadRequestException } from '@nestjs/common';
import {
  assertNoClientOrganizationOverride,
  assertPickupReturnCapabilitiesConsistent,
  assertValidCoordinatePair,
  assertValidOpeningHours,
  assertValidStationCapacity,
  assertValidStationCreateStatus,
  assertValidStationTimezone,
  StationCreateValidationCode,
  stripClientOrganizationId,
  validateStationCreatePayload,
} from './station-create-validation.util';

describe('station-create-validation.util', () => {
  describe('assertValidCoordinatePair', () => {
    it('allows both coordinates omitted', () => {
      expect(() => assertValidCoordinatePair(undefined, undefined)).not.toThrow();
      expect(() => assertValidCoordinatePair(null, null)).not.toThrow();
    });

    it('allows valid coordinate pair', () => {
      expect(() => assertValidCoordinatePair(52.52, 13.405)).not.toThrow();
    });

    it('rejects partial coordinate pair', () => {
      expect(() => assertValidCoordinatePair(52.5, null)).toThrow(BadRequestException);
      try {
        assertValidCoordinatePair(52.5, undefined);
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({
          code: StationCreateValidationCode.COORDINATE_PAIR_REQUIRED,
        });
      }
    });

    it('rejects out-of-range latitude and longitude', () => {
      expect(() => assertValidCoordinatePair(91, 10)).toThrow(BadRequestException);
      expect(() => assertValidCoordinatePair(10, 181)).toThrow(BadRequestException);
    });
  });

  describe('assertValidStationTimezone', () => {
    it('allows omitted timezone', () => {
      expect(() => assertValidStationTimezone(undefined)).not.toThrow();
    });

    it('accepts valid IANA timezone', () => {
      expect(() => assertValidStationTimezone('Europe/Berlin')).not.toThrow();
    });

    it('rejects invalid timezone', () => {
      expect(() => assertValidStationTimezone('Not/A_Timezone')).toThrow(BadRequestException);
    });
  });

  describe('assertValidStationCapacity', () => {
    it('allows null or omitted capacity', () => {
      expect(() => assertValidStationCapacity(null)).not.toThrow();
      expect(() => assertValidStationCapacity(undefined)).not.toThrow();
    });

    it('allows positive integers', () => {
      expect(() => assertValidStationCapacity(12)).not.toThrow();
    });

    it('rejects zero and negative capacity', () => {
      expect(() => assertValidStationCapacity(0)).toThrow(BadRequestException);
      expect(() => assertValidStationCapacity(-1)).toThrow(BadRequestException);
    });
  });

  describe('assertValidOpeningHours', () => {
    it('allows null and legacy text', () => {
      expect(() => assertValidOpeningHours(null)).not.toThrow();
      expect(() => assertValidOpeningHours('Mo-Fr 8-18')).not.toThrow();
      expect(() => assertValidOpeningHours({ legacyText: 'By appointment' })).not.toThrow();
    });

    it('accepts structured weekly hours', () => {
      expect(() =>
        assertValidOpeningHours({
          monday: { open: '08:00', close: '18:00' },
          sunday: { closed: true },
        }),
      ).not.toThrow();
    });

    it('accepts slot-based day hours', () => {
      expect(() =>
        assertValidOpeningHours({
          friday: {
            slots: [
              { open: '08:00', close: '12:00' },
              { open: '13:00', close: '17:00' },
            ],
          },
        }),
      ).not.toThrow();
    });

    it('rejects invalid day keys and malformed intervals', () => {
      expect(() => assertValidOpeningHours({ funday: { closed: true } })).toThrow(
        BadRequestException,
      );
      expect(() =>
        assertValidOpeningHours({ monday: { open: '18:00', close: '08:00' } }),
      ).toThrow(BadRequestException);
    });
  });

  describe('assertPickupReturnCapabilitiesConsistent', () => {
    it('allows active pickup-only station', () => {
      expect(() =>
        assertPickupReturnCapabilitiesConsistent({
          status: 'ACTIVE',
          pickupEnabled: true,
          returnEnabled: false,
        }),
      ).not.toThrow();
    });

    it('rejects after-hours return without returnEnabled', () => {
      expect(() =>
        assertPickupReturnCapabilitiesConsistent({
          returnEnabled: false,
          afterHoursReturnEnabled: true,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects capabilities on inactive create', () => {
      expect(() =>
        assertPickupReturnCapabilitiesConsistent({
          status: 'INACTIVE',
          pickupEnabled: true,
        }),
      ).toThrow(BadRequestException);
    });

    it('requires ACTIVE status when creating primary station', () => {
      expect(() =>
        assertPickupReturnCapabilitiesConsistent({
          isPrimary: true,
          status: 'INACTIVE',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('organization override protection', () => {
    it('rejects client organizationId in payload', () => {
      expect(() =>
        assertNoClientOrganizationOverride({ name: 'X', organizationId: 'other-org' }),
      ).toThrow(BadRequestException);
    });

    it('strips organizationId before persistence mapping', () => {
      expect(
        stripClientOrganizationId({
          name: 'Branch',
          organizationId: 'evil-org',
        }),
      ).toEqual({ name: 'Branch' });
    });
  });

  describe('assertValidStationCreateStatus', () => {
    it('allows ACTIVE and INACTIVE', () => {
      expect(() => assertValidStationCreateStatus('ACTIVE')).not.toThrow();
      expect(() => assertValidStationCreateStatus('INACTIVE')).not.toThrow();
    });

    it('rejects ARCHIVED on create', () => {
      expect(() => assertValidStationCreateStatus('ARCHIVED')).toThrow(BadRequestException);
    });
  });

  describe('validateStationCreatePayload', () => {
    it('accepts minimal valid payload', () => {
      expect(() =>
        validateStationCreatePayload({
          name: '  Depot  ',
        }),
      ).not.toThrow();
    });

    it('rejects empty name', () => {
      expect(() => validateStationCreatePayload({ name: '   ' })).toThrow(BadRequestException);
    });
  });
});
