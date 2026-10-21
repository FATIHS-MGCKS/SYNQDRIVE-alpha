import { api } from '../../lib/api';

export type BatteryV2InspectionVehicleOption = {
  id: string;
  organizationId: string;
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  vin: string | null;
};

const PAGE_SIZE = 200;

/**
 * Loads all registered operational vehicles for one organization via server-side filter.
 * Does not depend on a global first-N vehicle page.
 */
export async function fetchOrgVehiclesForBatteryV2Inspection(
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

  return collected;
}
