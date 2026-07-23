import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { BookingLegalDocumentEmailService } from './booking-legal-document-email.service';
import { SendBookingDocumentsEmailDto } from './dto/send-booking-documents-email.dto';
import { SendFrozenBookingDocumentsEmailDto } from './dto/send-frozen-booking-documents-email.dto';

@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard)
export class BookingDocumentsEmailController {
  constructor(
    private readonly bookingEmail: BookingDocumentEmailService,
    private readonly legalBookingEmail: BookingLegalDocumentEmailService,
  ) {}

  @Post('bookings/:bookingId/documents/send-email')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  sendBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SendBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.bookingEmail.sendBookingDocuments(orgId, bookingId, userId ?? null, body);
  }

  @Post('bookings/:bookingId/legal-documents/send-email')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  sendFrozenLegalBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SendFrozenBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.legalBookingEmail.sendFrozenBookingDocuments(orgId, bookingId, userId ?? null, {
      ...body,
      includeAllRequired: !body.documentIds?.length,
    });
  }

  @Post('bookings/:bookingId/documents/send-email/:outboundEmailId/retry')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
  retryBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('outboundEmailId') outboundEmailId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.legalBookingEmail.retryFailedSend(
      orgId,
      bookingId,
      outboundEmailId,
      userId ?? null,
    );
  }
}
