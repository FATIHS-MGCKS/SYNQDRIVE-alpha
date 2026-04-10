import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller('organizations/:orgId/workflows')
@UseGuards(RolesGuard)
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.service.findByOrg(orgId, { status, category });
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
      createdById: user.id,
      createdByName: user.name || user.email || 'System',
    });
  }

  @Patch(':id')
  async update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: any, @Req() req: any) {
    const user = req.user || {};
    return this.service.update(orgId, id, {
      ...body,
      updatedById: user.id,
      updatedByName: user.name || user.email || 'System',
    });
  }

  @Patch(':id/toggle')
  async toggle(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const user = req.user || {};
    return this.service.toggleStatus(orgId, id, user.id, user.name || user.email || 'System');
  }

  @Post(':id/duplicate')
  async duplicate(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: any) {
    const user = req.user || {};
    return this.service.duplicate(orgId, id, user.id, user.name || user.email || 'System');
  }

  @Delete(':id')
  async remove(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.service.remove(orgId, id);
  }
}
