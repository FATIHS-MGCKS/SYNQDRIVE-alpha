import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OperatorUploadKind } from '@prisma/client';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { OperatorUploadService } from './operator-upload.service';

interface RegisterOperatorUploadBody {
  clientUploadId: string;
  kind: OperatorUploadKind;
  bookingId: string;
  vehicleId: string;
  handoverSessionId?: string | null;
  handoverKind?: 'PICKUP' | 'RETURN' | null;
  fileName?: string | null;
  mimeType?: string | null;
  requiredForComplete?: boolean;
}

@Controller('organizations/:orgId/operator-uploads')
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
    @Body() body: RegisterOperatorUploadBody,
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

  @Get(':clientUploadId')
  @RequirePermission('bookings', 'read')
  get(@Param('orgId') orgId: string, @Param('clientUploadId') clientUploadId: string) {
    return this.uploads.getUpload(orgId, clientUploadId);
  }

  @Post(':clientUploadId/binary')
  @RequirePermission('bookings', 'write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
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
