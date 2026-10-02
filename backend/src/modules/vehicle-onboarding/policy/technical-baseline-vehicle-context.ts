import type { VehicleOnboardingCase } from '@prisma/client';
import type { SpecVehicleFitContext } from '@modules/vehicle-intelligence/brakes/brake-reference-spec.types';
import { parseValidatedIdentityDraft } from './persisted-contract.validation';
import { classifyPowertrainFromFuelType } from '../readiness/powertrain-classification';

export function buildBrakeSpecVehicleFitContextFromCase(
  caseRow: VehicleOnboardingCase,
): SpecVehicleFitContext {
  const identity = parseValidatedIdentityDraft(caseRow);
  return {
    make: identity.make,
    model: identity.model,
    modelYear: identity.year,
    powertrain: classifyPowertrainFromFuelType(identity.fuelType),
  };
}
