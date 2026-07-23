import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequireBookingLegalAcceptancePermission } from './decorators/require-booking-legal-acceptance-permission.decorator';
import { BookingLegalAcceptanceService } from './booking-legal-acceptance.service';
import {
  RecordBookingLegalAcceptanceBodyDto,
  RevokeBookingLegalConsentBodyDto,
} from './dto/booking-legal-acceptance.dto';

/**
 * Append-only booking legal acceptance API (Prompt 17).
 *
 * Records contract acceptance, privacy notice acknowledgment, optional consents,
 * rental contract signatures, and handover/return signatures as immutable events.
 */
@Controller('organizations/:orgId/bookings/:bookingId/legal-acceptances')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BookingLegalAcceptanceController {
  constructor(private readonly legalAcceptance: BookingLegalAcceptanceService) {}

  @Get()
  @RequireBookingLegalAcceptancePermission('booking_legal_acceptance.read')
  list(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.legalAcceptance.listForBooking(orgId, bookingId);
  }

  @Get(':acceptanceId')
  @RequireBookingLegalAcceptancePermission('booking_legal_acceptance.read')
  getOne(
    @Param('orgId') orgId: string,
    @Param('acceptanceId') acceptanceId: string,
  ) {
    return this.legalAcceptance.getById(orgId, acceptanceId);
  }

  @Post()
  @RequireBookingLegalAcceptancePermission('booking_legal_acceptance.record')
  record(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: RecordBookingLegalAcceptanceBodyDto,
  ) {
    return this.legalAcceptance.recordAcceptance({
      organizationId: orgId,
      bookingId,
      customerId: body.customerId,
      actor: { actorType: body.actorType, actorId: body.actorId ?? null },
      acceptanceType: body.acceptanceType,
      documentType: body.documentType,
      documentVersion: body.documentVersion,
      immutableDocumentHash: body.immutableDocumentHash,
      language: body.language,
      legalBasis: body.legalBasis,
      purpose: body.purpose ?? null,
      acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : undefined,
      source: body.source,
      legalDocumentId: body.legalDocumentId ?? null,
      generatedDocumentId: body.generatedDocumentId ?? null,
      handoverProtocolId: body.handoverProtocolId ?? null,
      requestId: body.requestId ?? null,
      metadata: body.metadata ?? null,
    });
  }

  @Post(':acceptanceId/revoke')
  @RequireBookingLegalAcceptancePermission('booking_legal_acceptance.record')
  revoke(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('acceptanceId') acceptanceId: string,
    @Body() body: RevokeBookingLegalConsentBodyDto,
  ) {
    return this.legalAcceptance.revokeConsent({
      organizationId: orgId,
      bookingId,
      customerId: body.customerId,
      actor: { actorType: body.actorType, actorId: body.actorId ?? null },
      acceptanceId,
      source: body.source,
      requestId: body.requestId ?? null,
      metadata: body.metadata ?? null,
    });
  }
}

@Controller('organizations/:orgId/customers/:customerId/legal-acceptances')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class CustomerLegalAcceptanceController {
  constructor(private readonly legalAcceptance: BookingLegalAcceptanceService) {}

  @Get()
  @RequireBookingLegalAcceptancePermission('booking_legal_acceptance.read')
  list(@Param('orgId') orgId: string, @Param('customerId') customerId: string) {
    return this.legalAcceptance.listForCustomer(orgId, customerId);
  }
}
