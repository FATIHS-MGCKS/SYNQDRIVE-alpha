// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  resolveVehicleDetailPollingGates,
  VEHICLE_DETAIL_POLLING,
} from './vehicle-detail-polling-policy';

const BASE = {
  vehicleId: 'veh-1',
  orgId: 'org-1',
  isVehicleDetailOpen: true,
  isOverviewTab: true,
  isOverviewMapVisible: true,
  isDocumentVisible: true,
  isOnline: true,
  canReadFleet: true,
  accessBlockReason: null,
} as const;

describe('vehicle-detail-polling-policy', () => {
  it('enables high-frequency GPS only on visible Overview map surface', () => {
    const active = resolveVehicleDetailPollingGates(BASE);
    expect(active.gpsHighFrequency).toBe(true);
    expect(active.dashboardIntervalMs).toBe(VEHICLE_DETAIL_POLLING.DASHBOARD_OVERVIEW_MS);

    const otherTab = resolveVehicleDetailPollingGates({
      ...BASE,
      isOverviewTab: false,
    });
    expect(otherTab.gpsHighFrequency).toBe(false);
    expect(otherTab.dashboardTelemetry).toBe(true);
    expect(otherTab.dashboardIntervalMs).toBe(VEHICLE_DETAIL_POLLING.DASHBOARD_OTHER_TAB_MS);
  });

  it('pauses all telemetry when document is hidden', () => {
    const hidden = resolveVehicleDetailPollingGates({
      ...BASE,
      isDocumentVisible: false,
    });
    expect(hidden.gpsHighFrequency).toBe(false);
    expect(hidden.dashboardTelemetry).toBe(false);
    expect(hidden.deviceConnection).toBe(false);
    expect(hidden.batteryLive).toBe(false);
  });

  it('pauses when offline, permission missing, or data authorization blocked', () => {
    expect(
      resolveVehicleDetailPollingGates({ ...BASE, isOnline: false }).dashboardTelemetry,
    ).toBe(false);
    expect(
      resolveVehicleDetailPollingGates({ ...BASE, canReadFleet: false }).gpsHighFrequency,
    ).toBe(false);
    expect(
      resolveVehicleDetailPollingGates({
        ...BASE,
        accessBlockReason: 'data_authorization',
      }).dashboardTelemetry,
    ).toBe(false);
  });

  it('pauses overview surface polling when map is not visible', () => {
    const gates = resolveVehicleDetailPollingGates({
      ...BASE,
      isOverviewMapVisible: false,
    });
    expect(gates.gpsHighFrequency).toBe(false);
    expect(gates.deviceConnection).toBe(false);
    expect(gates.batteryLive).toBe(false);
    expect(gates.dashboardTelemetry).toBe(true);
  });
});
