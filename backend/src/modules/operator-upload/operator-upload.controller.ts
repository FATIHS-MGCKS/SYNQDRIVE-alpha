import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { buildContentDispositionInline } from '@modules/documents/storage/document-storage-content-disposition.util';
import { OPERATOR_UPLOAD_MAX_BYTES } from './operator-upload.constants';
import { OperatorUploadMulterExceptionFilter } from './operator-upload-multer.filter';
import { OperatorUploadService } from './operator-upload.service';
import { RegisterOperatorUploadDto } from './register-operator-upload.dto';

@Controller('organizations/:orgId/operator-uploads')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class OperatorUploadController {
  constructor(private readonly uploads: OperatorUploadService) {}

  @Get('sessions/:handoverSessionId')
  @RequirePermission('bookings', 'read')
  listBySession(
    @Param('orgId') orgId: string,
    @Param('handoverSessionId') handoverSessionId: string,
  ) {
    return this.uploads.listByHandoverSession(orgId, handoverSessionId);
  }

  @Post('cleanup-orphans')
  @RequirePermission('bookings', 'write')
  cleanupOrphans(@Param('orgId') orgId: string) {
    return this.uploads.cleanupOrphans(orgId).then((count) => ({ cleaned: count }));
  }

  @Post()
  @RequirePermission('bookings', 'write')
  register(
    @Param('orgId') orgId: string,
    @CurrentUser() user: { id?: string },
    @Body() body: RegisterOperatorUploadDto,
  ) {
    return this.uploads.registerUpload({
      organizationId: orgId,
      clientUploadId: body.clientUploadId,
      kind: body.kind,
      bookingId: body.bookingId,
      vehicleId: body.vehicleId,
      handoverSessionId: body.handoverSessionId ?? null,
      handoverKind: body.handoverKind ?? null,
      fileName: body.fileName ?? null,
      mimeType: body.mimeType ?? null,
      requiredForComplete: body.requiredForComplete ?? false,
      uploadedByUserId: user?.id ?? null,
    });
  }

  @Get(':clientUploadId/download')
  @RequirePermission('bookings', 'read')
  @Header('Cache-Control', 'private, no-store')
  async download(
    @Param('orgId') orgId: string,
    @Param('clientUploadId') clientUploadId: string,
  ): Promise<StreamableFile> {
    const { stream, fileName, mimeType } = await this.uploads.getAuthorizedDownloadStream(
      orgId,
      clientUploadId,
    );
    return new StreamableFile(stream as never, {
      type: mimeType,
      disposition: buildContentDispositionInline(fileName),
    });
  }

  @Get(':clientUploadId')
  @RequirePermission('bookings', 'read')
  get(@Param('orgId') orgId: string, @Param('clientUploadId') clientUploadId: string) {
    return this.uploads.getUpload(orgId, clientUploadId);
  }

  @Post(':clientUploadId/binary')
  @RequirePermission('bookings', 'write')
  @UseFilters(OperatorUploadMulterExceptionFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: OPERATOR_UPLOAD_MAX_BYTES, files: 1 },
    }),
  )
  uploadBinary(
    @Param('orgId') orgId: string,
    @Param('clientUploadId') clientUploadId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: { id?: string },
  ) {
    if (!file?.buffer?.length) {
      return this.uploads.markFailed(orgId, clientUploadId, {
        code: 'OPERATOR_UPLOAD_VALIDATION',
        message: 'file is required',
        retryable: false,
      });
    }
    return this.uploads.uploadBinary({
      organizationId: orgId,
      clientUploadId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      fileName: file.originalname,
      uploadedByUserId: user?.id ?? null,
    });
  }

  @Post(':clientUploadId/cancel')
  @RequirePermission('bookings', 'write')
  cancel(@Param('orgId') orgId: string, @Param('clientUploadId') clientUploadId: string) {
    return this.uploads.cancelUpload(orgId, clientUploadId);
  }
}
