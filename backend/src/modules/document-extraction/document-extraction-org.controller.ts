import {
  Controller,
  Get,
  Post,
  Header,
  Param,
  Patch,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Res,
  StreamableFile,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DocumentExtractionService } from './document-extraction.service';
import { ListDocumentExtractionsQueryDto } from './dto/list-document-extractions-query.dto';
import { ReassignExtractionVehicleDto } from './dto/reassign-extraction-vehicle.dto';
import { OrgUploadDocumentDto } from './dto/org-upload-document.dto';
import { DOCUMENT_UPLOAD_MODULE } from './document-extraction.constants';
import { buildContentDisposition } from './document-extraction-download.util';
import { isAllowedMimeType, resolveMaxUploadBytes } from './document-extraction.schemas';
import { resolveRequestClientIp } from './document-upload-rate-limit.service';

const MAX_UPLOAD_BYTES = resolveMaxUploadBytes();
const UPLOAD_IP_THROTTLE_LIMIT = parseInt(
  process.env.DOCUMENT_UPLOAD_THROTTLE_LIMIT_PER_IP || '40',
  10,
);
const UPLOAD_IP_THROTTLE_TTL_MS = parseInt(
  process.env.DOCUMENT_UPLOAD_THROTTLE_TTL_MS || '60000',
  10,
);

/**
 * Organization-scoped document extraction history — tenant-isolated inbox for
 * reloadable "recent uploads" without relying on client-side React state.
 */
@Controller('organizations/:orgId/document-extractions')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class DocumentExtractionOrgController {
  constructor(private readonly service: DocumentExtractionService) {}

  @Get()
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  list(@Param('orgId') orgId: string, @Query() query: ListDocumentExtractionsQueryDto) {
    return this.service.listForOrg(orgId, query);
  }

  @Post('upload')
  @Throttle({ default: { ttl: UPLOAD_IP_THROTTLE_TTL_MS, limit: UPLOAD_IP_THROTTLE_LIMIT } })
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!isAllowedMimeType(file.mimetype)) {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @Param('orgId') orgId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: OrgUploadDocumentDto,
    @CurrentUser() user: { id?: string; platformRole?: string } | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const record = await this.service.createFromOrgUpload({
      organizationId: orgId,
      requestedDocumentType: body.requestedDocumentType,
      optionalContextType: body.optionalContextType,
      optionalContextId: body.optionalContextId,
      sourceSurface: body.sourceSurface ?? body.source ?? 'org_inbox',
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      userId: user?.id ?? null,
      reuploadReason: body.reuploadReason,
      relatedExtractionId: body.relatedExtractionId,
      invoiceNumberHint: body.invoiceNumberHint,
      referenceNumberHint: body.referenceNumberHint,
      clientIp: resolveRequestClientIp(req),
      uploadSource: body.source ?? null,
      platformRole: user?.platformRole ?? null,
    });
    return this.service.toPublicExtraction(record);
  }

  @Get(':extractionId/download')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('orgId') orgId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser('id') userId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const dl = await this.service.getDownloadForOrg(orgId, extractionId, userId ?? null);
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
