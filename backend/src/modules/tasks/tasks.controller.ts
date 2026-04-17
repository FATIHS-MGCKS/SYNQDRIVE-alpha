import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('organizations/:orgId/tasks')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findAll(@Param('orgId') orgId: string) {
    return this.tasksService.findByOrg(orgId);
  }

  @Get('organizations/:orgId/tasks/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async findOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.tasksService.findById(id, orgId);
  }

  @Post('organizations/:orgId/tasks')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async create(@Param('orgId') orgId: string, @Req() req: any, @Body() body: {
    title: string;
    description?: string;
    category?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    vehicleId?: string;
    fineId?: string;
    assignedTo?: string;
    dueDate?: string;
  }) {
    return this.tasksService.create(orgId, body, req.user?.id);
  }

  @Patch('organizations/:orgId/tasks/:id')
  @UseGuards(OrgScopingGuard, RolesGuard)
  async update(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: {
    title?: string;
    description?: string;
    status?: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    assignedTo?: string;
    dueDate?: string;
  }) {
    return this.tasksService.update(id, body, orgId);
  }
}
