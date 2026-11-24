import { VehicleRegistryLifecycle } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { NotFoundException } from '@nestjs/common';
import {
  assertHighMobilityRecordTenantAccess,
} from '@modules/high-mobility/high-mobility-tenant-access.policy';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  type HmOnlyCanonicalOrchestrationInput,
  type HmOnlyCanonicalOrchestrationResult,
  hmOnlyCanonicalRegistrationIdempotencyKey,
} from './hm-only-canonical-registration.types';
import {
  evaluateHmOnlyCanonicalResumeAdmissionVerdict,
  evaluateHmOnlyProviderAdmissionBlockers,
  lookupExistingVehicleForHmAdmission,
  throwIfHmProviderAdmissionBlocked,
} from './hm-only-canonical-provider-admission.authority';

export type HmOnlyCanonicalResumeOutcome =
  | { kind: 'NOT_RESUMABLE' }
  | { kind: 'IDEMPOTENT_SUCCESS'; result: HmOnlyCanonicalOrchestrationResult };

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

  const existingVehicle = await lookupExistingVehicleForHmAdmission(prisma, hmRecord, organizationId);
  const blockers = await evaluateHmOnlyProviderAdmissionBlockers(prisma, {
    dto: input.dto,
    access: input.access,
    hmRecord,
  });
  throwIfHmProviderAdmissionBlocked(blockers, {
    hmVehicleId,
    organizationId,
    hmRecord,
    existingVehicle,
  });

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