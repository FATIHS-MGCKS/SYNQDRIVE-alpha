import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireBookingSignaturePermission } from './decorators/require-booking-signature-permission.decorator';
import { BookingHandoverSignatureService } from './booking-handover-signature.service';

@Controller('organizations/:orgId/bookings/:bookingId/handover/signatures')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BookingHandoverSignatureController {
  constructor(private readonly signatures: BookingHandoverSignatureService) {}

  @Post(':signatureReferenceId/view-url')
  @RequireBookingSignaturePermission('booking.signature.read')
  createViewUrl(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('signatureReferenceId') signatureReferenceId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.signatures.createViewUrl(
      orgId,
      bookingId,
      signatureReferenceId,
      userId ?? null,
    );
  }

  @Get(':signatureReferenceId/summary')
  @RequireBookingSignaturePermission('booking.signature.read')
  getSummary(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('signatureReferenceId') signatureReferenceId: string,
  ) {
    return this.signatures.getSummary(orgId, bookingId, signatureReferenceId);
  }
}
