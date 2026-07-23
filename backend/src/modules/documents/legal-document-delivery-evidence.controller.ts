import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireLegalDocumentPermission } from './decorators/require-legal-document-permission.decorator';
import { LegalDocumentDeliveryEvidenceService } from './legal-document-delivery-evidence.service';
import {
  RecordLegalDocumentAcknowledgmentBodyDto,
  RecordLegalDocumentPresentationBodyDto,
  UpdateLegalDocumentDeliveryStatusBodyDto,
} from './dto/legal-document-delivery-evidence.dto';

/**
 * Booking-scoped legal document delivery evidence API (Prompt 18/32).
 *
 * Records presentation, delivery, and acknowledgment of legal TEXTS.
 * This is NOT a consent API — marketing/KYC/data-processing consents
 * are managed in separate modules.
 */
@Controller('organizations/:orgId/bookings/:bookingId/legal-delivery-evidence')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class LegalDocumentDeliveryEvidenceController {
  constructor(private readonly evidence: LegalDocumentDeliveryEvidenceService) {}

  @Get()
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  list(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.evidence.listForBooking(orgId, bookingId);
  }

  @Get(':evidenceId')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  getOne(
    @Param('orgId') orgId: string,
    @Param('evidenceId') evidenceId: string,
  ) {
    return this.evidence.getById(orgId, evidenceId);
  }

  @Post()
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  recordPresentation(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: RecordLegalDocumentPresentationBodyDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.evidence.recordPresentation(
      {
        organizationId: orgId,
        bookingId,
        customerId: body.customerId,
        legalDocumentId: body.legalDocumentId,
        generatedDocumentId: body.generatedDocumentId,
        deliveryChannel: body.deliveryChannel as never,
        recipientSnapshot: body.recipientSnapshot,
        requestId: body.requestId ?? null,
        outboundEmailId: body.outboundEmailId ?? null,
      },
      { userId: userId ?? null },
    );
  }

  @Patch(':evidenceId/delivery-status')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  updateDeliveryStatus(
    @Param('orgId') orgId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: UpdateLegalDocumentDeliveryStatusBodyDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.evidence.updateDeliveryStatus(
      {
        organizationId: orgId,
        evidenceId,
        deliveryStatus: body.deliveryStatus as never,
        outboundEmailId: body.outboundEmailId ?? null,
      },
      { userId: userId ?? null },
    );
  }

  @Post(':evidenceId/acknowledge')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  recordAcknowledgment(
    @Param('orgId') orgId: string,
    @Param('evidenceId') evidenceId: string,
    @Body() body: RecordLegalDocumentAcknowledgmentBodyDto,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.evidence.recordAcknowledgment(
      {
        organizationId: orgId,
        evidenceId,
        acknowledgmentMethod: body.acknowledgmentMethod as never,
        signatureReference: body.signatureReference ?? null,
      },
      { userId: userId ?? null },
    );
  }
}
