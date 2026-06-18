import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RolesGuard } from '@shared/auth/roles.guard';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { DocumentExtractionService } from './document-extraction.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ConfirmExtractionDto } from './dto/confirm-extraction.dto';
import { isAllowedMimeType } from './document-extraction.schemas';

const MAX_UPLOAD_BYTES =
  Math.max(1, parseInt(process.env.DOCUMENT_UPLOAD_MAX_MB || '10', 10)) * 1024 * 1024;

/**
 * AI Document Upload endpoints (vehicle-scoped, tenant-isolated).
 *
 * All routes are guarded by RolesGuard + VehicleOwnershipGuard (same as the rest
 * of vehicle-intelligence): the vehicle must belong to the caller's org, and
 * each extraction is additionally re-checked against the path vehicleId to
 * prevent cross-vehicle / cross-org access. Uploaded files are stored in PRIVATE
 * object storage and are never exposed via public URLs.
 */
@Controller('vehicles/:vehicleId/document-extractions')
@UseGuards(RolesGuard, VehicleOwnershipGuard)
export class DocumentExtractionController {
  constructor(private readonly service: DocumentExtractionService) {}

  @Get()
  list(@Param('vehicleId') vehicleId: string) {
    return this.service.listForVehicle(vehicleId);
  }

  @Get(':extractionId')
  getOne(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
  ) {
    return this.service.getPublicForVehicle(vehicleId, extractionId);
  }

  /** Real multipart upload → store + create record + enqueue extraction job. */
  @Post('upload')
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
    @CurrentUser('id') userId: string | undefined,
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
      userId: userId ?? null,
    });
    return { id: record.id, status: record.status, documentType: record.documentType };
  }

  /** Legacy client-supplied create (no file). Kept for backward compatibility. */
  @Post()
  createLegacy(
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: { documentType: string; extractedData?: any; sourceFileName?: string; sourceFileUrl?: string },
  ) {
    return this.service.createLegacy(vehicleId, body);
  }

  @Post(':extractionId/retry')
  retry(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
  ) {
    return this.service.retry(vehicleId, extractionId);
  }

  @Post(':extractionId/confirm')
  confirm(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
    @Body() body: ConfirmExtractionDto,
  ) {
    return this.service.confirm(vehicleId, extractionId, body.confirmedData);
  }

  @Delete(':extractionId/file')
  deleteFile(
    @Param('vehicleId') vehicleId: string,
    @Param('extractionId') extractionId: string,
  ) {
    return this.service.deleteFile(vehicleId, extractionId);
  }
}
