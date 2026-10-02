import { describe, expect, it, vi } from 'vitest';
import { fetchOrgVehiclesForBatteryV2Inspection } from './vehicle-selection';

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      operationalList: vi.fn(),
    },
  },
}));

import { api } from '../../lib/api';

describe('fetchOrgVehiclesForBatteryV2Inspection (C5B.1)', () => {
  it('uses server-side organizationId filter and paginates until complete', async () => {
    vi.mocked(api.vehicles.operationalList)
      .mockResolvedValueOnce({
        data: [
          {
            vehicleId: 'v1',
            organizationId: 'org-a',
            licensePlate: 'A-1',
            make: 'VW',
            model: 'Golf',
            vin: 'VIN1',
          },
        ],
        meta: { total: 2, page: 1, limit: 200, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        data: [
          {
            vehicleId: 'v2',
            organizationId: 'org-a',
            licensePlate: 'A-2',
            make: 'VW',
            model: 'Polo',
            vin: 'VIN2',
          },
        ],
        meta: { total: 2, page: 2, limit: 200, totalPages: 2 },
      });

    const vehicles = await fetchOrgVehiclesForBatteryV2Inspection('org-a');

    expect(vehicles.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(vi.mocked(api.vehicles.operationalList)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.vehicles.operationalList).mock.calls[0][0]).toMatchObject({
      organizationId: 'org-a',
      registrationState: 'registered',
      page: 1,
    });
    expect(vi.mocked(api.vehicles.operationalList).mock.calls[1][0]).toMatchObject({ page: 2 });
  });

  it('does not call listAll global endpoint', async () => {
    vi.mocked(api.vehicles.operationalList).mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 200, totalPages: 1 },
    });
    await fetchOrgVehiclesForBatteryV2Inspection('org-x');
    expect(vi.mocked(api.vehicles.operationalList)).toHaveBeenCalled();
  });
});
