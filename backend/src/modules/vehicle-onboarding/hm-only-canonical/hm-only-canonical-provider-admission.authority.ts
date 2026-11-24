import { VehicleRegistryLifecycle, type HighMobilityVehicle } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { PrismaService } from '@shared/database/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertHighMobilityTenantOperationalOrganization } from '@modules/high-mobility/high-mobility-tenant-access.policy';
import { hmOnlyCanonicalRegistrationIdempotencyKey } from './hm-only-canonical-registration.types';
import type { HmCanonicalAdmissionVerdict } from './hm-only-canonical-readiness-observation.types';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/**
 * Observation + canonical assert share provider-gate and resume-idempotency evaluation.
 * Activation orchestration (source adoption, readiness seal) remains outside this module.
 */
export function throwIfHmProviderAdmissionBlocked(
  blockers: string[],
  ctx: {
    hmVehicleId: string;
    organizationId: string;
    hmRecord: Pick<HighMobilityVehicle, 'vin' | 'synqdriveVehicleId' | 'registrationState'>;
    existingVehicle?: { id: string; registryLifecycle: VehicleRegistryLifecycle } | null;
  },
): void {
  if (blockers.length === 0) {
    return;
  }
  if (blockers.includes('SOURCE_ALREADY_REGISTERED') && ctx.existingVehicle) {
    throw new VehicleOnboardingError(
      'SOURCE_ALREADY_REGISTERED',
      'A vehicle with this VIN belongs to an offboarded or archived lifecycle; explicit re-onboarding is required',
      { vehicleId: ctx.existingVehicle.id, registryLifecycle: ctx.existingVehicle.registryLifecycle },
    );
  }
  if (blockers.includes('VIN_ALREADY_EXISTS_IN_ORG')) {
    throw new ConflictException(
      `A vehicle with VIN ${ctx.hmRecord.vin} already exists in organization ${ctx.organizationId}`,
    );
  }
  if (blockers.includes('HM_CLEARANCE_NOT_APPROVED')) {
    throw new BadRequestException('HM vehicle clearance is not APPROVED');
  }
  if (blockers.includes('HM_SOURCE_MODE_NOT_HM_ONLY')) {
    throw new BadRequestException('registerHmOnlyVehicle is only for HM_ONLY source mode vehicles');
  }
  if (blockers.includes('ORG_NOT_OPERATIONAL')) {
    throw new BadRequestException('Organization is not operational for High Mobility registration');
  }
  if (blockers.includes('HM_REGISTERED_STATE_INCONSISTENT')) {
    const targetId = ctx.hmRecord.synqdriveVehicleId ?? ctx.existingVehicle?.id ?? 'unknown';
    throw new ConflictException(
      `HM vehicle ${ctx.hmVehicleId} is already registered as SynqDrive vehicle ${targetId}`,
    );
  }
  throw new BadRequestException('HM provider admission blocked');
}

export async function lookupExistingVehicleForHmAdmission(
  prisma: PrismaService,
  hmRecord: Pick<HighMobilityVehicle, 'synqdriveVehicleId' | 'vin'>,
  organizationId: string,
) {
  return (
    (hmRecord.synqdriveVehicleId
      ? await prisma.vehicle.findFirst({
          where: { id: hmRecord.synqdriveVehicleId, organizationId },
          select: { id: true, registryLifecycle: true },
        })
      : null) ??
    (await prisma.vehicle.findFirst({
      where: { vin: hmRecord.vin, organizationId },
      select: { id: true, registryLifecycle: true },
    }))
  );
}

