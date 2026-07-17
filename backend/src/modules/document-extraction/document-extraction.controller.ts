import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Header,
  Res,
  StreamableFile,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DocumentExtractionService } from './document-extraction.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ConfirmExtractionDto } from './dto/confirm-extraction.dto';
import { SetDocumentTypeDto } from './dto/set-document-type.dto';
import { ListDocumentExtractionsQueryDto } from './dto/list-document-extractions-query.dto';
import { isAllowedMimeType, resolveMaxUploadBytes } from './document-extraction.schemas';
import { DOCUMENT_UPLOAD_MODULE } from './document-extraction.constants';
import { buildContentDisposition } from './document-extraction-download.util';
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
 * AI Document Upload endpoints (vehicle-scoped, tenant-isolated).
 */
@Controller('vehicles/:vehicleId/document-extractions')
@UseGuards(RolesGuard, VehicleOwnershipGuard, PermissionsGuard)
export class DocumentExtractionController {
  constructor(private readonly service: DocumentExtractionService) {}

  @Get()
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  list(
    @Param('vehicleId') vehicleId: string,
    @Query() query: ListDocumentExtractionsQueryDto,
  ) {
    return this.service.listForVehicle(vehicleId, query);
  }

  @Get(':extractionId/download')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const dl = await this.service.getDownloadForVehicle(vehicleId, extractionId);
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': buildContentDisposition(dl.fileName, true),
      ...(dl.sizeBytes != null ? { 'Content-Length': String(dl.sizeBytes) } : {}),
    });
    return new StreamableFile(dl.stream);
  }

  @Get(':extractionId')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'read')
  getOne(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
  ) {
    return this.service.getPublicForVehicle(vehicleId, extractionId);
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
    @Param('vehicleId') vehicleId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadDocumentDto,
    @CurrentUser() user: { id?: string; platformRole?: string } | undefined,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const record = await this.service.createFromUpload({
      vehicleId,
      documentType: body.documentType,
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

  @Post()
  createLegacy(
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: { documentType: string; extractedData?: any; sourceFileName?: string; sourceFileUrl?: string },
  ) {
    return this.service.createLegacy(vehicleId, body);
  }

  @Post(':extractionId/document-type')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  async setDocumentType(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @Body() body: SetDocumentTypeDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const record = await this.service.setDocumentType(
      vehicleId,
      extractionId,
      body.documentType,
      { reextract: body.reextract, userId: userId ?? null },
    );
    return this.service.toPublicExtraction(record);
  }

  @Post(':extractionId/retry')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  async retry(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const record = await this.service.retry(vehicleId, extractionId, userId ?? null);
    return this.service.toPublicExtraction(record);
  }

  @Post(':extractionId/confirm')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  async confirm(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @Body() body: ConfirmExtractionDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const record = await this.service.confirm(
      vehicleId,
      extractionId,
      body.confirmedData,
      userId ?? null,
    );
    return this.service.toPublicExtraction(record);
  }

  @Post(':extractionId/cancel')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  async cancel(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const record = await this.service.cancel(vehicleId, extractionId, userId ?? null);
    return this.service.toPublicExtraction(record);
  }

  @Delete(':extractionId/file')
  @RequirePermission(DOCUMENT_UPLOAD_MODULE, 'write')
  async deleteFile(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    const record = await this.service.deleteFile(vehicleId, extractionId, userId ?? null);
    return this.service.toPublicExtraction(record);
  }
}
