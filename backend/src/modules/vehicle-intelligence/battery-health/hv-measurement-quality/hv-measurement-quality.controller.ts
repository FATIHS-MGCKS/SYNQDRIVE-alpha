import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { HvMeasurementQualityService } from './hv-measurement-quality.service';

@Controller('organizations/:orgId/vehicles/:vehicleId/hv-measurement-quality')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class HvMeasurementQualityController {
  constructor(private readonly measurementQuality: HvMeasurementQualityService) {}

  @Get()
  @RequirePermission('fleet-condition', 'read')
  getVehicleMeasurementQuality(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.measurementQuality.getVehicleMeasurementQuality(orgId, vehicleId);
  }
}
