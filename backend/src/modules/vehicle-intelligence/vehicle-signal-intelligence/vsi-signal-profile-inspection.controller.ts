import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/auth/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';

/**
 * Read-only certification surface for VSI signal capability profiles (MASTER_ADMIN).
 */
@Controller('api/v1/internal/vsi/signal-profiles')
@UseGuards(RolesGuard)
export class VsiSignalProfileInspectionController {
  constructor(
    private readonly materialization: VsiSignalProfileMaterializationService,
  ) {}

  @Get('organizations/:organizationId/vehicles/:vehicleId')
  @Roles('MASTER_ADMIN')
  async listForVehicle(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('providerSourceLinkId') providerSourceLinkId?: string,
  ) {
    if (providerSourceLinkId) {
      const profile = await this.materialization.getProfileForLink(
        organizationId,
        vehicleId,
        providerSourceLinkId,
      );
      return { profiles: [profile] };
    }
    const profiles = await this.materialization.listProfilesForVehicle(
      organizationId,
      vehicleId,
    );
    return { profiles };
  }

  /**
   * Re-materialize from persisted VLS + cached preflight (no DIMO calls).
   * Use when the snapshot hook logged a materialization failure.
   */
  @Post('organizations/:organizationId/vehicles/:vehicleId/materialize')
  @Roles('MASTER_ADMIN')
  async rematerialize(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('providerSourceLinkId') providerSourceLinkId: string,
  ) {
    const result = await this.materialization.rematerializeForCertification({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      requireBindingMatch: true,
    });
    return { materialized: result != null, evaluation: result };
  }
}
