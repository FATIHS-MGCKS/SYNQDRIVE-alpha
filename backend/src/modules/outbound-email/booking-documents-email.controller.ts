import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { BookingAccessService } from '@modules/bookings/booking-access.service';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { BookingLegalDocumentEmailService } from './booking-legal-document-email.service';
import { SendBookingDocumentsEmailDto } from './dto/send-booking-documents-email.dto';
import { SendFrozenBookingDocumentsEmailDto } from './dto/send-frozen-booking-documents-email.dto';

@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class BookingDocumentsEmailController {
  constructor(
    private readonly bookingEmail: BookingDocumentEmailService,
    private readonly legalBookingEmail: BookingLegalDocumentEmailService,
    private readonly bookingAccess: BookingAccessService,
  ) {}

  @Post('bookings/:bookingId/documents/send-email')
  @RequirePermission('bookings-documents', 'write')
  async sendBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SendBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.bookingEmail.sendBookingDocuments(orgId, bookingId, userId ?? null, body);
  }

  @Post('bookings/:bookingId/legal-documents/send-email')
  @RequirePermission('bookings-documents', 'write')
  async sendFrozenLegalBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SendFrozenBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.legalBookingEmail.sendFrozenBookingDocuments(orgId, bookingId, userId ?? null, {
      ...body,
      includeAllRequired: !body.documentIds?.length,
    });
  }

  @Post('bookings/:bookingId/documents/send-email/:outboundEmailId/retry')
  @RequirePermission('bookings-documents', 'write')
  async retryBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('outboundEmailId') outboundEmailId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.legalBookingEmail.retryFailedSend(
      orgId,
      bookingId,
      outboundEmailId,
      userId ?? null,
    );
  }
}
