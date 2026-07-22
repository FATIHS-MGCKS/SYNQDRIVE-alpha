import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireLegalDocumentPermission } from './decorators/require-legal-document-permission.decorator';
import { LegalDocumentEventsService } from './legal-document-events.service';
import { LegalDocumentsService } from './legal-documents.service';
import { isLegalPdfUpload } from './legal-documents.util';
import { LegalDocumentListQueryDto } from './dto/legal-document-list-query.dto';
import { LegalDocumentEventsQueryDto } from './dto/legal-document-events-query.dto';
import { UpdateLegalDocumentScopeDto } from './dto/legal-document-scope.dto';
import {
  LegalDocumentArchiveDto,
  LegalDocumentChangeSummaryDto,
  LegalDocumentRevokeDto,
  LegalDocumentScheduleDto,
} from './dto/legal-document-lifecycle.dto';
import { LegalDocumentValidationError } from './legal-documents-api.errors';

const MAX_LEGAL_BYTES =
  Math.max(1, parseInt(process.env.DOCUMENT_LEGAL_UPLOAD_MAX_MB || '15', 10)) * 1024 * 1024;

/**
 * Administration → Legal Documents (AGB / consumer information / privacy).
 *
 * Tenant isolation via OrgScopingGuard; capabilities via PermissionsGuard +
 * `@RequireLegalDocumentPermission`. ORG_ADMIN / MASTER_ADMIN retain access via
 * existing guard bypass rules. Files are private — never public URLs in JSON.
 */
