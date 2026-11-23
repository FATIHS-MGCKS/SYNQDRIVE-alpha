import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { validateActivationYear } from '../policy/activation-field-resolution';

export interface HmOnlyOperatorIdentityCapture {
  model: string;
  year: number;
}

/** Operator-supplied model/year — HM provider snapshot does not supply these. */
export function parseHmOnlyOperatorIdentityCapture(
  dto: RegisterHmOnlyVehicleDto,
): HmOnlyOperatorIdentityCapture {
  const model = dto.model?.trim();
  if (!model) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'HM_ONLY canonical registration requires operator-provided model',
    );
  }
  if (model.length > 120) {
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'model exceeds maximum length');
  }
  const yearRaw = dto.year;
  if (yearRaw == null || !Number.isFinite(yearRaw)) {
    throw new VehicleOnboardingError(
      'INVALID_CAPTURE_PAYLOAD',
      'HM_ONLY canonical registration requires operator-provided model year',
    );
  }
  try {
    return { model, year: validateActivationYear(Math.trunc(yearRaw)) };
  } catch (err) {
    if (err instanceof VehicleOnboardingError) throw err;
    throw new VehicleOnboardingError('INVALID_CAPTURE_PAYLOAD', 'model year is not valid for activation', {
      year: yearRaw,
    });
  }
}