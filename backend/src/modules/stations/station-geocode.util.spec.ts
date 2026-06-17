import { resolveGeocodeCountryFilter } from './station-geocode.util';

describe('station-geocode.util', () => {
  it('defaults empty country to de', () => {
    expect(resolveGeocodeCountryFilter(null)).toBe('de');
    expect(resolveGeocodeCountryFilter('')).toBe('de');
  });

  it('maps DACH aliases', () => {
    expect(resolveGeocodeCountryFilter('Deutschland')).toBe('de');
    expect(resolveGeocodeCountryFilter('AT')).toBe('at');
    expect(resolveGeocodeCountryFilter('Schweiz')).toBe('ch');
  });

  it('uses ISO-2 for other countries', () => {
    expect(resolveGeocodeCountryFilter('fr')).toBe('fr');
    expect(resolveGeocodeCountryFilter('NL')).toBe('nl');
  });

  it('returns null for unknown country names (no wrong filter)', () => {
    expect(resolveGeocodeCountryFilter('France')).toBeNull();
    expect(resolveGeocodeCountryFilter('Türkei')).toBeNull();
  });
});
