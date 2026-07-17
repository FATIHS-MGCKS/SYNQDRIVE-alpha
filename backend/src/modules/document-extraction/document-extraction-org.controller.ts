import {
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Body,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DocumentExtractionService } from './document-extraction.service';
import { DocumentExtractionApplyPlanService } from './document-extraction-apply-plan.service';
import { ListDocumentExtractionsQueryDto } from './dto/list-document-extractions-query.dto';
import { ReassignExtractionVehicleDto } from './dto/reassign-extraction-vehicle.dto';
import { DOCUMENT_UPLOAD_MODULE } from './document-extraction.constants';
import { buildContentDisposition } from './document-extraction-download.util';

/**
 * Organization-scoped document extraction history — tenant-isolated inbox for
 * reloadable "recent uploads" without relying on client-side React state.
 */
@Controller('organizations/:orgId/document-extractions')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DocumentExtractionOrgController {
  constructor(
    private readonly service: DocumentExtractionService,
    private readonly applyPlanService: DocumentExtractionApplyPlanService,
  ) {}

  @Get()
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  list(@Param('orgId') orgId: string, @Query() query: ListDocumentExtractionsQueryDto) {
    return this.service.listForOrg(orgId, query);
  }

  @Get(':extractionId/download')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('orgId') orgId: string,
    @Param('extractionId') extractionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const dl = await this.service.getDownloadForOrg(orgId, extractionId);
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': buildContentDisposition(dl.fileName, true),
      ...(dl.sizeBytes != null ? { 'Content-Length': String(dl.sizeBytes) } : {}),
    });
    return new StreamableFile(dl.stream);
  }

  @Get(':extractionId')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  getOne(@Param('orgId') orgId: string, @Param('extractionId') extractionId: string) {
    return this.service.getPublicForOrg(orgId, extractionId);
  }

  @Post(':extractionId/action-plan')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  dryRunActionPlan(
    @Param('orgId') orgId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.applyPlanService.dryRunActionPlan(orgId, extractionId, userId ?? null);
  }

  @Patch(':extractionId/vehicle')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  reassignVehicle(
    @Param('orgId') orgId: string,
    @Param('extractionId') extractionId: string,
    @Body() body: ReassignExtractionVehicleDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.service.reassignVehicleForOrg(orgId, extractionId, body.vehicleId, userId ?? null);
  }
}
