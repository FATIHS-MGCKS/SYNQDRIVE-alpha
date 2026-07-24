import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { DataProcessingAgreementService } from './data-processing-agreement.service';
import { DpaSubprocessorService } from './dpa-subprocessor.service';
import { PROCESSOR_DPA_CONFIG } from './processor-dpa.config';
import {
  ActivateDataProcessingAgreementDto,
  CreateDataProcessingAgreementDto,
  CreateDpaVersionDto,
  DpaSubprocessorDto,
  LinkDpaSharingAuthorizationDto,
  ReviewDpaSubprocessorDto,
  TerminateDataProcessingAgreementDto,
  UpdateDataProcessingAgreementDto,
  UpdateDpaSubprocessorDto,
} from './dto/processor-dpa.dto';

@ApiTags('data-authorizations/processor-dpa')
@Controller('organizations/:orgId/data-processing-agreements')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class ProcessorDpaController {
  constructor(
    private readonly dpa: DataProcessingAgreementService,
    private readonly subprocessors: DpaSubprocessorService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  @Get('config')
  async getConfig(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_view');
    return {
      ...PROCESSOR_DPA_CONFIG,
      transferMechanisms: [
        'NONE_REQUIRED',
        'ADEQUACY_DECISION',
        'STANDARD_CONTRACTUAL_CLAUSES',
        'BINDING_CORPORATE_RULES',
        'OTHER_APPROVED_MECHANISM',
        'NOT_ASSESSED',
      ],
      processorRoles: [
        'CONTROLLER',
        'PROCESSOR',
        'SUBPROCESSOR',
        'JOINT_CONTROLLER',
        'INDEPENDENT_RECIPIENT',
      ],
    };
  }

  @Get()
  async list(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_view');
    return this.dpa.list(orgId);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateDataProcessingAgreementDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_edit');
    return this.dpa.create(orgId, dto, this.actor(req).id);
  }

  @Get(':id')
  async get(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_view');
    return this.dpa.getById(orgId, id);
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDataProcessingAgreementDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_edit');
    return this.dpa.update(orgId, id, dto, this.actor(req).id);
  }

  @Post(':id/activate')
  async activate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: ActivateDataProcessingAgreementDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_approve');
    return this.dpa.activate(orgId, id, dto, this.actor(req).id!);
  }

  @Post(':id/terminate')
  async terminate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: TerminateDataProcessingAgreementDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_approve');
    return this.dpa.terminate(orgId, id, dto, this.actor(req).id!);
  }

  @Post(':id/versions')
  async createVersion(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: CreateDpaVersionDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_edit');
    return this.dpa.createVersion(orgId, id, dto, this.actor(req).id);
  }

  @Post(':id/sharing-links')
  async linkSharing(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: LinkDpaSharingAuthorizationDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_edit');
    return this.dpa.linkSharingAuthorization(orgId, id, dto, this.actor(req).id);
  }

  @Post(':id/subprocessors')
  async addSubprocessor(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: DpaSubprocessorDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_edit');
    return this.subprocessors.add(orgId, id, dto, this.actor(req).id);
  }

  @Patch(':id/subprocessors/:subprocessorId')
  async updateSubprocessor(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('subprocessorId') subprocessorId: string,
    @Body() dto: UpdateDpaSubprocessorDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_edit');
    return this.subprocessors.update(orgId, id, subprocessorId, dto, this.actor(req).id);
  }

  @Post(':id/subprocessors/:subprocessorId/review')
  async reviewSubprocessor(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('subprocessorId') subprocessorId: string,
    @Body() dto: ReviewDpaSubprocessorDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.dpa_review');
    return this.subprocessors.review(orgId, id, subprocessorId, dto, this.actor(req).id!);
  }
}
