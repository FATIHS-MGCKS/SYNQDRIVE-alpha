import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VsiCapabilityResolverService } from './vsi-capability-resolver.service';
import { VsiConsumerModuleId } from './vsi-consumer-requirements.types';

/**
 * Read-only capability resolution (MASTER_ADMIN). No DIMO calls; no profile mutation.
 */
@Controller('api/v1/internal/vsi/capability-resolver')
@UseGuards(RolesGuard)
export class VsiCapabilityResolverController {
  constructor(private readonly resolver: VsiCapabilityResolverService) {}

  @Get(
    'organizations/:organizationId/vehicles/:vehicleId/links/:providerSourceLinkId/resolve',
  )
  @Roles('MASTER_ADMIN')
  async resolve(
    @Param('organizationId') organizationId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('providerSourceLinkId') providerSourceLinkId: string,
    @Query('consumerModule') consumerModule: string,
    @Query('featureId') featureId: string,
    @Query('evaluationTime') evaluationTime?: string,
  ) {
    const moduleId = consumerModule as (typeof VsiConsumerModuleId)[keyof typeof VsiConsumerModuleId];
    if (!Object.values(VsiConsumerModuleId).includes(moduleId)) {
      return {
        error: 'INVALID_CONSUMER_MODULE',
        allowed: Object.values(VsiConsumerModuleId),
      };
    }
    if (!featureId) {
      return { error: 'FEATURE_ID_REQUIRED' };
    }
    const evalAt = evaluationTime ? new Date(evaluationTime) : new Date();
    return this.resolver.resolve({
      organizationId,
      vehicleId,
      providerSourceLinkId,
      consumerModule: moduleId,
      featureId,
      evaluationTime: evalAt,
    });
  }
}
