import { VehicleRegistryLifecycle } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { HighMobilityVehicle } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  assertHighMobilityRecordTenantAccess,
  assertHighMobilityTenantOperationalOrganization,
} from '@modules/high-mobility/high-mobility-tenant-access.policy';

export interface HmLegacyAdmissionInput {
  dto: RegisterHmOnlyVehicleDto;
  access: {
    tenantOrganizationId: string;
    isMasterAdmin: boolean;
    actorUserId: string | null;
  };
  hmRecord: HighMobilityVehicle;
}

export interface HmLegacyAdmissionClassification {
  verdict: 'LEGACY_ADMISSIBLE' | 'LEGACY_BLOCKED';
  blockerReasonCodes: string[];
}

/**
 * Non-throwing mirror of legacy `HighMobilityRegistrationService` pre-create gates
 * (excludes side effects and vehicle row creation).
 */
export async function classifyHmOnlyLegacyAdmission(
  prisma: PrismaService,
  input: HmLegacyAdmissionInput,
): Promise<HmLegacyAdmissionClassification> {
  const blockers: string[] = [];
  const { dto, access, hmRecord } = input;

  if (dto.organizationId !== access.tenantOrganizationId && !access.isMasterAdmin) {
    blockers.push('ORG_SCOPE_MISMATCH');
  }

  try {
    assertHighMobilityRecordTenantAccess(hmRecord, dto.organizationId, access.isMasterAdmin);
  } catch {
    blockers.push('HM_TENANT_ACCESS_DENIED');
  }

  if (hmRecord.clearanceStatus !== 'APPROVED') {
    blockers.push('HM_CLEARANCE_NOT_APPROVED');
  }
  if (hmRecord.sourceMode !== 'HM_ONLY') {
    blockers.push('HM_SOURCE_MODE_NOT_HM_ONLY');
  }
  if (hmRecord.registrationState === 'REGISTERED') {
    blockers.push('HM_ALREADY_REGISTERED');
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

  const existingVehicle = await prisma.vehicle.findFirst({
    where: { vin: hmRecord.vin, organizationId: dto.organizationId },
    select: { id: true, registryLifecycle: true },
  });
  if (existingVehicle) {
    blockers.push('VIN_ALREADY_EXISTS_IN_ORG');
    if (
      existingVehicle.registryLifecycle === VehicleRegistryLifecycle.OFFBOARDED ||
      existingVehicle.registryLifecycle === VehicleRegistryLifecycle.ARCHIVED
    ) {
      blockers.push('EXISTING_VEHICLE_OFFBOARDED_OR_ARCHIVED');
    }
  }

  return {
    verdict: blockers.length === 0 ? 'LEGACY_ADMISSIBLE' : 'LEGACY_BLOCKED',
    blockerReasonCodes: blockers,
  };
}