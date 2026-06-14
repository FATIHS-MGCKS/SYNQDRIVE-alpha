import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { LegalDocumentsService } from './legal-documents.service';

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
  constructor(private readonly legal: LegalDocumentsService) {}

  @Get()
  async list(@Param('orgId') orgId: string) {
    const docs = await this.legal.list(orgId);
    return docs.map((d) => this.legal.toDto(d));
  }

  @Post('upload')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LEGAL_BYTES },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
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
    @Body() body: { documentType?: string; versionLabel?: string; title?: string; language?: string },
    @CurrentUser('id') userId: string | undefined,
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
    });
    return this.legal.toDto(doc);
  }

  @Post(':id/activate')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async activate(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.legal.toDto(await this.legal.activate(orgId, id));
  }

  @Post(':id/archive')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async archive(@Param('orgId') orgId: string, @Param('id') id: string) {
    return this.legal.toDto(await this.legal.archive(orgId, id));
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
}
