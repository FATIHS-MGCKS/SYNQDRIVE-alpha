import { describe, expect, it } from 'vitest';
import {
  buildCardogIconName,
  CARDOG_UNSUPPORTED_BRAND_KEYS,
  getBrandFromModel,
  resolveSynqDriveBrandKey,
} from './BrandLogo';

describe('getBrandFromModel', () => {
  it('returns generic for empty sources', () => {
    expect(getBrandFromModel(null)).toBe('generic');
    expect(getBrandFromModel(undefined)).toBe('generic');
    expect(getBrandFromModel('')).toBe('generic');
    expect(getBrandFromModel({ make: '', model: '' })).toBe('generic');
  });

  it('detects make from fleet API object', () => {
    expect(getBrandFromModel({ make: 'BMW', model: '320d' })).toBe('bmw');
    expect(getBrandFromModel({ make: 'Mercedes-Benz', model: 'C 220' })).toBe('mercedes-benz');
    expect(getBrandFromModel({ make: 'Volkswagen', model: 'Golf' })).toBe('volkswagen');
  });

  it('detects brands from free-text strings', () => {
    expect(getBrandFromModel('VW Golf 8')).toBe('volkswagen');
    expect(getBrandFromModel('Land Rover Defender')).toBe('land-rover');
    expect(getBrandFromModel('Alfa Romeo Giulia')).toBe('alfa-romeo');
    expect(getBrandFromModel('Rolls-Royce Ghost')).toBe('rolls-royce');
    expect(getBrandFromModel('Škoda Octavia')).toBe('skoda');
    expect(getBrandFromModel('Citroën C3')).toBe('citroen');
  });

  it('detects extended Cardog-supported brands', () => {
    expect(getBrandFromModel('Ferrari Roma')).toBe('ferrari');
    expect(getBrandFromModel('Polestar 2')).toBe('polestar');
    expect(getBrandFromModel('Rivian R1T')).toBe('rivian');
    expect(getBrandFromModel('BYD Atto 3')).toBe('byd');
  });

  it('returns generic for unknown makes', () => {
    expect(getBrandFromModel('Dacia Sandero')).toBe('generic');
    expect(getBrandFromModel({ make: 'Unknown', model: 'Car' })).toBe('generic');
  });
});

describe('resolveSynqDriveBrandKey', () => {
  it('normalizes aliases to stable SynqDrive keys', () => {
    expect(resolveSynqDriveBrandKey('vw')).toBe('volkswagen');
    expect(resolveSynqDriveBrandKey('Mercedes')).toBe('mercedes-benz');
    expect(resolveSynqDriveBrandKey('benz')).toBe('mercedes-benz');
    expect(resolveSynqDriveBrandKey('land rover')).toBe('land-rover');
    expect(resolveSynqDriveBrandKey('rolls royce')).toBe('rolls-royce');
  });

  it('passes through known SynqDrive keys', () => {
    expect(resolveSynqDriveBrandKey('bmw')).toBe('bmw');
    expect(resolveSynqDriveBrandKey('mercedes-benz')).toBe('mercedes-benz');
  });

  it('maps unsupported brands without Cardog icons', () => {
    for (const key of CARDOG_UNSUPPORTED_BRAND_KEYS) {
      expect(resolveSynqDriveBrandKey(key)).toBe(key);
    }
  });
});

describe('buildCardogIconName', () => {
  it('builds color and dark icon names', () => {
    expect(buildCardogIconName('bmw', 'icon', false)).toBe('BMWIcon');
    expect(buildCardogIconName('bmw', 'icon', true)).toBe('BMWIconDark');
    expect(buildCardogIconName('mercedes-benz', 'logo', false)).toBe('MBLogo');
    expect(buildCardogIconName('land-rover', 'logoHorizontal', true)).toBe('LandroverLogoHorizontalDark');
  });

  it('returns null for unsupported brands', () => {
    expect(buildCardogIconName('skoda', 'icon', false)).toBeNull();
    expect(buildCardogIconName('generic', 'icon', false)).toBeNull();
  });
});

describe('Cardog acceptance matrix (resolver + icon names)', () => {
  const cardogBrands = [
    { label: 'BMW', source: { make: 'BMW', model: '320d' }, key: 'bmw', icon: 'BMWIcon', iconDark: 'BMWIconDark' },
    { label: 'Audi', source: { make: 'Audi', model: 'A4' }, key: 'audi', icon: 'AudiIcon', iconDark: 'AudiIconDark' },
    { label: 'Volkswagen', source: 'VW Golf 8', key: 'volkswagen', icon: 'VolkswagenIcon', iconDark: 'VolkswagenIconDark' },
    { label: 'Mercedes-Benz', source: { make: 'Mercedes-Benz', model: 'C 220' }, key: 'mercedes-benz', icon: 'MBIcon', iconDark: 'MBIconDark' },
    { label: 'Tesla', source: { make: 'Tesla', model: 'Model 3' }, key: 'tesla', icon: 'TeslaIcon', iconDark: 'TeslaIconDark' },
  ] as const;

  it.each(cardogBrands)('resolves $label for light and dark Cardog icons', ({ source, key, icon, iconDark }) => {
    expect(getBrandFromModel(source)).toBe(key);
    expect(buildCardogIconName(key, 'icon', false)).toBe(icon);
    expect(buildCardogIconName(key, 'icon', true)).toBe(iconDark);
  });

  it('uses fallback path for unsupported Škoda', () => {
    expect(getBrandFromModel({ make: 'Škoda', model: 'Octavia' })).toBe('skoda');
    expect(buildCardogIconName('skoda', 'icon', false)).toBeNull();
    expect(buildCardogIconName('skoda', 'icon', true)).toBeNull();
  });

  it('uses fallback path for unknown Dacia', () => {
    expect(getBrandFromModel({ make: 'Dacia', model: 'Sandero' })).toBe('generic');
    expect(buildCardogIconName('generic', 'icon', false)).toBeNull();
  });

  it('detects brand from model-only string when make is missing', () => {
    expect(getBrandFromModel({ make: '', model: 'BMW 320d' })).toBe('bmw');
    expect(getBrandFromModel({ make: null, model: 'Tesla Model Y' })).toBe('tesla');
  });

  it('detects brand from make + model object', () => {
    expect(getBrandFromModel({ make: 'Audi', model: 'Q5' })).toBe('audi');
    expect(getBrandFromModel({ make: 'Volkswagen', model: 'Tiguan' })).toBe('volkswagen');
  });
});
