import { VehicleRegistryLifecycle } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  assertHighMobilityRecordTenantAccess,
  assertHighMobilityTenantOperationalOrganization,
} from '@modules/high-mobility/high-mobility-tenant-access.policy';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  type HmOnlyCanonicalOrchestrationInput,
  type HmOnlyCanonicalOrchestrationResult,
  hmOnlyCanonicalRegistrationIdempotencyKey,
} from './hm-only-canonical-registration.types';
import { evaluateHmOnlyCanonicalResumeAdmissionVerdict } from './hm-only-canonical-provider-admission.authority';

export type HmOnlyCanonicalResumeOutcome =
  | { kind: 'NOT_RESUMABLE' }
  | { kind: 'IDEMPOTENT_SUCCESS'; result: HmOnlyCanonicalOrchestrationResult };

/** Runtime canonical activation gate — error contract frozen against `origin/main`. */
export async function assertHmOnlyCanonicalProviderRecord(
  prisma: PrismaService,
  input: HmOnlyCanonicalOrchestrationInput,
): Promise<
  import('@prisma/client').HighMobilityVehicle
> {
  const { hmVehicleId, organizationId } = input.dto;
  const hmRecord = await prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
  if (!hmRecord) {
    throw new NotFoundException(`HM vehicle ${hmVehicleId} not found`);
  }
  assertHighMobilityRecordTenantAccess(
    hmRecord,
    organizationId,
    input.access.isMasterAdmin,
  );
  if (hmRecord.clearanceStatus !== 'APPROVED') {
    throw new BadRequestException(
      `HM vehicle clearance is not APPROVED (current: ${hmRecord.clearanceStatus})`,
    );
  }
  if (hmRecord.sourceMode !== 'HM_ONLY') {
    throw new BadRequestException(
      `registerHmOnlyVehicle is only for HM_ONLY source mode vehicles (got: ${hmRecord.sourceMode})`,
    );
  }

  await assertHighMobilityTenantOperationalOrganization(
    prisma,
    organizationId,
    input.access.isMasterAdmin,
  );

  const existingVehicle =
    (hmRecord.synqdriveVehicleId
      ? await prisma.vehicle.findFirst({
          where: { id: hmRecord.synqdriveVehicleId, organizationId },
          select: {
            id: true,
            organizationId: true,
            registryLifecycle: true,
          },
        })
      : null) ??
    (await prisma.vehicle.findFirst({
      where: { vin: hmRecord.vin, organizationId },
      select: {
        id: true,
        organizationId: true,
        registryLifecycle: true,
      },
    }));
  if (
    existingVehicle &&
    (existingVehicle.registryLifecycle === VehicleRegistryLifecycle.OFFBOARDED ||
      existingVehicle.registryLifecycle === VehicleRegistryLifecycle.ARCHIVED)
  ) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_REGISTERED',
      'A vehicle with this VIN belongs to an offboarded or archived lifecycle; explicit re-onboarding is required',
      { vehicleId: existingVehicle.id, registryLifecycle: existingVehicle.registryLifecycle },
    );
  }
  if (existingVehicle && hmRecord.synqdriveVehicleId !== existingVehicle.id) {
    throw new ConflictException(
      `A vehicle with VIN ${hmRecord.vin} already exists in organization ${organizationId}`,
    );
  }

  if (
    hmRecord.registrationState === 'REGISTERED' &&
    hmRecord.synqdriveVehicleId &&
    !existingVehicle
  ) {
    throw new ConflictException(
      `HM vehicle ${hmVehicleId} is already registered as SynqDrive vehicle ${hmRecord.synqdriveVehicleId}`,
    );
  }

  if (
    hmRecord.registrationState === 'REGISTERED' &&
    !hmRecord.synqdriveVehicleId &&
    existingVehicle
  ) {
    throw new ConflictException(
      `HM vehicle ${hmVehicleId} is already registered as SynqDrive vehicle ${existingVehicle.id}`,
    );
  }

  return hmRecord;
}

export async function tryResumeHmOnlyCanonicalRegistration(
  prisma: PrismaService,
  input: HmOnlyCanonicalOrchestrationInput,
  hm: Pick<import('@prisma/client').HighMobilityVehicle, 'id' | 'vin' | 'synqdriveVehicleId' | 'registrationState'>,
): Promise<HmOnlyCanonicalResumeOutcome> {
  const idempotencyKey = hmOnlyCanonicalRegistrationIdempotencyKey(
    input.dto.organizationId,
    input.dto.hmVehicleId,
  );

  if (!hm.synqdriveVehicleId) {
    const completedCase = await prisma.vehicleOnboardingCase.findFirst({
      where: {
        organizationId: input.dto.organizationId,
        idempotencyKey,
        status: 'COMPLETED',
        vehicleId: { not: null },
      },
      select: { vehicleId: true },
    });
    if (!completedCase?.vehicleId) {
      return { kind: 'NOT_RESUMABLE' };
    }
    hm = { ...hm, synqdriveVehicleId: completedCase.vehicleId };
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: hm.synqdriveVehicleId!,
      organizationId: input.dto.organizationId,
    },
    select: {
      id: true,
      vin: true,
      organizationId: true,
      registryLifecycle: true,
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

  const resumeVerdict = await evaluateHmOnlyCanonicalResumeAdmissionVerdict(prisma, {
    dto: input.dto,
    hmRecord: hm as import('@prisma/client').HighMobilityVehicle,
  });

  if (resumeVerdict.verdict === 'CANONICAL_IDEMPOTENT_REPLAY') {
    return {
      kind: 'IDEMPOTENT_SUCCESS',
      result: buildHmOnlySuccessResult(vehicle.id, input.dto.hmVehicleId, vehicle.vin ?? hm.vin),
    };
  }

  if (resumeVerdict.verdict === 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED') {
    throw new VehicleOnboardingError(
      'HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL',
      'HM vehicle was registered outside canonical onboarding; explicit reconciliation required before canonical replay',
      {
        vehicleId: vehicle.id,
        hmVehicleId: input.dto.hmVehicleId,
        organizationId: input.dto.organizationId,
        legacyInlineRegistration: true,
      },
    );
  }

  return { kind: 'NOT_RESUMABLE' };
}

export function buildHmOnlySuccessResult(
  synqdriveVehicleId: string,
  hmVehicleId: string,
  vin: string,
): HmOnlyCanonicalOrchestrationResult {
  return {
    success: true,
    synqdriveVehicleId,
    hmVehicleId,
    vin,
    sourceMode: 'HM_ONLY',
    message: `Vehicle ${vin} registered as HM_ONLY source (canonical)`,
  };
}