import type { FuelType, Prisma, VehicleType } from '@prisma/client';
import type { RegistrationBrakeManualSpec } from '@modules/vehicle-intelligence/brakes/register-brake-baseline';

/** Payload shape accepted by `POST .../vehicles/register-from-dimo` (Master Admin). */
export interface MasterDimoRegistrationInput {
  organizationId: string;
  stationId: string | null;
  dimoVehicleId: string;
  extraData?: Partial<Prisma.VehicleCreateInput> & {
    fuelType?: FuelType | string;
    vehicleType?: VehicleType | string;
    mileageKm?: number | null;
    hardwareType?: string | null;
  };
  manualSpecs?: {
    battery?: {
      batteryType?: string | null;
      batteryAmpere?: number | null;
      batteryVolt?: number | null;
    };
    brakes?: RegistrationBrakeManualSpec;
    tires?: {
      frontDimension?: string | null;
      rearDimension?: string | null;
      brandModelFront?: string | null;
      brandModelRear?: string | null;
      tireSeason?: string | null;
      loadIndexFront?: string | null;
      speedIndexFront?: string | null;
      loadIndexRear?: string | null;
      speedIndexRear?: string | null;
      dotCodeFront?: string | null;
      dotCodeRear?: string | null;
      tireCondition?: string | null;
      initialTreadFrontMm?: number | null;
      initialTreadRearMm?: number | null;
      treadFL?: number | null;
      treadFR?: number | null;
      treadBL?: number | null;
      treadBR?: number | null;
      aiTireSpec?: Record<string, unknown> | null;
    };
  };
  actorUserId: string | null;
}

export function masterDimoRegistrationIdempotencyKey(organizationId: string, dimoVehicleId: string): string {
  return `master-register-from-dimo:v1:${organizationId}:${dimoVehicleId}`;
}
