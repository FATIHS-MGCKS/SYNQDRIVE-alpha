import { api } from '../../lib/api';
import type { BatteryV2InspectionVehicleOption } from '../battery-v2-shadow-inspection/vehicle-selection';
import { fetchOrgVehiclesForBatteryV2Inspection } from '../battery-v2-shadow-inspection/vehicle-selection';

const PAGE_SIZE = 200;

/**
 * Loads HV-supported vehicles (electric powertrain) for one organization.
 */
export async function fetchOrgVehiclesForHvBatteryInspection(
  organizationId: string,
): Promise<BatteryV2InspectionVehicleOption[]> {
  if (!organizationId) return [];

  const collected: BatteryV2InspectionVehicleOption[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const res = await api.vehicles.operationalList({
      organizationId,
      registrationState: 'registered',
      page,
      limit: PAGE_SIZE,
    });
    totalPages = Math.max(1, res.meta?.totalPages ?? 1);

    for (const row of res.data ?? []) {
      if (!row.vehicleId || row.organizationId !== organizationId) continue;
      if (!row.isElectric) continue;
      collected.push({
        id: row.vehicleId,
        organizationId: row.organizationId,
        licensePlate: row.licensePlate ?? null,
        make: row.make ?? null,
        model: row.model ?? null,
        vin: row.vin ?? null,
      });
    }

    page += 1;
  }

  if (collected.length > 0) {
    return collected;
  }

  return fetchOrgVehiclesForBatteryV2Inspection(organizationId);
}
