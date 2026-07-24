import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import {
  CreateProcessingActivityRegisterDto,
  CreateRegisterExportDto,
  ListProcessingActivityRegisterQueryDto,
  UpdateProcessingActivityRegisterDto,
} from './dto/processing-activity-register.dto';
import { ProcessingActivityRegisterExportService } from './processing-activity-register-export.service';
import { ProcessingActivityRegisterService } from './processing-activity-register.service';

@ApiTags('data-authorizations/processing-activity-register')
@Controller('organizations/:orgId/data-authorizations/processing-activity-register')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class ProcessingActivityRegisterController {
  constructor(
    private readonly register: ProcessingActivityRegisterService,
    private readonly exports: ProcessingActivityRegisterExportService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  private actorUserId(req: Request): string | undefined {
    return this.actor(req).id;
  }

  @Get()
  async list(
    @Param('orgId') orgId: string,
    @Query() query: ListProcessingActivityRegisterQueryDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_view');
    return this.register.list(orgId, query, this.actorUserId(req));
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateProcessingActivityRegisterDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_edit');
    return this.register.create(orgId, dto, this.actorUserId(req));
  }

  @Post('exports')
  async createExport(
    @Param('orgId') orgId: string,
    @Body() dto: CreateRegisterExportDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_export');
    return this.exports.createExport(orgId, dto, this.actorUserId(req));
  }

  @Get('exports/:exportId/download')
  async downloadExport(
    @Param('orgId') orgId: string,
    @Param('exportId') exportId: string,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_export');
    return this.exports.downloadExport(orgId, exportId, this.actorUserId(req));
  }

  @Get(':id')
  async get(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_view');
    return this.register.getById(orgId, id, this.actorUserId(req));
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProcessingActivityRegisterDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_edit');
    return this.register.update(orgId, id, dto, this.actorUserId(req));
  }

  @Get(':id/versions')
  async versions(@Param('orgId') orgId: string, @Param('id') id: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.register_view');
    return this.register.listVersions(orgId, id);
  }
}
