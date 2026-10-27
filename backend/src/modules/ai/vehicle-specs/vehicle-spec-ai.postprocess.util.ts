import { applyVehicleSpecMotionPlausibility } from './vehicle-spec-ai.plausibility.util';
import type { VehicleSpecContext } from './vehicle-spec-ai.types';
import {
  applyVariantConfidenceGate,
  normalizeVehicleSpecValues,
} from './vehicle-spec-ai.normalize.util';

export function postProcessVehicleSpecOutput(
  parsed: Record<string, string | number | boolean | null>,
  context?: VehicleSpecContext,
): {
  specs: Record<string, string | number | boolean | null>;
  rejectedFields: string[];
} {
  const normalized = normalizeVehicleSpecValues(parsed);
  const variantRejected = applyVariantConfidenceGate(normalized);
  const { specs, rejectedFields } = applyVehicleSpecMotionPlausibility(normalized, context);
  return { specs, rejectedFields: [...variantRejected, ...rejectedFields] };
}
