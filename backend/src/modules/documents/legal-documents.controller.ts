import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
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
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { LegalDocumentEventsService } from './legal-document-events.service';
import { LegalDocumentsService } from './legal-documents.service';
import { isLegalPdfUpload } from './legal-documents.util';

const MAX_LEGAL_BYTES =
  Math.max(1, parseInt(process.env.DOCUMENT_LEGAL_UPLOAD_MAX_MB || '15', 10)) * 1024 * 1024;

/**
 * Administration → Legal Documents (AGB / Widerrufsbelehrung).
 *
 * Reading is allowed for any org member; mutations (upload/activate/archive) are
 * restricted to ORG_ADMIN (and MASTER_ADMIN). OrgScopingGuard enforces tenant
 * isolation via the :orgId path param. Files are private — never public URLs.
 */
@Controller('organizations/:orgId/legal-documents')
@UseGuards(OrgScopingGuard, RolesGuard)
export class LegalDocumentsController {
  constructor(
    private readonly legal: LegalDocumentsService,
    private readonly events: LegalDocumentEventsService,
  ) {}

  @Get()
  async list(@Param('orgId') orgId: string) {
    const docs = await this.legal.list(orgId);
    return docs.map((d) => this.legal.toDto(d));
  }

  @Get('events')
  async listOrganizationEvents(
    @Param('orgId') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('legalDocumentId') legalDocumentId?: string,
    @Query('eventType') eventType?: string,
  ) {
    const result = await this.events.listForOrganization(orgId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      legalDocumentId: legalDocumentId || undefined,
      eventType: eventType || undefined,
    });
    return {
      ...result,
      data: result.data,
    };
  }

  @Post('upload')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LEGAL_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!isLegalPdfUpload(file)) {
          cb(new BadRequestException('Legal documents must be PDF files'), false);
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
    },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('file is required');
    if (!body.documentType) throw new BadRequestException('documentType is required');
    if (!body.versionLabel) throw new BadRequestException('versionLabel is required');
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
      actor: this.actorFromRequest(req, userId, userName),
    });
    return this.legal.toDto(doc);
  }

  @Get(':id/events')
  async listDocumentEvents(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.events.listForDocument(orgId, id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return result;
  }

  @Post(':id/submit-for-review')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async submitForReview(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { changeSummary?: string },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    return this.legal.toDto(
      await this.legal.submitForReview(orgId, id, {
        ...this.actorFromRequest(req, userId, userName),
        changeSummary: body.changeSummary,
      }),
    );
  }

  @Post(':id/approve')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async approve(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { changeSummary?: string },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    return this.legal.toDto(
      await this.legal.approve(orgId, id, {
        ...this.actorFromRequest(req, userId, userName),
        changeSummary: body.changeSummary,
      }),
    );
  }

  @Post(':id/schedule')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async schedule(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { validFrom: string; changeSummary?: string },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    if (!body.validFrom) throw new BadRequestException('validFrom is required');
    const validFrom = new Date(body.validFrom);
    if (Number.isNaN(validFrom.getTime())) {
      throw new BadRequestException('validFrom must be a valid ISO date');
    }
    return this.legal.toDto(
      await this.legal.schedule(orgId, id, {
        validFrom,
        ...this.actorFromRequest(req, userId, userName),
        changeSummary: body.changeSummary,
      }),
    );
  }

  @Post(':id/activate')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async activate(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    return this.legal.toDto(
      await this.legal.activate(orgId, id, this.actorFromRequest(req, userId, userName)),
    );
  }

  @Post(':id/revoke')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async revoke(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { statusReason: string },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    return this.legal.toDto(
      await this.legal.revoke(orgId, id, {
        ...this.actorFromRequest(req, userId, userName),
        statusReason: body.statusReason,
      }),
    );
  }

  @Post(':id/archive')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async archive(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { statusReason?: string },
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('name') userName: string | undefined,
    @Req() req: Request,
  ) {
    return this.legal.toDto(
      await this.legal.archive(orgId, id, {
        ...this.actorFromRequest(req, userId, userName),
        statusReason: body.statusReason,
      }),
    );
  }

  @Get(':id/download')
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
