import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { HighMobilityVehicle } from '@prisma/client';
import {
  assertHighMobilityRecordTenantAccess,
} from '@modules/high-mobility/high-mobility-tenant-access.policy';

export type HmObservationTenantVerdict =
  | { allowed: true }
  | { allowed: false; reasonCode: 'ORG_SCOPE_MISMATCH' | 'HM_TENANT_ACCESS_DENIED' };

/** Synchronous tenant scope gates — no repository reads. */
export function assertHmObservationAuthenticatedOrgScope(input: {
  dto: RegisterHmOnlyVehicleDto;
  access: { tenantOrganizationId: string; isMasterAdmin: boolean };
}): HmObservationTenantVerdict {
  if (input.dto.organizationId !== input.access.tenantOrganizationId && !input.access.isMasterAdmin) {
    return { allowed: false, reasonCode: 'ORG_SCOPE_MISMATCH' };
  }
  return { allowed: true };
}

export function assertHmObservationRecordTenantScope(input: {
  hmRecord: HighMobilityVehicle;
  organizationId: string;
  isMasterAdmin: boolean;
}): HmObservationTenantVerdict {
  try {
    assertHighMobilityRecordTenantAccess(
      input.hmRecord,
      input.organizationId,
      input.isMasterAdmin,
    );
    return { allowed: true };
  } catch {
    return { allowed: false, reasonCode: 'HM_TENANT_ACCESS_DENIED' };
  }
}