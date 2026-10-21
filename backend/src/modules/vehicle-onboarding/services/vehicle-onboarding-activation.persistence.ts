import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { ResolvedActivationVehicleFields } from '../policy/activation-field-resolution';

/** Insert activation vehicle via SQL to stay compatible with VO-2 Postgres CI schema surface. */
export async function insertActivatedVehicleRow(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    fields: ResolvedActivationVehicleFields;
    dimoVehicleId: string | null;
  },
): Promise<string> {
  const vehicleId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO vehicles (
      id,
      organization_id,
      vin,
      vin_provenance,
      vin_verification_state,
      registry_lifecycle,
      make,
      model,
      year,
      fuel_type,
      vehicle_name,
      license_plate,
      notes,
      status,
      dimo_vehicle_id,
      station_id,
      current_station_id,
      created_at,
      updated_at
    ) VALUES (
      ${vehicleId},
      ${input.organizationId},
      ${input.fields.vin},
      ${input.fields.vinProvenance}::"VehicleVinProvenance",
      ${input.fields.vinVerificationState}::"VehicleVinVerificationState",
      'ACTIVE'::"VehicleRegistryLifecycle",
      ${input.fields.make},
      ${input.fields.model},
      ${input.fields.year},
      ${input.fields.fuelType}::"FuelType",
      ${input.fields.vehicleName},
      ${input.fields.licensePlate},
      ${input.fields.notes},
      'AVAILABLE'::"VehicleStatus",
      ${input.dimoVehicleId},
      ${input.fields.stationId},
      ${input.fields.stationId},
      NOW(),
      NOW()
    )
  `;
  return vehicleId;
}
