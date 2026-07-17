import {
  resolveAssignVehiclePermission,
  resolveUpdateStationPermissions,
  resolveVehicleLocationMutationPermissions,
} from './stations-mutation-permission.util';

describe('stations-mutation-permission.util', () => {
  describe('resolveUpdateStationPermissions', () => {
    it('maps master data fields to stations.update_master_data', () => {
      expect(resolveUpdateStationPermissions({ name: 'Berlin HQ' })).toEqual([
        'stations.update_master_data',
      ]);
    });

    it('maps operations fields to stations.manage_operations', () => {
      expect(resolveUpdateStationPermissions({ capacity: 12 })).toEqual([
        'stations.manage_operations',
      ]);
    });

    it('maps team fields to stations.manage_team', () => {
      expect(resolveUpdateStationPermissions({ managerName: 'Alex' })).toEqual([
        'stations.manage_team',
      ]);
    });

    it('returns multiple permissions for mixed allowed patches', () => {
      expect(
        resolveUpdateStationPermissions({
          name: 'Updated',
          capacity: 8,
          managerName: 'Sam',
        }),
      ).toEqual(
        expect.arrayContaining([
          'stations.update_master_data',
          'stations.manage_operations',
          'stations.manage_team',
        ]),
      );
    });

    it('does not map lifecycle or primary fields (rejected before permission check)', () => {
      expect(resolveUpdateStationPermissions({ status: 'INACTIVE' })).toEqual([]);
      expect(resolveUpdateStationPermissions({ isPrimary: true })).toEqual([]);
    });

    it('ignores undefined fields', () => {
      expect(resolveUpdateStationPermissions({ name: undefined })).toEqual([]);
    });
  });

  describe('resolveAssignVehiclePermission', () => {
    it('defaults to home fleet permission', () => {
      expect(resolveAssignVehiclePermission(undefined)).toBe('stations.manage_home_fleet');
    });

    it('maps current and expected targets', () => {
      expect(resolveAssignVehiclePermission('current')).toBe('stations.manage_current_location');
      expect(resolveAssignVehiclePermission('expected')).toBe('stations.manage_transfers');
    });
  });

  describe('resolveVehicleLocationMutationPermissions', () => {
    it('requires current and expected permissions independently', () => {
      expect(resolveVehicleLocationMutationPermissions({ currentStationId: 's1' })).toEqual([
        'stations.manage_current_location',
      ]);
      expect(resolveVehicleLocationMutationPermissions({ expectedStationId: 's2' })).toEqual([
        'stations.manage_transfers',
      ]);
      expect(
        resolveVehicleLocationMutationPermissions({
          currentStationId: 's1',
          expectedStationId: 's2',
        }),
      ).toEqual(
        expect.arrayContaining([
          'stations.manage_current_location',
          'stations.manage_transfers',
        ]),
      );
    });

    it('treats explicit null as a mutation', () => {
      expect(
        resolveVehicleLocationMutationPermissions({ currentStationId: null }),
      ).toEqual(['stations.manage_current_location']);
    });
  });
});
