import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('organizations/:orgId/tasks')
  @UseGuards(RolesGuard)
  async findAll(@Param('orgId') orgId: string) {
    return this.tasksService.findByOrg(orgId);
  }

  @Get('organizations/:orgId/tasks/:id')
  @UseGuards(RolesGuard)
  async findOne(@Param('id') id: string) {
    return this.tasksService.findById(id);
  }

  @Post('organizations/:orgId/tasks')
  @UseGuards(RolesGuard)
  async create(@Param('orgId') orgId: string, @Body() body: {
    title: string;
    description?: string;
    category?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    vehicleId?: string;
    fineId?: string;
    assignedTo?: string;
    dueDate?: string;
  }) {
    return this.tasksService.create(orgId, body);
  }

  @Patch('organizations/:orgId/tasks/:id')
  @UseGuards(RolesGuard)
  async update(@Param('id') id: string, @Body() body: {
    title?: string;
    description?: string;
    status?: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    assignedTo?: string;
    dueDate?: string;
  }) {
    return this.tasksService.update(id, body);
  }
}
