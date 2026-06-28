import { describe, expect, it } from 'vitest';
import type { FleetConnectivityVehicle } from '../../../../lib/api';
import {
  FORBIDDEN_FLEET_CONNECTIVITY_ACTIONS,
  filterFleetConnectivityVehicles,
  jammingSnapshotSummary,
  maskedIdentity,
  obdPlugDisplay,
  vehicleSearchHaystack,
} from './fleet-connectivity.utils';

function vehicle(
  partial: Partial<FleetConnectivityVehicle> & Pick<FleetConnectivityVehicle, 'vehicleId'>,
): FleetConnectivityVehicle {
  return {
    vehicleId: partial.vehicleId,
    vin: partial.vin ?? 'VIN1',
    licensePlate: partial.licensePlate ?? null,
    make: partial.make ?? 'VW',
    model: partial.model ?? 'Golf',
    year: partial.year ?? 2022,
    station: partial.station ?? null,
    connectionType: partial.connectionType ?? 'DIMO',
    sourceType: partial.sourceType ?? null,
    provider: partial.provider ?? 'DIMO',
    connectionStatus: partial.connectionStatus ?? 'online',
    statusNote: partial.statusNote ?? '',
    online: partial.online ?? true,
    lastSeenAt: partial.lastSeenAt ?? null,
    lastSyncedAt: partial.lastSyncedAt ?? null,
    freshnessLabel: partial.freshnessLabel ?? 'Live',
    pairedAt: partial.pairedAt ?? null,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    odometerKm: partial.odometerKm ?? null,
    hasTelemetry: partial.hasTelemetry ?? true,
    obdIsPluggedIn: partial.obdIsPluggedIn ?? null,
    jammingDetectedCount: partial.jammingDetectedCount ?? 0,
    jammingSnapshotNote: partial.jammingSnapshotNote ?? null,
    jammingIncidents: partial.jammingIncidents ?? [],
    maskedDeviceSerial: partial.maskedDeviceSerial ?? null,
    maskedDimoTokenId: partial.maskedDimoTokenId ?? null,
    maskedSyntheticTokenId: partial.maskedSyntheticTokenId ?? null,
    readinessScore: partial.readinessScore ?? 0,
    readinessLevel: partial.readinessLevel ?? 'no_data',
    signalCoveragePercent: partial.signalCoveragePercent ?? 0,
    signals: partial.signals ?? {
      gps: 'unknown',
      odometer: 'unknown',
      speed: 'unknown',
      fuel: 'unknown',
      evSoc: 'unknown',
      dtc: 'unknown',
      obdPlug: 'unknown',
      jamming: 'unknown',
    },
    deviceSerial: partial.deviceSerial ?? null,
    dimoTokenId: partial.dimoTokenId ?? null,
    syntheticTokenId: partial.syntheticTokenId ?? null,
    deviceConnection: partial.deviceConnection ?? null,
  };
}

describe('fleet-connectivity.utils', () => {
  describe('obdPlugDisplay', () => {
    it('shows NOT plugged in when obdIsPluggedIn is false', () => {
      const result = obdPlugDisplay(false);
      expect(result.text).toBe('OBD Device NOT plugged in');
      expect(result.text).not.toContain('Plugged IN');
    });

    it('shows plugged in only when true', () => {
      expect(obdPlugDisplay(true).text).toBe('OBD Device Plugged IN');
    });

    it('shows no snapshot data when null', () => {
      expect(obdPlugDisplay(null).text).toContain('no snapshot data');
    });
  });

  describe('jammingSnapshotSummary', () => {
    it('labels positive count as latest snapshot indication', () => {
      expect(jammingSnapshotSummary(2, 'available')).toContain('latest telemetry snapshot');
    });

    it('does not imply history when count is zero but signal known', () => {
      expect(jammingSnapshotSummary(0, 'missing')).toBe(
        'No jamming indication in latest snapshot',
      );
    });
  });

  describe('maskedIdentity', () => {
    it('returns masked value or em dash', () => {
      expect(maskedIdentity('123…789')).toBe('123…789');
      expect(maskedIdentity(null)).toBe('—');
    });
  });

  describe('filterFleetConnectivityVehicles', () => {
    const vehicles = [
      vehicle({
        vehicleId: '1',
        connectionStatus: 'online',
        obdIsPluggedIn: false,
        jammingDetectedCount: 1,
        signals: {
          gps: 'missing',
          odometer: 'available',
          speed: 'unknown',
          fuel: 'unknown',
          evSoc: 'unknown',
          dtc: 'unknown',
          obdPlug: 'missing',
          jamming: 'available',
        },
      }),
      vehicle({ vehicleId: '2', connectionStatus: 'not_connected' }),
    ];

    it('filters by OBD unplugged snapshot', () => {
      const result = filterFleetConnectivityVehicles(vehicles, {
        search: '',
        statusFilter: 'all',
        readinessFilter: 'all',
        signalFilter: 'obd_unplugged',
      });
      expect(result).toHaveLength(1);
      expect(result[0].vehicleId).toBe('1');
    });

    it('filters webhook unplugged separately from snapshot OBD', () => {
      const webhookUnplugged = vehicle({
        vehicleId: '4',
        obdIsPluggedIn: true,
        deviceConnection: {
          eventSource: 'dimo_webhook',
          openUnpluggedEpisode: true,
          currentDeviceConnectionStatus: 'unplugged',
          lastDeviceUnpluggedAt: '2026-06-28T10:00:00.000Z',
          lastDevicePluggedInAt: null,
          openUnpluggedSince: '2026-06-28T10:00:00.000Z',
          openUnpluggedDurationMs: 3600000,
          severity: 'warning',
          rentalRelevant: false,
          duringActiveBooking: false,
        },
      });
      const rows = [...vehicles, webhookUnplugged];
      const snapshotOnly = filterFleetConnectivityVehicles(rows, {
        search: '',
        statusFilter: 'all',
        readinessFilter: 'all',
        signalFilter: 'obd_unplugged',
      });
      const webhookOnly = filterFleetConnectivityVehicles(rows, {
        search: '',
        statusFilter: 'all',
        readinessFilter: 'all',
        signalFilter: 'device_unplugged_webhook',
      });
      expect(snapshotOnly.some((v) => v.vehicleId === '4')).toBe(false);
      expect(webhookOnly).toHaveLength(1);
      expect(webhookOnly[0].vehicleId).toBe('4');
    });

    it('filters by jamming snapshot', () => {
      const result = filterFleetConnectivityVehicles(vehicles, {
        search: '',
        statusFilter: 'all',
        readinessFilter: 'all',
        signalFilter: 'jamming',
      });
      expect(result).toHaveLength(1);
    });

    it('searches masked serial in haystack', () => {
      const withSerial = vehicle({
        vehicleId: '3',
        maskedDeviceSerial: 'SN…99',
      });
      expect(vehicleSearchHaystack(withSerial)).toContain('sn…99');
    });
  });

  describe('read-only guardrail', () => {
    it('documents forbidden write actions for this surface', () => {
      expect(FORBIDDEN_FLEET_CONNECTIVITY_ACTIONS).toEqual(
        expect.arrayContaining(['connect', 'sync', 'unlink', 'remap']),
      );
    });
  });
});
