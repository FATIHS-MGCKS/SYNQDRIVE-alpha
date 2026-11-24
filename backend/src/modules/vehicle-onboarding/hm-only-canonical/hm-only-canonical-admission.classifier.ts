import { VehicleRegistryLifecycle, type HighMobilityVehicle } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  assertHighMobilityTenantOperationalOrganization,
} from '@modules/high-mobility/high-mobility-tenant-access.policy';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { hmOnlyCanonicalRegistrationIdempotencyKey } from './hm-only-canonical-registration.types';

export type HmCanonicalAdmissionVerdict =
  | 'CANONICAL_ADMISSION_ELIGIBLE'
  | 'CANONICAL_ADMISSION_BLOCKED'
  | 'CANONICAL_IDEMPOTENT_REPLAY'
  | 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED'
  | 'CANONICAL_ADMISSION_NOT_EVALUABLE';

export interface HmCanonicalAdmissionClassification {
  verdict: HmCanonicalAdmissionVerdict;
  blockerReasonCodes: string[];
}

/**
 * Non-throwing mirror of {@link assertHmOnlyCanonicalProviderRecord} and resume admission gates.
 */
export async function classifyHmOnlyCanonicalAdmission(
  prisma: PrismaService,
  input: {
    dto: RegisterHmOnlyVehicleDto;
    access: { isMasterAdmin: boolean };
    hmRecord: HighMobilityVehicle;
  },
): Promise<HmCanonicalAdmissionClassification> {
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

  const existingVehicle =
    (hmRecord.synqdriveVehicleId
      ? await prisma.vehicle.findFirst({
          where: { id: hmRecord.synqdriveVehicleId, organizationId: dto.organizationId },
          select: { id: true, registryLifecycle: true },
        })
      : null) ??
    (await prisma.vehicle.findFirst({
      where: { vin: hmRecord.vin, organizationId: dto.organizationId },
      select: { id: true, registryLifecycle: true },
    }));

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

  if (blockers.length > 0) {
    return { verdict: 'CANONICAL_ADMISSION_BLOCKED', blockerReasonCodes: blockers };
  }

  const resume = await classifyHmOnlyCanonicalResumeAdmission(prisma, input, hmRecord);
  if (resume.verdict !== 'NOT_APPLICABLE') {
    return {
      verdict: resume.verdict,
      blockerReasonCodes: resume.blockerReasonCodes,
    };
  }

  return { verdict: 'CANONICAL_ADMISSION_ELIGIBLE', blockerReasonCodes: [] };
}

async function classifyHmOnlyCanonicalResumeAdmission(
  prisma: PrismaService,
  input: {
    dto: RegisterHmOnlyVehicleDto;
    access: { isMasterAdmin: boolean };
  },
  hm: HighMobilityVehicle,
): Promise<
  | {
      verdict: 'CANONICAL_IDEMPOTENT_REPLAY' | 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED';
      blockerReasonCodes: string[];
    }
  | { verdict: 'NOT_APPLICABLE'; blockerReasonCodes: [] }
> {
  const idempotencyKey = hmOnlyCanonicalRegistrationIdempotencyKey(
    input.dto.organizationId,
    input.dto.hmVehicleId,
  );

  let synqdriveVehicleId = hm.synqdriveVehicleId;
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

  if (!synqdriveVehicleId && hm.registrationState !== 'REGISTERED') {
    return { verdict: 'NOT_APPLICABLE', blockerReasonCodes: [] };
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
    if (hm.registrationState === 'REGISTERED') {
      return {
        verdict: 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED',
        blockerReasonCodes: ['HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL'],
      };
    }
    return { verdict: 'NOT_APPLICABLE', blockerReasonCodes: [] };
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
      blockerReasonCodes: ['CANONICAL_IDEMPOTENT_REPLAY'],
    };
  }

  if (hm.registrationState === 'REGISTERED' && hm.synqdriveVehicleId) {
    return {
      verdict: 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED',
      blockerReasonCodes: ['HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL'],
    };
  }

  return { verdict: 'NOT_APPLICABLE', blockerReasonCodes: [] };
}