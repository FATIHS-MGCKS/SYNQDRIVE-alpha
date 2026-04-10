import { Controller, Get, Post, Patch, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { DataAuthorizationsService } from './data-authorizations.service';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller('organizations/:orgId/data-authorizations')
@UseGuards(RolesGuard)
export class DataAuthorizationsController {
  constructor(private readonly service: DataAuthorizationsService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('moduleOrigin') moduleOrigin?: string,
    @Query('scope') scope?: string,
  ) {
    return this.service.findByOrg(orgId, { status, moduleOrigin, scope });
  }

  @Get('stats')
  async stats(@Param('orgId') orgId: string) {
    return this.service.getStats(orgId);
  }

  @Get(':id')
  async get(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.findById(orgId, id);
  }

  @Post()
  async create(@Param('orgId') orgId: string, @Body() body: any, @Req() req: any) {
    const user = req.user || {};
    return this.service.create(orgId, {
      ...body,
      grantedById: user.id,
      grantedByName: user.name || user.email || 'System',
    });
  }

  @Patch(':id/grant')
  async grant(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const user = req.user || {};
    return this.service.grant(orgId, id, user.id || 'system', user.name || user.email || 'System');
  }

  @Patch(':id/revoke')
  async revoke(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const user = req.user || {};
    return this.service.revoke(orgId, id, user.id || 'system', user.name || user.email || 'System');
  }
}
