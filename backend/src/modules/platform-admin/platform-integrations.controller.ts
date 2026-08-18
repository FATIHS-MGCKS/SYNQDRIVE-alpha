import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { PlatformIntegrationsService } from './platform-integrations.service';
import { NotFoundException } from '@nestjs/common';

@Controller('admin/platform-integrations')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@Roles('MASTER_ADMIN')
export class PlatformIntegrationsController {
  constructor(private readonly integrations: PlatformIntegrationsService) {}

  @Get('directory')
  getDirectory() {
    return this.integrations.getDirectory();
  }

  @Get('attention-summary')
  getAttentionSummary() {
    return this.integrations.getAttentionSummary();
  }

  @Get('webhooks')
  getWebhooks() {
    return this.integrations.getWebhooks();
  }

  @Get('flags')
  getFlags() {
    return this.integrations.getPlatformFlags();
  }

  @Get(':integrationId')
  async getDetail(@Param('integrationId') integrationId: string) {
    try {
      return await this.integrations.getDetail(integrationId);
    } catch {
      throw new NotFoundException(`Integration not found: ${integrationId}`);
    }
  }
}
