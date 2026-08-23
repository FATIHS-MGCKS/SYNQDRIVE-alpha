import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireCommunicationPermission } from '@shared/decorators/require-communication-permission.decorator';
import { CommunicationAttachmentService } from './communication-attachment.service';
import { CommunicationAttachmentError } from './communication-attachment.errors';

interface AuthUser {
  id: string;
}

@Controller('organizations/:orgId/communication')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class CommunicationAttachmentController {
  constructor(private readonly attachments: CommunicationAttachmentService) {}

  @Post('conversations/:conversationId/attachments')
  @RequireCommunicationPermission('write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 16 * 1024 * 1024 },
    }),
  )
  async uploadAttachment(
    @Param('orgId') orgId: string,
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<import('./dto/communication-attachment.dto').CommunicationAttachmentDto> {
    if (!file?.buffer?.length) {
      throw CommunicationAttachmentError.emptyFile();
    }
    return this.attachments.uploadConversationAttachment(orgId, conversationId, String(user.id), {
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
  }

  @Get('attachments/:attachmentId/content')
  @RequireCommunicationPermission('read')
  async downloadAttachment(
    @Param('orgId') orgId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { attachment, stream } = await this.attachments.streamAttachmentContent(
      orgId,
      attachmentId,
      String(user.id),
    );

    const disposition =
      attachment.mediaType === 'IMAGE' && attachment.mimeType.startsWith('image/')
        ? 'inline'
        : 'attachment';

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', String(attachment.sizeBytes));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`,
    );

    stream.pipe(res);
  }
}
