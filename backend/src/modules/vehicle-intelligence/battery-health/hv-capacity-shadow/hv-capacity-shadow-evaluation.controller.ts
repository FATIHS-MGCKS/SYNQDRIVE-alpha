import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DATA_ANALYSE_MODULE } from '@modules/data-analyse/data-analyse.constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { HvCapacityShadowEvaluationService } from './hv-capacity-shadow-evaluation.service';

@Controller('organizations/:orgId/data-analyse/vehicles/:vehicleId')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class HvCapacityShadowEvaluationController {
  constructor(
    private readonly evaluation: HvCapacityShadowEvaluationService,
  ) {}

  @Get('hv-capacity-shadow-evaluation')
  @RequirePermission(DATA_ANALYSE_MODULE, 'read')
  getEvaluation(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.evaluation.getEvaluation({
      organizationId: orgId,
      vehicleId,
    });
  }
}
