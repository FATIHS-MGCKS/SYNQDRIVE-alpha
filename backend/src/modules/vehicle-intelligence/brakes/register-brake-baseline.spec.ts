import {
  applyNewBrakeDefaults,
  hasRegistrationBrakeMeasurements,
  hasRegistrationBrakeSpecValues,
  normalizeRegistrationBrakeCondition,
  registrationBrakeMeasuredSnapshot,
  resolveRegistrationBrakeOdometerKm,
  shouldInitializeBrakesFromRegistration,
} from './register-brake-baseline';

describe('register-brake-baseline', () => {
  describe('normalizeRegistrationBrakeCondition', () => {
    it('maps NEW variants', () => {
      expect(normalizeRegistrationBrakeCondition('NEW')).toBe('NEW');
      expect(normalizeRegistrationBrakeCondition('new_delivered')).toBe('NEW');
    });

    it('defaults unknown values to UNKNOWN', () => {
      expect(normalizeRegistrationBrakeCondition(undefined)).toBe('UNKNOWN');
      expect(normalizeRegistrationBrakeCondition('foo')).toBe('UNKNOWN');
    });
  });

  describe('shouldInitializeBrakesFromRegistration', () => {
    it('initializes when condition is NEW', () => {
      expect(shouldInitializeBrakesFromRegistration({ condition: 'NEW' })).toBe(true);
    });

    it('initializes when measured baseline is present', () => {
      expect(
        shouldInitializeBrakesFromRegistration({ frontPadThickness: 9.5 }),
      ).toBe(true);
    });

    it('skips when no condition and no baseline', () => {
      expect(shouldInitializeBrakesFromRegistration({})).toBe(false);
    });
  });

  describe('applyNewBrakeDefaults', () => {
    it('applies nominal pad defaults for NEW without mm', () => {
      const result = applyNewBrakeDefaults({ condition: 'NEW' });
      expect(result.frontPadThickness).toBe(10);
      expect(result.rearPadThickness).toBe(10);
    });

    it('does not override user-provided pad thickness', () => {
      const result = applyNewBrakeDefaults({
        condition: 'NEW',
        frontPadThickness: 11.2,
      });
      expect(result.frontPadThickness).toBe(11.2);
    });
  });

  describe('resolveRegistrationBrakeOdometerKm', () => {
    it('prefers brakes odometer over registration mileage', () => {
      expect(
        resolveRegistrationBrakeOdometerKm({
          brakesOdometerKm: 1200,
          registrationMileageKm: 500,
          condition: 'USED',
        }),
      ).toBe(1200);
    });

    it('falls back to registration mileage', () => {
      expect(
        resolveRegistrationBrakeOdometerKm({
          registrationMileageKm: 8500,
          condition: 'USED',
        }),
      ).toBe(8500);
    });

    it('allows zero odometer for NEW vehicles', () => {
      expect(
        resolveRegistrationBrakeOdometerKm({
          condition: 'NEW',
        }),
      ).toBe(0);
    });
  });

  describe('registrationBrakeMeasuredSnapshot', () => {
    it('returns undefined when no user measurements were submitted', () => {
      expect(registrationBrakeMeasuredSnapshot({ condition: 'NEW' })).toBeUndefined();
    });

    it('maps pad and rotor width fields', () => {
      expect(
        registrationBrakeMeasuredSnapshot({
          frontPadThickness: 10,
          rearRotorWidth: 28,
        }),
      ).toEqual({
        frontPadMm: 10,
        rearDiscMm: 28,
      });
    });
  });

  describe('hasRegistrationBrakeSpecValues', () => {
    it('detects any numeric spec field', () => {
      expect(hasRegistrationBrakeSpecValues({ rearRotorDiameter: 300 })).toBe(true);
      expect(hasRegistrationBrakeMeasurements({ frontRotorDiameter: 300 })).toBe(false);
    });
  });
});
