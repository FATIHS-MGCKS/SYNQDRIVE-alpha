import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { AuditService } from '@modules/activity-log/audit.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { BookingDocumentBundleService } from './booking-document-bundle.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { SendBookingDocumentsEmailDto } from './dto/send-booking-documents-email.dto';

interface AuthedRequest {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Booking document lifecycle + document download/metadata/void.
 *
 * All routes are org-scoped (OrgScopingGuard validates the :orgId path against
 * the caller's JWT). Generated PDFs are served only here, authenticated — never
 * via a public URL. Downloads serve the STORED file (no silent regeneration).
 */
@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly bundle: BookingDocumentBundleService,
    private readonly generated: GeneratedDocumentsService,
    private readonly bookingDocumentEmail: BookingDocumentEmailService,
  ) {}

  @Get('bookings/:bookingId/documents')
  getBookingDocuments(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.bundle.getBundleView(orgId, bookingId);
  }

  @Post('bookings/:bookingId/documents/generate-initial-bundle')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  generateInitialBundle(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.bundle.generateInitialBundle(orgId, bookingId, userId ?? null);
  }

  @Post('bookings/:bookingId/documents/regenerate/:documentType')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  regenerate(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('documentType') documentType: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.bundle.regenerate(orgId, bookingId, documentType, userId ?? null);
  }

  @Post('bookings/:bookingId/documents/send-email')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN', 'SUB_ADMIN', 'WORKER')
  sendBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: SendBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string,
    @Req() req: AuthedRequest,
  ) {
    const ctx = AuditService.contextFromRequest(req);
    return this.bookingDocumentEmail.sendBookingDocumentsEmail(
      orgId,
      bookingId,
      dto,
      userId,
      {
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        route: 'POST /organizations/:orgId/bookings/:bookingId/documents/send-email',
      },
    );
  }

  @Get('documents/:documentId/metadata')
  async metadata(@Param('orgId') orgId: string, @Param('documentId') documentId: string) {
    return this.generated.toDto(await this.generated.getById(orgId, documentId));
  }

  @Post('documents/:documentId/void')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  async void(@Param('orgId') orgId: string, @Param('documentId') documentId: string) {
    return this.generated.toDto(await this.generated.voidDocument(orgId, documentId));
  }

  @Get('documents/:documentId/download')
  @Header('Cache-Control', 'no-store')
  async download(
    @Param('orgId') orgId: string,
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const dl = await this.generated.getDownload(orgId, documentId);
    res.set({
      'Content-Type': dl.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(dl.fileName)}"`,
    });
    return new StreamableFile(dl.stream);
  }
}
