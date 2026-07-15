import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { TasksService } from './tasks.service';

interface TaskAuthRequest extends Request {
  user?: { id?: string; platformRole?: string };
}
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import {
  AddAttachmentDto,
  AddCommentDto,
  AssignTaskDto,
  BulkTaskActionDto,
  ChecklistItemDto,
  CompleteTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from './dto/task.dto';

/**
 * Task Action Layer REST surface (V4.8.3). All routes are org-scoped through
 * OrgScopingGuard + RolesGuard; the service additionally validates that every
 * linked entity belongs to the same organization, so there is no cross-tenant
 * leak even if an id from another org is supplied.
 */
@Controller()
@UseGuards(OrgScopingGuard, RolesGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('organizations/:orgId/tasks')
  async findAll(@Param('orgId') orgId: string, @Query() query: ListTasksQueryDto) {
    return this.tasksService.listTasks(orgId, {
      status: query.status,
      priority: query.priority,
      type: query.type,
      sourceType: query.source,
      assignedUserId: query.assignedUserId,
      vehicleId: query.vehicleId,
      bookingId: query.bookingId,
      customerId: query.customerId,
      vendorId: query.vendorId,
      alertId: query.alertId,
      documentId: query.documentId,
      serviceCaseId: query.serviceCaseId,
      invoiceId: query.invoiceId,
      stationId: query.stationId,
      activatesFrom: query.activatesFrom,
      activatesTo: query.activatesTo,
      dueFrom: query.dueFrom,
      dueTo: query.dueTo,
      overdue: query.overdue,
      search: query.search,
      bucket: query.bucket,
      includeCancelled: query.includeCancelled,
    });
  }

  @Get('organizations/:orgId/tasks/summary')
  async summary(@Param('orgId') orgId: string, @Req() req: TaskAuthRequest) {
    return this.tasksService.getDashboardSummary(orgId, req.user?.id);
  }

  @Get('organizations/:orgId/tasks/:id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
  ) {
    return this.tasksService.getTaskById(
      id,
      orgId,
      req.user?.id ? { id: req.user.id, platformRole: req.user.platformRole } : undefined,
    );
  }

  @Post('organizations/:orgId/tasks')
  async create(@Param('orgId') orgId: string, @Req() req: TaskAuthRequest, @Body() body: CreateTaskDto) {
    return this.tasksService.createManualTask(
      orgId,
      {
        title: body.title,
        description: body.description,
        type: body.type,
        sourceType: body.source ?? 'MANUAL',
        priority: body.priority,
        category: body.category,
        dueDate: body.dueDate,
        activatesAt: body.activatesAt,
        assignedUserId: body.assignedUserId,
        vehicleId: body.vehicleId,
        bookingId: body.bookingId,
        customerId: body.customerId,
        vendorId: body.vendorId,
        alertId: body.alertId,
        documentId: body.documentId,
        serviceCaseId: body.serviceCaseId,
        estimatedCostCents: body.estimatedCostCents,
        estimatedDurationMinutes: body.estimatedDurationMinutes,
        checklist: body.checklist,
        blocksVehicleAvailability: body.blocksVehicleAvailability,
        metadata: {
          ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
          ...(body.stationId ? { stationId: body.stationId } : {}),
        },
        source: body.sourceKey ?? undefined,
      },
      req.user?.id,
    );
  }

  @Patch('organizations/:orgId/tasks/:id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(
      orgId,
      id,
      {
        title: body.title,
        description: body.description,
        category: body.category,
        priority: body.priority,
        dueDate: body.dueDate,
        assignedUserId: body.assignedUserId,
        estimatedCostCents: body.estimatedCostCents,
        actualCostCents: body.actualCostCents,
        blocksVehicleAvailability: body.blocksVehicleAvailability,
      },
      req.user?.id,
    );
  }

  @Patch('organizations/:orgId/tasks/:id/assign')
  async assign(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
    @Body() body: AssignTaskDto,
  ) {
    return this.tasksService.assignTask(orgId, id, body.assignedUserId ?? null, req.user?.id);
  }

  @Patch('organizations/:orgId/tasks/:id/start')
  async start(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: TaskAuthRequest) {
    return this.tasksService.startTask(orgId, id, req.user?.id);
  }

  @Patch('organizations/:orgId/tasks/:id/waiting')
  async waiting(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: TaskAuthRequest) {
    return this.tasksService.moveTaskToWaiting(orgId, id, req.user?.id);
  }

  @Patch('organizations/:orgId/tasks/:id/complete')
  async complete(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
    @Body() body: CompleteTaskDto,
  ) {
    return this.tasksService.completeTask(
      orgId,
      id,
      {
        resolutionNote: body.resolutionNote,
        resolutionCode: body.resolutionCode,
        actualCostCents: body.actualCostCents,
        overrideIncompleteChecklist: body.overrideIncompleteChecklist,
        overrideReason: body.overrideReason,
      },
      req.user?.id ? { id: req.user.id, platformRole: req.user.platformRole } : undefined,
    );
  }

  @Patch('organizations/:orgId/tasks/:id/cancel')
  async cancel(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: TaskAuthRequest) {
    return this.tasksService.cancelTask(orgId, id, req.user?.id);
  }

  @Post('organizations/:orgId/tasks/bulk')
  async bulkActions(
    @Param('orgId') orgId: string,
    @Req() req: TaskAuthRequest,
    @Body() body: BulkTaskActionDto,
  ) {
    return this.tasksService.bulkTaskActions(
      orgId,
      {
        taskIds: body.taskIds,
        action: body.action,
        assignedUserId: body.assignedUserId,
        priority: body.priority,
        dueDate: body.dueDate,
        dueDateShiftDays: body.dueDateShiftDays,
      },
      req.user?.id,
    );
  }

  // ─── Child resources ──────────────────────────────────────────────────────

  @Post('organizations/:orgId/tasks/:id/comments')
  async addComment(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
    @Body() body: AddCommentDto,
  ) {
    return this.tasksService.addComment(orgId, id, body.body, req.user?.id);
  }

  @Post('organizations/:orgId/tasks/:id/checklist')
  async addChecklistItem(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
    @Body() body: ChecklistItemDto,
  ) {
    return this.tasksService.addChecklistItem(
      orgId,
      id,
      {
        title: body.title,
        description: body.description,
        sortOrder: body.sortOrder,
        isRequired: body.isRequired,
      },
      req.user?.id,
    );
  }

  @Patch('organizations/:orgId/tasks/:id/checklist/:itemId')
  async updateChecklistItem(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Req() req: TaskAuthRequest,
    @Body() body: UpdateChecklistItemDto,
  ) {
    return this.tasksService.updateChecklistItem(orgId, id, itemId, body, req.user?.id);
  }

  @Post('organizations/:orgId/tasks/:id/attachments')
  async addAttachment(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: TaskAuthRequest,
    @Body() body: AddAttachmentDto,
  ) {
    return this.tasksService.addAttachment(orgId, id, body, req.user?.id);
  }

  // ─── Per-entity convenience routes ──────────────────────────────────────────

  @Get('organizations/:orgId/vehicles/:vehicleId/tasks')
  async vehicleTasks(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.tasksService.getTasksForVehicle(orgId, vehicleId);
  }

  @Get('organizations/:orgId/bookings/:bookingId/tasks')
  async bookingTasks(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.tasksService.getTasksForBooking(orgId, bookingId);
  }

  @Get('organizations/:orgId/vendors/:vendorId/tasks')
  async vendorTasks(@Param('orgId') orgId: string, @Param('vendorId') vendorId: string) {
    return this.tasksService.getTasksForVendor(orgId, vendorId);
  }

  @Get('organizations/:orgId/customers/:customerId/tasks')
  async customerTasks(@Param('orgId') orgId: string, @Param('customerId') customerId: string) {
    return this.tasksService.getTasksForCustomer(orgId, customerId);
  }
}
