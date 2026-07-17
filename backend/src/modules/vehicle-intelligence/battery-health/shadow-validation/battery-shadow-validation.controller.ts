import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DATA_ANALYSE_MODULE } from '@modules/data-analyse/data-analyse.constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { BatteryShadowValidationService } from './battery-shadow-validation.service';

/**
 * Internal org-scoped shadow validation report — read-only, no publication side effects.
 */
@Controller('organizations/:orgId/data-analyse')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BatteryShadowValidationController {
  constructor(private readonly shadowValidation: BatteryShadowValidationService) {}

  @Get('battery-shadow-validation-report')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  getReport(
    @Param('orgId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('observationDays') observationDays?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('vehicleSampleLimit') vehicleSampleLimit?: string,
  ) {
    const referenceNow = to ? new Date(to) : new Date();
    const observationStartAt = from ? new Date(from) : undefined;
    const days = observationDays ? Number(observationDays) : undefined;

    return this.shadowValidation.runReport({
      organizationId: orgId,
      vehicleId: vehicleId || undefined,
      referenceNow,
      observationStartAt,
      observationDays: Number.isFinite(days) ? days : undefined,
      vehicleSampleLimit: vehicleSampleLimit ? Number(vehicleSampleLimit) : 10,
    });
  }
}
