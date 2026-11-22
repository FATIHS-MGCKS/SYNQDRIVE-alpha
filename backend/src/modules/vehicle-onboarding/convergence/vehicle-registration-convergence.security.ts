import { BadRequestException } from '@nestjs/common';
import type { ConvergenceTenantAccess } from './vehicle-registration-convergence.types';

/** Shared tenant guard for convergence entrypoints (HM/manual future). */
export function assertConvergenceOrganizationAuthorized(
  organizationId: string,
  access: ConvergenceTenantAccess,
): void {
  if (!organizationId?.trim()) {
    throw new BadRequestException('organizationId is required');
  }
  if (organizationId !== access.tenantOrganizationId && !access.isMasterAdmin) {
    throw new BadRequestException('organizationId does not match the authenticated organization');
  }
}

export function assertConvergenceVehicleIdentityPresent(vin: string | null | undefined): void {
  if (!vin?.trim()) {
    throw new BadRequestException('VIN is required for canonical vehicle registration');
  }
}