import type { Vehicle } from '@prisma/client';
import type { VehicleRegistrationBrakeResult } from '@modules/vehicle-intelligence/brakes/registration-brake-outcome';

export interface RegisterFromDimoResult {
  vehicle: Vehicle;
  brakeRegistration: VehicleRegistrationBrakeResult;
}
