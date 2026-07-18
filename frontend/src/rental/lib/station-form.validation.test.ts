import { describe, expect, it } from 'vitest';
import { defaultWeeklyHours } from './stationUtils';
import {
  formatStationTimezonePreview,
  hasStationFormAfterHoursKeyboxWarning,
  isValidIanaTimezone,
  validateStationForm,
} from './station-form.validation';

const t = (key: string) => key;

const validBase = {
  name: 'Test Station',
  address: 'Hauptstr. 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Deutschland',
  email: '',
  capacity: '',
  latitude: '52.52',
  longitude: '13.405',
  radiusMeters: 100,
  timezone: 'Europe/Berlin',
  pickupEnabled: true,
  returnEnabled: true,
  afterHoursReturnEnabled: false,
  keyBoxAvailable: false,
  openingHours: defaultWeeklyHours(),
};

describe('validateStationForm', () => {
  it('returns no errors for a valid form', () => {
    expect(validateStationForm(validBase, t)).toEqual({});
  });

  it('requires name and address fields', () => {
    const errors = validateStationForm({ ...validBase, name: '', address: '', city: '', postalCode: '', country: '' }, t);
    expect(errors.name).toBe('stations.form.errorName');
    expect(errors.address).toBe('stations.form.errorAddress');
    expect(errors.city).toBe('stations.form.errorLocation');
  });

  it('requires coordinates as a pair', () => {
    const errors = validateStationForm({ ...validBase, latitude: '52.5', longitude: '' }, t);
    expect(errors.coordinates).toBe('stations.form.errorCoordinatePair');
  });

  it('rejects invalid coordinate ranges', () => {
    const errors = validateStationForm({ ...validBase, latitude: '95', longitude: '13' }, t);
    expect(errors.coordinates).toBe('stations.form.errorCoordsRange');
  });

  it('allows empty coordinate pair', () => {
    const errors = validateStationForm({ ...validBase, latitude: '', longitude: '' }, t);
    expect(errors.coordinates).toBeUndefined();
  });

  it('blocks after-hours return without return enabled', () => {
    const errors = validateStationForm(
      { ...validBase, returnEnabled: false, afterHoursReturnEnabled: true },
      t,
    );
    expect(errors.afterHoursReturnEnabled).toBe('stations.form.errorAfterHoursRequiresReturn');
  });

  it('validates opening hours slot semantics', () => {
    const hours = defaultWeeklyHours();
    hours.monday = { open: '10:00', close: '10:00' };
    const errors = validateStationForm({ ...validBase, openingHours: hours }, t);
    expect(errors['openingHours.monday']).toBe('stations.form.errorHoursInvalidSlot');
  });

  it('rejects equal open and close times', () => {
    const hours = defaultWeeklyHours();
    hours.tuesday = { open: '10:00', close: '10:00' };
    const errors = validateStationForm({ ...validBase, openingHours: hours }, t);
    expect(errors['openingHours.tuesday']).toBe('stations.form.errorHoursInvalidSlot');
  });
});

describe('hasStationFormAfterHoursKeyboxWarning', () => {
  it('warns when after-hours is enabled without keybox', () => {
    expect(hasStationFormAfterHoursKeyboxWarning({ afterHoursReturnEnabled: true, keyBoxAvailable: false })).toBe(true);
    expect(hasStationFormAfterHoursKeyboxWarning({ afterHoursReturnEnabled: true, keyBoxAvailable: true })).toBe(false);
  });
});

describe('isValidIanaTimezone', () => {
  it('accepts Europe/Berlin and rejects garbage', () => {
    expect(isValidIanaTimezone('Europe/Berlin')).toBe(true);
    expect(isValidIanaTimezone('Not/A/Timezone')).toBe(false);
  });
});

describe('formatStationTimezonePreview', () => {
  it('returns a formatted preview for valid timezone', () => {
    const preview = formatStationTimezonePreview('Europe/Berlin');
    expect(preview).toBeTruthy();
  });
});
