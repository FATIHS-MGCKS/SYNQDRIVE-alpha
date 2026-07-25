import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { OperatorTireMeasureService } from './operator-tire-measure.service';
import { OperatorTireMeasurementCaptureDto } from './operator-tire-measure.types';

@Controller('organizations/:orgId/operator')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class OperatorTireMeasureController {
  constructor(private readonly tireMeasure: OperatorTireMeasureService) {}

  @Post('vehicles/:vehicleId/tire-measurements/capture')
  @RequirePermission('vehicles', 'write')
  capture(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: OperatorTireMeasurementCaptureDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.tireMeasure.capture(orgId, vehicleId, body, { userId: user.id });
  }
}
