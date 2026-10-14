import type { Prisma, PrismaClient } from '@prisma/client';
import type { Vehicle } from '@prisma/client';

/**
 * Post-activation scalar patch via SQL — compatible with VO-2 Postgres CI schema surface
 * (avoids Prisma RETURNING on columns not yet migrated in integration DBs).
 */
export async function applyMasterPostActivationVehicleScalarsRaw(
  prisma: PrismaClient,
  vehicleId: string,
  patch: Prisma.VehicleUpdateInput,
): Promise<void> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const addInt = (column: string, value: unknown) => {
    if (value == null) return;
    clauses.push(`${column} = $${idx++}`);
    params.push(value);
  };
  const addFloat = (column: string, value: unknown) => {
    if (value == null) return;
    clauses.push(`${column} = $${idx++}`);
    params.push(value);
  };
  const addText = (column: string, value: unknown) => {
    if (value == null || value === '') return;
    clauses.push(`${column} = $${idx++}`);
    params.push(value);
  };
  const addHardwareType = (value: unknown) => {
    if (value == null || value === '') return;
    clauses.push(`hardware_type = $${idx++}::"HardwareType"`);
    params.push(String(value));
  };
  const addVehicleType = (value: unknown) => {
    if (value == null || value === '') return;
    clauses.push(`vehicle_type = $${idx++}::"VehicleType"`);
    params.push(String(value));
  };

  addInt('mileage_km', patch.mileageKm);
  addHardwareType(patch.hardwareType);
  addVehicleType(patch.vehicleType);
  addFloat('curb_weight_kg', patch.curbWeightKg);
  addInt('idle_rpm', patch.idleRpm);
  addInt('max_rpm', patch.maxRpm);
  addFloat('brake_force_front_percent', patch.brakeForceFrontPercent);
  addInt('service_interval_km', patch.serviceIntervalManufacturerKm);
  addInt('service_interval_months', patch.serviceIntervalManufacturerMonths);

  if (!clauses.length) {
    return;
  }
  clauses.push('updated_at = NOW()');
  params.push(vehicleId);
  await prisma.$executeRawUnsafe(
    `UPDATE vehicles SET ${clauses.join(', ')} WHERE id = $${idx}`,
    ...params,
  );
}

export async function loadVehicleRowForMasterRegistrationResult(
  prisma: PrismaClient,
  vehicleId: string,
): Promise<Vehicle> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      organization_id: string;
      dimo_vehicle_id: string | null;
      mileage_km: number | null;
      hardware_type: string;
      vin: string | null;
      make: string;
      model: string;
      year: number;
      fuel_type: string;
    }>
  >`
    SELECT id, organization_id, dimo_vehicle_id, mileage_km, hardware_type::text AS hardware_type,
           vin, make, model, year, fuel_type::text AS fuel_type
    FROM vehicles WHERE id = ${vehicleId}
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('vehicle not found after master registration');
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    dimoVehicleId: row.dimo_vehicle_id,
    mileageKm: row.mileage_km,
    hardwareType: row.hardware_type as Vehicle['hardwareType'],
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    fuelType: row.fuel_type as Vehicle['fuelType'],
  } as Vehicle;
}
