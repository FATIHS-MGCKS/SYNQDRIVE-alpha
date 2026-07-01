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
