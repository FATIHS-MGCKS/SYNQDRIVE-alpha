import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import { parseOffboardRequestBody } from '../policy/offboard-request.validation';
import { VehicleOnboardingOffboardService } from '../services/vehicle-onboarding-offboard.service';

@Controller('admin/vehicle-onboarding')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
@Roles('MASTER_ADMIN')
export class VehicleOnboardingOffboardController {
  constructor(private readonly offboardService: VehicleOnboardingOffboardService) {}

  private actorUserId(req: Request & { user?: { id?: string; sub?: string } }): string | null {
    const id = req.user?.id ?? req.user?.sub;
    return id ?? null;
  }

  @Post('organizations/:organizationId/vehicles/:vehicleId/offboard')
  async offboardVehicle(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const parsed = parseOffboardRequestBody(body);
      const result = await this.offboardService.offboardVehicle({
        organizationId,
        vehicleId,
        reason: parsed.reason,
        idempotencyKey: parsed.idempotencyKey,
        actorUserId: this.actorUserId(req),
        note: parsed.note,
      });
      return {
        vehicleId: result.vehicleId,
        organizationId: result.organizationId,
        registryLifecycle: result.registryLifecycle,
        offboardedAt: result.offboardedAt.toISOString(),
        reason: result.reason,
        idempotentReplay: result.idempotentReplay,
        warnings: result.warnings,
      };
    });
  }
}
