import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { BookingAccessService } from '@modules/bookings/booking-access.service';
import { BookingIdempotencyService } from '@modules/bookings/idempotency/booking-idempotency.service';
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
    private readonly bookingIdempotency: BookingIdempotencyService,
  ) {}

  @Post('bookings/:bookingId/documents/send-email')
  @RequirePermission('bookings-documents', 'write')
  async sendBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SendBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const key = this.bookingIdempotency.requireKey(idempotencyKey, 'BOOKING_DOCUMENT_EMAIL');

    const executed = await this.bookingIdempotency.execute({
      organizationId: orgId,
      actorUserId: userId ?? null,
      operation: 'BOOKING_DOCUMENT_EMAIL',
      idempotencyKey: key,
      resourceId: bookingId,
      fingerprintPayload: {
        bookingId,
        toEmail: body.toEmail,
        documentIds: body.documentIds,
        subject: body.subject,
      },
      handler: async () => {
        const result = await this.bookingEmail.sendBookingDocuments(
          orgId,
          bookingId,
          userId ?? null,
          { ...body, sendIdempotencyKey: key },
        );
        return { result, resultReference: bookingId };
      },
    });

    return executed.result;
  }

  @Post('bookings/:bookingId/legal-documents/send-email')
  @RequirePermission('bookings-documents', 'write')
  async sendFrozenLegalBookingDocumentsEmail(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: SendFrozenBookingDocumentsEmailDto,
    @CurrentUser('id') userId: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const key = this.bookingIdempotency.requireKey(idempotencyKey, 'BOOKING_DOCUMENT_EMAIL');

    const executed = await this.bookingIdempotency.execute({
      organizationId: orgId,
      actorUserId: userId ?? null,
      operation: 'BOOKING_DOCUMENT_EMAIL',
      idempotencyKey: key,
      resourceId: bookingId,
      fingerprintPayload: {
        bookingId,
        mode: 'frozen-legal',
        toEmail: body.toEmail,
        documentIds: body.documentIds ?? [],
        clientRequestId: body.clientRequestId ?? null,
      },
      handler: async () => {
        const result = await this.legalBookingEmail.sendFrozenBookingDocuments(
          orgId,
          bookingId,
          userId ?? null,
          {
            ...body,
            includeAllRequired: !body.documentIds?.length,
            clientRequestId: body.clientRequestId ?? key,
          },
        );
        return { result, resultReference: bookingId };
      },
    });

    return executed.result;
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
