import { describe, expect, it } from 'vitest';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import { VEHICLE_DETAIL_I18N_KEYS } from './vehicle-detail-i18n';

describe('vehicle-detail-i18n keys', () => {
  it('defines every vehicleDetail key in English and German catalogs', () => {
    for (const key of VEHICLE_DETAIL_I18N_KEYS) {
      expect(en[key], `missing en key: ${key}`).toBeTruthy();
      expect(de[key], `missing de key: ${key}`).toBeTruthy();
    }
  });

  it('uses canonical telemetry labels consistently', () => {
    expect(en['vehicleDetail.telemetry.live']).toBe(en['fleetConnectivity.lastData.live']);
    expect(en['vehicleDetail.telemetry.standby']).toBe(en['fleetConnectivity.kpi.standby']);
    expect(en['vehicleDetail.telemetry.offline']).toBe(en['fleetConnectivity.state.OFFLINE']);
    expect(de['vehicleDetail.telemetry.offline']).toBe(de['fleetConnectivity.state.OFFLINE']);
  });

  it('uses shared cleaning status keys', () => {
    expect(en['status.clean']).toBeTruthy();
    expect(de['status.clean']).toBeTruthy();
    expect(en['status.needsCleaning']).toBeTruthy();
    expect(de['status.needsCleaning']).toBeTruthy();
  });
});
