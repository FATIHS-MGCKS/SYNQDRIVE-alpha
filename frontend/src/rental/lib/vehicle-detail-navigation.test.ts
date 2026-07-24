import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VEHICLE_DETAIL_TAB,
  parseVehicleDetailFromUrl,
  vehicleDetailToSearchParams,
  normalizeVehicleDetailTab,
  VEHICLE_DETAIL_ID_PARAM,
  VEHICLE_DETAIL_TAB_PARAM,
  VEHICLE_DETAIL_TAB_PARAM_LEGACY,
} from './vehicle-detail-navigation';

describe('vehicle-detail-navigation', () => {
  it('parses vehicleId and tab from URL', () => {
    const parsed = parseVehicleDetailFromUrl(
      `?${VEHICLE_DETAIL_ID_PARAM}=veh-1&${VEHICLE_DETAIL_TAB_PARAM}=health-errors`,
    );
    expect(parsed).toEqual({ vehicleId: 'veh-1', tab: 'health-errors' });
  });

  it('defaults tab to overview when missing or invalid', () => {
    expect(parseVehicleDetailFromUrl(`?${VEHICLE_DETAIL_ID_PARAM}=veh-1`)).toEqual({
      vehicleId: 'veh-1',
      tab: DEFAULT_VEHICLE_DETAIL_TAB,
    });
    expect(
      parseVehicleDetailFromUrl(
        `?${VEHICLE_DETAIL_ID_PARAM}=veh-1&${VEHICLE_DETAIL_TAB_PARAM}=not-a-tab`,
      ),
    ).toEqual({
      vehicleId: 'veh-1',
      tab: DEFAULT_VEHICLE_DETAIL_TAB,
    });
  });

  it('supports legacy vehicleTab alias', () => {
    expect(
      parseVehicleDetailFromUrl(
        `?${VEHICLE_DETAIL_ID_PARAM}=veh-1&${VEHICLE_DETAIL_TAB_PARAM_LEGACY}=trips`,
      ),
    ).toEqual({
      vehicleId: 'veh-1',
      tab: 'trips',
    });
  });

  it('returns null without vehicleId', () => {
    expect(parseVehicleDetailFromUrl(`?${VEHICLE_DETAIL_TAB_PARAM}=trips`)).toBeNull();
    expect(parseVehicleDetailFromUrl('')).toBeNull();
  });

  it('round-trips through search params', () => {
    const params = vehicleDetailToSearchParams({
      vehicleId: 'veh-2',
      tab: 'vehicle-tasks',
    });
    expect(params.get(VEHICLE_DETAIL_ID_PARAM)).toBe('veh-2');
    expect(params.get(VEHICLE_DETAIL_TAB_PARAM)).toBe('vehicle-tasks');
    expect(parseVehicleDetailFromUrl(`?${params.toString()}`)).toEqual({
      vehicleId: 'veh-2',
      tab: 'vehicle-tasks',
    });
  });

  it('omits default tab from serialized params', () => {
    const params = vehicleDetailToSearchParams({
      vehicleId: 'veh-3',
      tab: 'overview',
    });
    expect(params.get(VEHICLE_DETAIL_TAB_PARAM)).toBeNull();
  });

  it('normalizes invalid tabs to overview', () => {
    expect(normalizeVehicleDetailTab('fleet')).toBe('overview');
    expect(normalizeVehicleDetailTab(null)).toBe('overview');
  });
});
