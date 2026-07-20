import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequireServiceCasePermission } from './decorators/require-service-case-permission.decorator';
import { resolveServiceCaseActor } from './service-case-auth-actor.util';
import {
  hasServiceCaseCostMutation,
  hasServiceCaseScheduleMutation,
} from './service-case-mutation.util';
import { ServiceCasePermissionService } from './service-case-permission.service';
import { ServiceCaseTaskLinkService } from './service-case-task-link.service';
import { ServiceCasesService } from './service-cases.service';
import {
  AddServiceCaseAttachmentDto,
  AddServiceCaseCommentDto,
  CompleteServiceCaseDto,
  CreateServiceCaseDto,
  CreateServiceCaseTaskDto,
  ListServiceCasesQueryDto,
  UpdateServiceCaseDto,
} from './dto';

interface AuthRequest extends Request {
  user?: { id?: string; platformRole?: string; organizationId?: string };
}

@Controller()
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class ServiceCasesController {
  constructor(
    private readonly serviceCases: ServiceCasesService,
    private readonly serviceCasePermissionService: ServiceCasePermissionService,
    private readonly serviceCaseTaskLinks: ServiceCaseTaskLinkService,
  ) {}

  @Get('organizations/:orgId/service-cases')
  @RequireServiceCasePermission('service_cases.read')
  async list(@Param('orgId') orgId: string, @Query() query: ListServiceCasesQueryDto) {
    return this.serviceCases.list(orgId, query);
  }

  @Get('organizations/:orgId/service-cases/:id')
  @RequireServiceCasePermission('service_cases.read')
  async getOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.serviceCases.getById(orgId, id);
  }

  @Post('organizations/:orgId/service-cases')
  @RequireServiceCasePermission('service_cases.create')
  async create(
    @Param('orgId') orgId: string,
    @Req() req: AuthRequest,
    @Body() body: CreateServiceCaseDto,
  ) {
    const actor = resolveServiceCaseActor(req.user);
    if (hasServiceCaseScheduleMutation(body)) {
      await this.serviceCasePermissionService.assert(actor, orgId, 'service_cases.schedule');
    }
    if (hasServiceCaseCostMutation({ estimatedCostCents: body.estimatedCostCents, metadata: body.metadata })) {
      await this.serviceCasePermissionService.assert(actor, orgId, 'service_cases.manage_costs');
    }

    return this.serviceCases.create(orgId, body, req.user?.id);
  }

  @Patch('organizations/:orgId/service-cases/:id')
  @RequireServiceCasePermission('service_cases.update')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: UpdateServiceCaseDto,
  ) {
    const actor = resolveServiceCaseActor(req.user);
    if (body.status === 'COMPLETED' || body.status === 'CANCELLED') {
      throw new BadRequestException(
        'Terminal status changes must use the dedicated complete or cancel endpoints',
      );
    }
    if (hasServiceCaseScheduleMutation(body)) {
      await this.serviceCasePermissionService.assert(actor, orgId, 'service_cases.schedule');
    }
    if (hasServiceCaseCostMutation(body)) {
      await this.serviceCasePermissionService.assert(actor, orgId, 'service_cases.manage_costs');
    }
    if (body.blocksRental !== undefined) {
      await this.serviceCasePermissionService.assert(actor, orgId, 'service_cases.update');
    }

    return this.serviceCases.update(orgId, id, body, req.user?.id);
  }

  @Patch('organizations/:orgId/service-cases/:id/complete')
  @RequireServiceCasePermission('service_cases.complete')
  async complete(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CompleteServiceCaseDto,
  ) {
    const actor = resolveServiceCaseActor(req.user);
    if (body.actualCostCents !== undefined && body.actualCostCents !== null) {
      await this.serviceCasePermissionService.assert(actor, orgId, 'service_cases.manage_costs');
    }

    return this.serviceCases.complete(orgId, id, body, req.user?.id);
  }

  @Patch('organizations/:orgId/service-cases/:id/cancel')
  @RequireServiceCasePermission('service_cases.cancel')
  async cancel(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: AuthRequest) {
    return this.serviceCases.cancel(orgId, id, req.user?.id);
  }

  @Post('organizations/:orgId/service-cases/:id/comments')
  async addComment(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: AddServiceCaseCommentDto,
  ) {
    return this.serviceCases.addComment(orgId, id, body.body, req.user?.id);
  }

  @Post('organizations/:orgId/service-cases/:id/attachments')
  async addAttachment(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: AddServiceCaseAttachmentDto,
  ) {
    return this.serviceCases.addAttachment(orgId, id, body, req.user?.id);
  }

  @Post('organizations/:orgId/service-cases/:id/tasks')
  @RequireServiceCasePermission('service_cases.update')
  async createTask(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CreateServiceCaseTaskDto,
  ) {
    return this.serviceCaseTaskLinks.createTask(orgId, id, body, req.user?.id);
  }

  @Post('organizations/:orgId/service-cases/:id/tasks/:taskId/link')
  @RequireServiceCasePermission('service_cases.update')
  async linkTask(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.serviceCaseTaskLinks.linkTask(orgId, id, taskId, req.user?.id);
  }

  @Delete('organizations/:orgId/service-cases/:id/tasks/:taskId')
  @RequireServiceCasePermission('service_cases.update')
  async unlinkTask(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.serviceCaseTaskLinks.unlinkTask(orgId, id, taskId, req.user?.id);
  }

  @Get('organizations/:orgId/vehicles/:vehicleId/service-cases')
  @RequireServiceCasePermission('service_cases.read')
  async vehicleCases(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query() query: ListServiceCasesQueryDto,
  ) {
    return this.serviceCases.listForVehicle(orgId, vehicleId, query);
  }

  @Get('organizations/:orgId/vendors/:vendorId/service-cases')
  @RequireServiceCasePermission('service_cases.read')
  async vendorCases(
    @Param('orgId') orgId: string,
    @Param('vendorId') vendorId: string,
    @Query() query: ListServiceCasesQueryDto,
  ) {
    return this.serviceCases.listForVendor(orgId, vendorId, query);
  }
}
