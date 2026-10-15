import type { Prisma, PrismaClient } from '@prisma/client';

type SqlExecutor = Pick<PrismaClient, '$executeRawUnsafe'>;

/**
 * Post-activation scalar patch via SQL — compatible with VO-2 Postgres CI schema surface
 * (avoids Prisma RETURNING on columns not yet migrated in integration DBs).
 */
export async function applyMasterPostActivationVehicleScalarsInTransaction(
  tx: SqlExecutor,
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
  const addDriveType = (value: unknown) => {
    if (value == null || value === '') return;
    clauses.push(`drive_type = $${idx++}::"DriveType"`);
    params.push(String(value));
  };
  addDriveType(patch.driveType);
  addFloat('curb_weight_kg', patch.curbWeightKg);
  addInt('idle_rpm', patch.idleRpm);
  addInt('max_rpm', patch.maxRpm);
  addFloat('brake_force_front_percent', patch.brakeForceFrontPercent);
  addFloat('front_weight_distribution_pct', patch.frontWeightDistributionPct);
  addFloat('tank_capacity_liters', patch.tankCapacityLiters);
  addInt('service_interval_manufacturer_km', patch.serviceIntervalManufacturerKm);
  addInt('service_interval_manufacturer_months', patch.serviceIntervalManufacturerMonths);
  addInt('oil_change_interval_km', patch.oilChangeIntervalKm);
  addInt('oil_change_interval_months', patch.oilChangeIntervalMonths);
  addText('created_by_user_id', patch.createdByUserId);

  if (!clauses.length) {
    return;
  }
  clauses.push('updated_at = NOW()');
  params.push(vehicleId);
  await tx.$executeRawUnsafe(
    `UPDATE vehicles SET ${clauses.join(', ')} WHERE id = $${idx}`,
    ...params,
  );
}

/** @deprecated use applyMasterPostActivationVehicleScalarsInTransaction */
export async function applyMasterPostActivationVehicleScalarsRaw(
  prisma: PrismaClient,
  vehicleId: string,
  patch: Prisma.VehicleUpdateInput,
): Promise<void> {
  return applyMasterPostActivationVehicleScalarsInTransaction(prisma, vehicleId, patch);
}
