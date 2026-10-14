import type { Prisma } from '@prisma/client';

/** Mandatory Master registration artifacts applied inside the activation transaction. */
export interface MasterDimoActivationFinalizeInput {
  vehicleScalarPatch: Prisma.VehicleUpdateInput;
  lowVoltageBattery?: {
    batteryType?: string | null;
    batteryAmpere?: number | null;
    batteryVolt?: number | null;
  } | null;
}
