import {
  VehicleRegistryLifecycle,
  type PrismaClient,
  type Vehicle,
} from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { RegisterFromDimoResult } from '@modules/vehicles/dto/register-from-dimo-result.dto';
import {
  buildNoBrakePayloadResult,
  deriveRegistrationBrakeResult,
} from '@modules/vehicle-intelligence/brakes/registration-brake-outcome';
import {
  type MasterDimoRegistrationInput,
  masterDimoRegistrationIdempotencyKey,
} from './master-dimo-registration.types';
import { loadMasterRegistrationVehicleResult } from './master-dimo-vehicle-result.loader';
import {
  computeMasterDimoRegistrationPayloadFingerprint,
  readMasterDimoPayloadFingerprintFromReadinessSnapshot,
} from './master-dimo-registration-payload-fingerprint';

export type MasterDimoResumeOutcome =
  | { kind: 'NOT_RESUMABLE' }
  | { kind: 'IDEMPOTENT_SUCCESS'; result: RegisterFromDimoResult };

export async function tryResumeMasterDimoRegistration(
  prisma: PrismaClient,
  input: MasterDimoRegistrationInput,
): Promise<MasterDimoResumeOutcome> {
  const idempotencyKey = masterDimoRegistrationIdempotencyKey(
    input.organizationId,
    input.dimoVehicleId,
  );

  const vehicle = await prisma.vehicle.findFirst({
    where: { dimoVehicleId: input.dimoVehicleId },
    select: {
      id: true,
      organizationId: true,
      registryLifecycle: true,
      dimoVehicleId: true,
    },
  });
  if (!vehicle) {
    return { kind: 'NOT_RESUMABLE' };
  }

  if (
    vehicle.registryLifecycle === VehicleRegistryLifecycle.OFFBOARDED ||
    vehicle.registryLifecycle === VehicleRegistryLifecycle.ARCHIVED
  ) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_REGISTERED',
      'Provider source belongs to an offboarded or archived vehicle; explicit re-onboarding is required',
      {
        vehicleId: vehicle.id,
        organizationId: vehicle.organizationId,
        registryLifecycle: vehicle.registryLifecycle,
        requiresReOnboard: true,
      },
    );
  }

  if (vehicle.organizationId !== input.organizationId) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_REGISTERED',
      'This DIMO vehicle is already linked to a fleet vehicle in another organization',
      { vehicleId: vehicle.id, organizationId: vehicle.organizationId },
    );
  }

  const completedCase = await prisma.vehicleOnboardingCase.findFirst({
    where: {
      organizationId: input.organizationId,
      idempotencyKey,
      status: 'COMPLETED',
      vehicleId: vehicle.id,
    },
    select: {
      id: true,
      readinessSnapshotJson: true,
    },
  });

  if (!completedCase) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_REGISTERED',
      'This DIMO vehicle is already linked to a fleet vehicle',
      { vehicleId: vehicle.id, organizationId: vehicle.organizationId },
    );
  }

  const storedFingerprint = readMasterDimoPayloadFingerprintFromReadinessSnapshot(
    completedCase.readinessSnapshotJson,
  );
  const incomingFingerprint = computeMasterDimoRegistrationPayloadFingerprint(input);
  if (storedFingerprint && storedFingerprint !== incomingFingerprint) {
    throw new VehicleOnboardingError(
      'MASTER_DIMO_REGISTRATION_PAYLOAD_MISMATCH',
      'DIMO vehicle is already registered; payload changes require the vehicle update workflow',
      {
        vehicleId: vehicle.id,
        organizationId: vehicle.organizationId,
        useVehicleUpdateWorkflow: true,
      },
    );
  }

  const fullVehicle = await loadMasterRegistrationVehicleResult(prisma, vehicle.id);
  return {
    kind: 'IDEMPOTENT_SUCCESS',
    result: {
      vehicle: fullVehicle,
      brakeRegistration: buildBrakeRegistrationResult(input, fullVehicle),
    },
  };
}

function buildBrakeRegistrationResult(
  input: MasterDimoRegistrationInput,
  _vehicle: Vehicle,
): RegisterFromDimoResult['brakeRegistration'] {
  if (!input.manualSpecs?.brakes) {
    return buildNoBrakePayloadResult();
  }
  return deriveRegistrationBrakeResult({
    rawBrakes: input.manualSpecs.brakes,
    specCreated: true,
    initialized: false,
  });
}
