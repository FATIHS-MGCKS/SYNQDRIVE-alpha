import { isValidFuelStationCoordinateInput } from './fuel-station-coordinate.util';

describe('fuel-station-coordinate.util', () => {
  it('accepts valid coordinates', () => {
    expect(isValidFuelStationCoordinateInput({ latitude: 51.3, longitude: 9.4 })).toBe(true);
    expect(isValidFuelStationCoordinateInput({ latitude: -90, longitude: 180 })).toBe(true);
  });

  it('rejects invalid latitude', () => {
    expect(isValidFuelStationCoordinateInput({ latitude: 91, longitude: 9 })).toBe(false);
    expect(isValidFuelStationCoordinateInput({ latitude: -120, longitude: 9 })).toBe(false);
  });

  it('rejects invalid longitude', () => {
    expect(isValidFuelStationCoordinateInput({ latitude: 10, longitude: 181 })).toBe(false);
    expect(isValidFuelStationCoordinateInput({ latitude: 10, longitude: -200 })).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isValidFuelStationCoordinateInput({ latitude: Number.NaN, longitude: 1 })).toBe(false);
    expect(isValidFuelStationCoordinateInput({ latitude: 1, longitude: Number.POSITIVE_INFINITY })).toBe(false);
  });
});
