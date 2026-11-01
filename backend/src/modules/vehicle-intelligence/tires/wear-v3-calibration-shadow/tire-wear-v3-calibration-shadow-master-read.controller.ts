import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { TireWearV3CalibrationShadowMasterReadService } from './tire-wear-v3-calibration-shadow-master-read.service';

@Controller('admin/master-intelligence/tire-wear-v3-calibration-shadow')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class TireWearV3CalibrationShadowMasterReadController {
  constructor(private readonly reads: TireWearV3CalibrationShadowMasterReadService) {}

  @Get('summary')
  getSummary() {
    return this.reads.getGlobalSummary();
  }

  @Get('writer-health')
  getWriterHealth() {
    return this.reads.getWriterHealth();
  }

  @Get('organizations/:organizationId/vehicles/:vehicleId/setups/:tireSetupId')
  getSetupInspection(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('tireSetupId') tireSetupId: string,
  ) {
    return this.reads.getSetupInspection({
      organizationId,
      vehicleId,
      tireSetupId,
    });
  }
}
