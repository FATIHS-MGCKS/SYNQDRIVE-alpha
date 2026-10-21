import {
  deriveCanonicalChargingStationEnrichmentCoordinate,
} from './derive-canonical-charging-station-enrichment-coordinate';
import {
  CHARGING_ENRICHMENT_MAX_RECHARGE_LOCATION_SPREAD_METERS,
  ERD_RECHARGE_END_LOCATION,
  ERD_RECHARGE_START_LOCATION,
} from './charging-station-enrichment.constants';

describe('deriveCanonicalChargingStationEnrichmentCoordinate (E6.3 C1–C10)', () => {
  it('C1: start valid only → START', () => {
    const result = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: 52.1,
      startLongitude: 13.4,
      endLatitude: null,
      endLongitude: null,
    });
    expect(result).toMatchObject({
      status: 'SELECTED',
      latitude: 52.1,
      longitude: 13.4,
      source: ERD_RECHARGE_START_LOCATION,
    });
  });

  it('C2: end valid only → END', () => {
    const result = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: null,
      startLongitude: null,
      endLatitude: 48.2,
      endLongitude: 11.5,
    });
    expect(result).toMatchObject({
      status: 'SELECTED',
      source: ERD_RECHARGE_END_LOCATION,
    });
  });

  it('C3: both valid within spread → START', () => {
    const result = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: 52.0,
      startLongitude: 13.0,
      endLatitude: 52.0003,
      endLongitude: 13.0003,
      maxSpreadMeters: CHARGING_ENRICHMENT_MAX_RECHARGE_LOCATION_SPREAD_METERS,
    });
    expect(result.status).toBe('SELECTED');
    if (result.status === 'SELECTED') {
      expect(result.source).toBe(ERD_RECHARGE_START_LOCATION);
    }
  });

  it('C4: both valid beyond threshold → INCONSISTENT_COORDINATES', () => {
    const result = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: 52.0,
      startLongitude: 13.0,
      endLatitude: 52.05,
      endLongitude: 13.05,
    });
    expect(result.status).toBe('INCONSISTENT_COORDINATES');
  });

  it('C5: no pair → NO_COORDINATES', () => {
    expect(
      deriveCanonicalChargingStationEnrichmentCoordinate({
        startLatitude: null,
        startLongitude: null,
        endLatitude: null,
        endLongitude: null,
      }).status,
    ).toBe('NO_COORDINATES');
  });

  it('C6/C7: partial pairs ignored', () => {
    expect(
      deriveCanonicalChargingStationEnrichmentCoordinate({
        startLatitude: 52,
        startLongitude: null,
        endLatitude: null,
        endLongitude: 13,
      }).status,
    ).toBe('NO_COORDINATES');
  });

  it('C8: non-finite rejected', () => {
    expect(
      deriveCanonicalChargingStationEnrichmentCoordinate({
        startLatitude: Number.NaN,
        startLongitude: 13,
        endLatitude: null,
        endLongitude: null,
      }).status,
    ).toBe('NO_COORDINATES');
  });

  it('C9: 0,0 valid numeric pair', () => {
    const result = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: 0,
      startLongitude: 0,
      endLatitude: null,
      endLongitude: null,
    });
    expect(result).toMatchObject({ status: 'SELECTED', latitude: 0, longitude: 0 });
  });

  it('C10: no midpoint generated (consistent both uses start only)', () => {
    const result = deriveCanonicalChargingStationEnrichmentCoordinate({
      startLatitude: 10,
      startLongitude: 10,
      endLatitude: 10.0001,
      endLongitude: 10.0001,
    });
    expect(result.status).toBe('SELECTED');
    if (result.status === 'SELECTED') {
      expect(result.latitude).toBe(10);
      expect(result.longitude).toBe(10);
    }
  });
});