@Controller('organizations/:orgId/legal-documents')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class LegalDocumentsController {
  constructor(
    private readonly legal: LegalDocumentsService,
    private readonly events: LegalDocumentEventsService,
  ) {}

  @Get()
  @RequireLegalDocumentPermission('legal_documents.view')
  async list(@Param('orgId') orgId: string, @Query() query: LegalDocumentListQueryDto) {
    return this.legal.listPaginated(orgId, query);
  }

  @Get('events')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  async listOrganizationEvents(
    @Param('orgId') orgId: string,
    @Query() query: LegalDocumentEventsQueryDto,
  ) {
    return this.events.listForOrganization(orgId, query);
  }

  @Post('upload')
  @RequireLegalDocumentPermission('legal_documents.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LEGAL_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!isLegalPdfUpload(file)) {
          cb(
            new LegalDocumentValidationError(
              'Legal documents must be PDF files',
              'file',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @Param('orgId') orgId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      documentType?: string;
      versionLabel?: string;
      title?: string;
      language?: string;
      changeSummary?: string;
      legalOwnerName?: string;
      legalVariant?: string;
      jurisdictionCountry?: string;
      customerSegment?: string;
      bookingChannel?: string;
      productScope?: string;
      stationScopeMode?: string;
      stationIds?: string;
      priority?: string;
      isMandatory?: string;
      noticePurpose?: string;
      validFrom?: string;
      validUntil?: string;
    },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new LegalDocumentValidationError('file is required', 'file');
    }
    if (!body.documentType) {
      throw new LegalDocumentValidationError('documentType is required', 'documentType');
    }
    if (!body.versionLabel) {
      throw new LegalDocumentValidationError('versionLabel is required', 'versionLabel');
    }
    const stationIds = body.stationIds
      ? body.stationIds.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const doc = await this.legal.upload({
      organizationId: orgId,
      documentType: body.documentType,
      versionLabel: body.versionLabel,
      title: body.title ?? null,
      language: body.language ?? 'de',
      fileName: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
      uploadedByUserId: userId ?? null,
      changeSummary: body.changeSummary ?? null,
      legalOwnerName: body.legalOwnerName ?? null,
      legalVariant: body.legalVariant ?? null,
      applicationScope: {
        language: body.language,
        jurisdictionCountry: body.jurisdictionCountry,
        customerSegment: body.customerSegment,
        bookingChannel: body.bookingChannel,
        productScope: body.productScope,
        stationScopeMode: body.stationScopeMode,
        stationIds,
        priority: body.priority != null ? Number(body.priority) : undefined,
        isMandatory: body.isMandatory != null ? body.isMandatory === 'true' : undefined,
        noticePurpose: body.noticePurpose,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
      },
      actor: this.actorFromRequest(req, userId, userName),
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Get(':id')
  @RequireLegalDocumentPermission('legal_documents.view')
  async getOne(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.legal.getDetail(orgId, id);
  }

  @Get(':id/events')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  async listDocumentEvents(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: LegalDocumentEventsQueryDto,
  ) {
    return this.events.listForDocument(orgId, id, query);
  }

  @Post(':id/submit-for-review')
  @RequireLegalDocumentPermission('legal_documents.submit_review')
  async submitForReview(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: LegalDocumentChangeSummaryDto,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    const doc = await this.legal.submitForReview(orgId, id, {
      ...this.actorFromRequest(req, userId, userName),
      changeSummary: body.changeSummary,
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Post(':id/approve')
  @RequireLegalDocumentPermission('legal_documents.approve')
  async approve(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: LegalDocumentChangeSummaryDto,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    const doc = await this.legal.approve(orgId, id, {
      ...this.actorFromRequest(req, userId, userName),
      changeSummary: body.changeSummary,
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Post(':id/schedule')
  @RequireLegalDocumentPermission('legal_documents.schedule')
  async schedule(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: LegalDocumentScheduleDto,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    if (!body.validFrom) {
      throw new LegalDocumentValidationError('validFrom is required', 'validFrom');
    }
    const validFrom = new Date(body.validFrom);
    if (Number.isNaN(validFrom.getTime())) {
      throw new LegalDocumentValidationError('validFrom must be a valid ISO date', 'validFrom');
    }
    const doc = await this.legal.schedule(orgId, id, {
      validFrom,
      ...this.actorFromRequest(req, userId, userName),
      changeSummary: body.changeSummary,
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Patch(':id/application-scope')
  @RequireLegalDocumentPermission('legal_documents.manage_scope')
  async updateApplicationScope(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateLegalDocumentScopeDto,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    const doc = await this.legal.updateApplicationScope(orgId, id, {
      language: body.language,
      jurisdictionCountry: body.jurisdictionCountry,
      customerSegment: body.customerSegment,
      bookingChannel: body.bookingChannel,
      productScope: body.productScope,
      stationScopeMode: body.stationScopeMode,
      stationIds: body.stationIds,
      priority: body.priority,
      isMandatory: body.isMandatory,
      noticePurpose: body.noticePurpose,
      validFrom: body.validFrom,
      validUntil: body.validUntil,
      actor: this.actorFromRequest(req, userId, userName),
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Post(':id/activate')
  @RequireLegalDocumentPermission('legal_documents.activate')
  async activate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    const doc = await this.legal.activate(orgId, id, this.actorFromRequest(req, userId, userName));
    return this.legal.getDetail(orgId, doc.id);
  }

  @Post(':id/revoke')
  @RequireLegalDocumentPermission('legal_documents.revoke')
  async revoke(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: LegalDocumentRevokeDto,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    const doc = await this.legal.revoke(orgId, id, {
      ...this.actorFromRequest(req, userId, userName),
      statusReason: body.statusReason,
      changeSummary: body.changeSummary,
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Post(':id/archive')
  @RequireLegalDocumentPermission('legal_documents.archive')
  async archive(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: LegalDocumentArchiveDto,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    const doc = await this.legal.archive(orgId, id, {
      ...this.actorFromRequest(req, userId, userName),
      statusReason: body.statusReason,
      changeSummary: body.changeSummary,
    });
    return this.legal.getDetail(orgId, doc.id);
  }

  @Get(':id/download')
  @RequireLegalDocumentPermission('legal_documents.view')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const dl = await this.legal.getDownload(orgId, id);
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(dl.fileName)}"`,
    });
    return new StreamableFile(dl.stream);
  }

  private actorFromRequest(
    req: Request,
    userId?: string,
    userName?: string,
  ): { userId: string | null; displayName: string | null; correlationId: string | null } {
    return {
      userId: userId ?? null,
      displayName: userName?.trim() || null,
      correlationId: ((req as Request & { requestId?: string }).requestId ?? null) || null,
    };
  }
}
