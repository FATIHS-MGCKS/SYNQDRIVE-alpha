import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { CommunicationOperationalHealthService } from './communication-operational-health.service';

@Controller('admin/communication')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS)
@Roles('MASTER_ADMIN')
export class CommunicationOperationalHealthController {
  constructor(private readonly healthService: CommunicationOperationalHealthService) {}

  @Get('operational-health')
  async getOperationalHealth(@Query('organizationId') organizationId?: string) {
    const snapshot = await this.healthService.evaluate({
      organizationId: organizationId?.trim() || undefined,
    });
    return snapshot;
  }
}
