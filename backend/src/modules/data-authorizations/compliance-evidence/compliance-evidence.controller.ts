import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ComplianceEvidenceReportType } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { ComplianceEvidenceExportService } from './compliance-evidence-export.service';
import { ComplianceEvidenceService } from './compliance-evidence.service';
import {
  CreateComplianceEvidenceExportDto,
  ListComplianceEvidenceReportsQueryDto,
} from './dto/compliance-evidence.dto';

@ApiTags('data-authorizations/compliance-evidence')
@Controller('organizations/:orgId/data-authorizations/compliance-evidence')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class ComplianceEvidenceController {
  constructor(
    private readonly evidence: ComplianceEvidenceService,
    private readonly exports: ComplianceEvidenceExportService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id, platformRole: user?.platformRole };
  }

  @Get('config')
  async getConfig(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_view');
    return this.evidence.getConfig();
  }

  @Get('reports')
  async listReports(
    @Param('orgId') orgId: string,
    @Query() query: ListComplianceEvidenceReportsQueryDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_view');
    return this.evidence.listReports(orgId, query);
  }

  @Get('reports/:reportId')
  async getReport(
    @Param('orgId') orgId: string,
    @Param('reportId') reportId: string,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_view');
    return this.evidence.getReport(orgId, reportId);
  }

  @Get('audit-events')
  async listAudit(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_view');
    return this.evidence.listAuditEvents(orgId);
  }

  @Post('preview')
  async preview(
    @Param('orgId') orgId: string,
    @Body() body: { reportType: ComplianceEvidenceReportType; periodFrom?: string; periodTo?: string },
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_view');
    return this.evidence.previewPackage(orgId, body.reportType, body.periodFrom, body.periodTo);
  }

  @Post('exports')
  async createExport(
    @Param('orgId') orgId: string,
    @Body() dto: CreateComplianceEvidenceExportDto,
    @Req() req: Request,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_export');
    return this.exports.requestExport(orgId, dto, this.actor(req).id);
  }

  @Get('exports/:reportId/download')
  async downloadExport(
    @Param('orgId') orgId: string,
    @Param('reportId') reportId: string,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.evidence_export');
    return this.exports.downloadExport(orgId, reportId, this.actor(req).id);
  }
}
