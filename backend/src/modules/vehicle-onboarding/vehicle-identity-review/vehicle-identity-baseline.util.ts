import type {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import type { VehicleIdentityValueProvenance } from './vehicle-identity-review.types';

export type BaselineScalar = string | number | null;

export type VehicleIdentityBaselineField = {
  value: BaselineScalar;
  provenance: VehicleIdentityValueProvenance;
};

export type VehicleSystemBaseline = {
  vin: VehicleIdentityBaselineField;
  make: VehicleIdentityBaselineField;
  model: VehicleIdentityBaselineField;
  fuelType: VehicleIdentityBaselineField;
  motorPowerKw: VehicleIdentityBaselineField;
  displacementCc: VehicleIdentityBaselineField;
};

const unavailable = (): VehicleIdentityBaselineField => ({
  value: null,
  provenance: 'UNAVAILABLE',
});

const unconfirmed = (value: BaselineScalar): VehicleIdentityBaselineField => ({
  value,
  provenance: value == null ? 'UNAVAILABLE' : 'UNCONFIRMED',
});

const dimoField = (value: BaselineScalar): VehicleIdentityBaselineField => ({
  value,
  provenance: value == null ? 'UNAVAILABLE' : 'DIMO_PROVIDER',
});

export function mapMotionReferencePowerProvenance(
  source: MotionPhysicsReferenceSource,
  tier: MotionPhysicsEvidenceTier,
): VehicleIdentityValueProvenance {
  if (source === 'MISTRAL_AI') {
    return 'AI_ESTIMATED';
  }
  if (source === 'REGISTRATION_CERTIFICATE') {
    return 'DOCUMENT_EXTRACTED';
  }
  if (
    source === 'OPERATOR_CONFIRMED' ||
    source === 'MANUAL_ENTRY' ||
    tier === 'VERIFIED'
  ) {
    return 'USER_CONFIRMED';
  }
  if (tier === 'CONFIRMED') {
    return 'MOTION_PHYSICS_REFERENCE';
  }
  if (tier === 'ESTIMATED') {
    return 'AI_ESTIMATED';
  }
  return 'UNCONFIRMED';
}

export function buildVehicleSystemBaseline(input: {
  vin: string | null;
  make: string | null;
  model: string | null;
  fuelType: string | null;
  hasDimoProviderLink: boolean;
  motionReference: {
    systemMotorPowerKw: number | null;
    source: MotionPhysicsReferenceSource;
    evidenceTier: MotionPhysicsEvidenceTier;
  } | null;
}): VehicleSystemBaseline {
  const identityProvenance = input.hasDimoProviderLink ? dimoField : unconfirmed;

  let motorPower: VehicleIdentityBaselineField = unavailable();
  if (
    input.motionReference?.systemMotorPowerKw != null &&
    Number.isFinite(input.motionReference.systemMotorPowerKw)
  ) {
    motorPower = {
      value: input.motionReference.systemMotorPowerKw,
      provenance: mapMotionReferencePowerProvenance(
        input.motionReference.source,
        input.motionReference.evidenceTier,
      ),
    };
  }

  return {
    vin: identityProvenance(input.vin),
    make: identityProvenance(input.make),
    model: identityProvenance(input.model),
    fuelType: unconfirmed(input.fuelType),
    motorPowerKw: motorPower,
    displacementCc: unavailable(),
  };
}
