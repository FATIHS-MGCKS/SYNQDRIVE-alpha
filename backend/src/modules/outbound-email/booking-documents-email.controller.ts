import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { BookingDocumentEmailService } from './booking-document-email.service';
import { SendBookingDocumentsEmailDto } from './dto/send-booking-documents-email.dto';

@Controller('organizations/:orgId')
@UseGuards(OrgScopingGuard, RolesGuard)
export class BookingDocumentsEmailController {
  constructor(private readonly bookingEmail: BookingDocumentEmailService) {}

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
}
