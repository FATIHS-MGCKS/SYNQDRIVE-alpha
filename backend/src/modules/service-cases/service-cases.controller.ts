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
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { ServiceCasesService } from './service-cases.service';
import {
  AddServiceCaseAttachmentDto,
  AddServiceCaseCommentDto,
  CompleteServiceCaseDto,
  CreateServiceCaseDto,
  ListServiceCasesQueryDto,
  UpdateServiceCaseDto,
} from './dto';

interface AuthRequest extends Request {
  user?: { id?: string };
}

@Controller()
@UseGuards(OrgScopingGuard, RolesGuard)
export class ServiceCasesController {
  constructor(private readonly serviceCases: ServiceCasesService) {}

  @Get('organizations/:orgId/service-cases')
  async list(@Param('orgId') orgId: string, @Query() query: ListServiceCasesQueryDto) {
    return this.serviceCases.list(orgId, query);
  }

  @Get('organizations/:orgId/service-cases/:id')
  async getOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.serviceCases.getById(orgId, id);
  }

  @Post('organizations/:orgId/service-cases')
  async create(
    @Param('orgId') orgId: string,
    @Req() req: AuthRequest,
    @Body() body: CreateServiceCaseDto,
  ) {
    return this.serviceCases.create(orgId, body, req.user?.id);
  }

  @Patch('organizations/:orgId/service-cases/:id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: UpdateServiceCaseDto,
  ) {
    return this.serviceCases.update(orgId, id, body, req.user?.id);
  }

  @Patch('organizations/:orgId/service-cases/:id/complete')
  async complete(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() body: CompleteServiceCaseDto,
  ) {
    return this.serviceCases.complete(orgId, id, body, req.user?.id);
  }

  @Patch('organizations/:orgId/service-cases/:id/cancel')
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

  @Get('organizations/:orgId/vehicles/:vehicleId/service-cases')
  async vehicleCases(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query() query: ListServiceCasesQueryDto,
  ) {
    return this.serviceCases.listForVehicle(orgId, vehicleId, query);
  }

  @Get('organizations/:orgId/vendors/:vendorId/service-cases')
  async vendorCases(
    @Param('orgId') orgId: string,
    @Param('vendorId') vendorId: string,
    @Query() query: ListServiceCasesQueryDto,
  ) {
    return this.serviceCases.listForVendor(orgId, vendorId, query);
  }
}
