import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller()
@UseGuards(RolesGuard)
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // --- admin/integrations (platform integrations management) ---
  @Get('admin/integrations')
  @Roles('MASTER_ADMIN')
  async findAll() {
    return this.integrationsService.findAll();
  }

  @Get('admin/integrations/stats')
  @Roles('MASTER_ADMIN')
  async getStats() {
    return this.integrationsService.getIntegrationStats();
  }

  // --- organizations/:orgId/integrations (org integration management) ---
  @Get('organizations/:orgId/integrations')
  @UseGuards(OrgScopingGuard)
  async findByOrg(@Param('orgId') orgId: string) {
    return this.integrationsService.findByOrganization(orgId);
  }

  @Post('organizations/:orgId/integrations/:integrationId/connect')
  @UseGuards(OrgScopingGuard)
  async connect(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @Body() body: { credentials?: Record<string, unknown>; config?: Record<string, unknown> },
  ) {
    return this.integrationsService.connect(
      orgId,
      integrationId,
      body.credentials ?? {},
      body.config,
    );
  }

  @Delete('organizations/:orgId/integrations/:integrationId')
  @UseGuards(OrgScopingGuard)
  async disconnect(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
  ) {
    return this.integrationsService.disconnect(orgId, integrationId);
  }
}
