import {
  normalizeReferenceSpecWriteInput,
  validateSpecVehicleFit,
} from '@modules/vehicle-intelligence/brakes/brake-reference-spec.domain';
import type {
  SpecVehicleFitContext,
  BrakeReferenceSpecThicknessInput,
  BrakeReferenceSpecProvenanceInput,
} from '@modules/vehicle-intelligence/brakes/brake-reference-spec.types';
import type { VehicleOnboardingBrakeReferenceDraft } from '../contracts/vehicle-technical-baseline-draft.v2';

const THICKNESS_KEYS = [
  'frontPadNominalThicknessMm',
  'rearPadNominalThicknessMm',
  'frontDiscNominalThicknessMm',
  'rearDiscNominalThicknessMm',
] as const;

/** Shared brake baseline validation for readiness and activation materialization. */
export function validateOnboardingBrakeReference(
  brake: VehicleOnboardingBrakeReferenceDraft,
  vehicleContext: SpecVehicleFitContext,
): { ok: true } | { ok: false; reason: string } {
  const fit = validateSpecVehicleFit(brake, vehicleContext, undefined);
  if (!fit.valid) {
    return { ok: false, reason: fit.errors.join('; ') };
  }
  try {
    const normalized = normalizeReferenceSpecWriteInput(
      brake as BrakeReferenceSpecThicknessInput & BrakeReferenceSpecProvenanceInput,
    );
    const hasThickness = THICKNESS_KEYS.some((k) => normalized.data[k] != null);
    if (!hasThickness) {
      return { ok: false, reason: 'NO_THICKNESS' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Invalid brake reference',
    };
  }
}

export function isOnboardingBrakeReferenceMaterializable(
  brake: VehicleOnboardingBrakeReferenceDraft | null | undefined,
  vehicleContext: SpecVehicleFitContext,
): boolean {
  if (!brake) return false;
  return validateOnboardingBrakeReference(brake, vehicleContext).ok;
}