/** Shared provider admission blockers — same semantics as assertHmOnlyCanonicalProviderRecord. */
export async function evaluateHmOnlyProviderAdmissionBlockers(
  prisma: PrismaService,
  input: {
    dto: RegisterHmOnlyVehicleDto;
    access: { isMasterAdmin: boolean };
    hmRecord: HighMobilityVehicle;
  },
): Promise<string[]> {
  const blockers: string[] = [];
  const { dto, access, hmRecord } = input;

  if (hmRecord.clearanceStatus !== 'APPROVED') {
    blockers.push('HM_CLEARANCE_NOT_APPROVED');
  }
  if (hmRecord.sourceMode !== 'HM_ONLY') {
    blockers.push('HM_SOURCE_MODE_NOT_HM_ONLY');
  }

  try {
    await assertHighMobilityTenantOperationalOrganization(
      prisma,
      dto.organizationId,
      access.isMasterAdmin,
    );
  } catch {
    blockers.push('ORG_NOT_OPERATIONAL');
  }

  const existingVehicle = await lookupExistingVehicleForHmAdmission(
    prisma,
    hmRecord,
    dto.organizationId,
  );

  if (
    existingVehicle &&
    (existingVehicle.registryLifecycle === VehicleRegistryLifecycle.OFFBOARDED ||
      existingVehicle.registryLifecycle === VehicleRegistryLifecycle.ARCHIVED)
  ) {
    blockers.push('EXISTING_VEHICLE_OFFBOARDED_OR_ARCHIVED');
    blockers.push('SOURCE_ALREADY_REGISTERED');
  } else if (existingVehicle && hmRecord.synqdriveVehicleId !== existingVehicle.id) {
    blockers.push('VIN_ALREADY_EXISTS_IN_ORG');
  }

  if (
    hmRecord.registrationState === 'REGISTERED' &&
    hmRecord.synqdriveVehicleId &&
    !existingVehicle
  ) {
    blockers.push('HM_REGISTERED_STATE_INCONSISTENT');
  }

  if (
    hmRecord.registrationState === 'REGISTERED' &&
    !hmRecord.synqdriveVehicleId &&
    existingVehicle
  ) {
    blockers.push('HM_REGISTERED_STATE_INCONSISTENT');
  }

  return blockers;
}

export async function evaluateHmOnlyCanonicalResumeAdmissionVerdict(
  prisma: PrismaService,
  input: {
    dto: RegisterHmOnlyVehicleDto;
    hmRecord: HighMobilityVehicle;
  },
): Promise<
  | { verdict: 'NOT_APPLICABLE'; blockers: [] }
  | {
      verdict: Exclude<
        HmCanonicalAdmissionVerdict,
        'CANONICAL_ADMISSION_ELIGIBLE' | 'CANONICAL_ADMISSION_BLOCKED' | 'CANONICAL_ADMISSION_NOT_EVALUABLE'
      >;
      blockers: string[];
    }
> {
  const idempotencyKey = hmOnlyCanonicalRegistrationIdempotencyKey(
    input.dto.organizationId,
    input.dto.hmVehicleId,
  );

  let synqdriveVehicleId = input.hmRecord.synqdriveVehicleId;
  if (!synqdriveVehicleId) {
    const completedCase = await prisma.vehicleOnboardingCase.findFirst({
      where: {
        organizationId: input.dto.organizationId,
        idempotencyKey,
        status: 'COMPLETED',
        vehicleId: { not: null },
      },
      select: { vehicleId: true },
    });
    if (completedCase?.vehicleId) {
      synqdriveVehicleId = completedCase.vehicleId;
    }
  }

  if (!synqdriveVehicleId && input.hmRecord.registrationState !== 'REGISTERED') {
    return { verdict: 'NOT_APPLICABLE', blockers: [] };
  }

  const vehicle = synqdriveVehicleId
    ? await prisma.vehicle.findFirst({
        where: {
          id: synqdriveVehicleId,
          organizationId: input.dto.organizationId,
        },
        select: { id: true, registryLifecycle: true },
      })
    : null;

  if (!vehicle) {
    if (input.hmRecord.registrationState === 'REGISTERED') {
      return {
        verdict: 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED',
        blockers: ['HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL'],
      };
    }
    return { verdict: 'NOT_APPLICABLE', blockers: [] };
  }

  const completedCase = await prisma.vehicleOnboardingCase.findFirst({
    where: {
      organizationId: input.dto.organizationId,
      idempotencyKey,
      status: 'COMPLETED',
      vehicleId: vehicle.id,
    },
    select: { id: true },
  });

  if (completedCase) {
    return {
      verdict: 'CANONICAL_IDEMPOTENT_REPLAY',
      blockers: ['CANONICAL_IDEMPOTENT_REPLAY'],
    };
  }

  if (input.hmRecord.registrationState === 'REGISTERED' && input.hmRecord.synqdriveVehicleId) {
    return {
      verdict: 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED',
      blockers: ['HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL'],
    };
  }

  return { verdict: 'NOT_APPLICABLE', blockers: [] };
}