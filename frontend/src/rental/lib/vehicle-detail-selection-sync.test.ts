import { describe, expect, it } from 'vitest';
import { buildBaselineVehicleData } from './vehicle-detail-baseline.fixtures';
import { VEHICLE_OPERATIONAL_STATUS } from '../lib/vehicle-operational-state';
import {
  deriveSelectedVehicleFromFleet,
  deriveVehicleDetailHeaderDraft,
  mergeVehicleDetailHeaderDraft,
  shouldClearVehicleDetailSelectionOnOrgChange,
  shouldHandleSelectedVehicleUnavailable,
} from './vehicle-detail-selection-sync';

const VEHICLE_A = buildBaselineVehicleData({
  id: 'veh-a',
  license: 'AA-100',
  station: 'Kassel',
  model: 'Golf',
  status: VEHICLE_OPERATIONAL_STATUS.AVAILABLE,
  cleaningStatus: 'Clean',
  odometer: 10_000,
  fuel: 70,
});

const VEHICLE_B = buildBaselineVehicleData({
  id: 'veh-b',
  license: 'BB-200',
  station: 'Berlin',
  model: 'ID.4',
  status: VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED,
  cleaningStatus: 'Needs Cleaning',
  odometer: 20_000,
  fuel: 40,
});

describe('vehicle-detail-selection-sync', () => {
  describe('deriveSelectedVehicleFromFleet', () => {
    it('returns null without a selected id', () => {
      expect(deriveSelectedVehicleFromFleet([VEHICLE_A], null)).toBeNull();
      expect(deriveSelectedVehicleFromFleet([VEHICLE_A], undefined)).toBeNull();
    });

    it('returns the fleet row for the bound id', () => {
      expect(deriveSelectedVehicleFromFleet([VEHICLE_A, VEHICLE_B], 'veh-b')).toEqual(
        VEHICLE_B,
      );
    });

    it('returns null when the vehicle is missing from the fleet query', () => {
      expect(deriveSelectedVehicleFromFleet([VEHICLE_A], 'veh-deleted')).toBeNull();
    });
  });

  describe('fleet refetch metadata sync', () => {
    it('reflects license change after query refetch', () => {
      const refetched = [{ ...VEHICLE_A, license: 'AA-999' }];
      expect(deriveSelectedVehicleFromFleet(refetched, 'veh-a')?.license).toBe('AA-999');
    });

    it('reflects station change after query refetch', () => {
      const refetched = [{ ...VEHICLE_A, station: 'Frankfurt' }];
      expect(deriveSelectedVehicleFromFleet(refetched, 'veh-a')?.station).toBe('Frankfurt');
    });

    it('reflects status change after query refetch', () => {
      const refetched = [
        { ...VEHICLE_A, status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE },
      ];
      expect(deriveSelectedVehicleFromFleet(refetched, 'veh-a')?.status).toBe(
        VEHICLE_OPERATIONAL_STATUS.MAINTENANCE,
      );
    });

    it('reflects cleaning change after query refetch', () => {
      const refetched = [{ ...VEHICLE_A, cleaningStatus: 'Needs Cleaning' as const }];
      expect(deriveSelectedVehicleFromFleet(refetched, 'veh-a')?.cleaningStatus).toBe(
        'Needs Cleaning',
      );
    });

    it('reflects model/metadata change after query refetch', () => {
      const refetched = [{ ...VEHICLE_A, model: 'Passat', year: 2025, odometer: 11_500 }];
      const row = deriveSelectedVehicleFromFleet(refetched, 'veh-a');
      expect(row?.model).toBe('Passat');
      expect(row?.year).toBe(2025);
      expect(row?.odometer).toBe(11_500);
    });

    it('does not bleed data from a previously selected vehicle after switch', () => {
      const fleet = [VEHICLE_A, VEHICLE_B];
      expect(deriveSelectedVehicleFromFleet(fleet, 'veh-b')?.license).toBe('BB-200');
      expect(deriveSelectedVehicleFromFleet(fleet, 'veh-b')?.license).not.toBe('AA-100');
    });
  });

  describe('header draft sync', () => {
    it('derives operational and cleaning header values from fleet row', () => {
      const draft = deriveVehicleDetailHeaderDraft(VEHICLE_B);
      expect(draft.station).toBe('Berlin');
      expect(draft.cleaningStatus).toBe('Needs Cleaning');
    });

    it('skips busy mutation fields when merging header draft', () => {
      const merged = mergeVehicleDetailHeaderDraft(
        { ...VEHICLE_A, status: VEHICLE_OPERATIONAL_STATUS.MAINTENANCE },
        { vehicleStatusBusy: true, cleaningStatusBusy: false },
      );
      expect(merged.operationalStatus).toBeUndefined();
      expect(merged.cleaningStatus).toBe('Clean');
      expect(merged.station).toBe('Kassel');
    });
  });

  describe('deleted / inaccessible vehicle', () => {
    it('detects missing vehicle after fleet query completes', () => {
      expect(
        shouldHandleSelectedVehicleUnavailable({
          selectedVehicleId: 'veh-deleted',
          fleetVehicles: [VEHICLE_A],
          fleetLoading: false,
          fleetLastFetchedAt: Date.now(),
        }),
      ).toBe(true);
    });

    it('waits for fleet query before treating vehicle as deleted', () => {
      expect(
        shouldHandleSelectedVehicleUnavailable({
          selectedVehicleId: 'veh-deleted',
          fleetVehicles: [],
          fleetLoading: true,
          fleetLastFetchedAt: null,
        }),
      ).toBe(false);
    });
  });

  describe('organisation change', () => {
    it('clears selection when org id changes', () => {
      expect(shouldClearVehicleDetailSelectionOnOrgChange('org-1', 'org-2')).toBe(true);
    });

    it('keeps selection when org id is unchanged', () => {
      expect(shouldClearVehicleDetailSelectionOnOrgChange('org-1', 'org-1')).toBe(false);
    });

    it('clears selection when org becomes empty', () => {
      expect(shouldClearVehicleDetailSelectionOnOrgChange('org-1', '')).toBe(true);
    });
  });
});
