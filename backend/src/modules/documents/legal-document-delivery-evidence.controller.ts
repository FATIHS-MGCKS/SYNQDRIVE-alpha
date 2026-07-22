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
import { Roles } from '@shared/decorators/roles.decorator';
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
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
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
        documentType: body.documentType as never,
        versionLabel: body.versionLabel,
        language: body.language,
        checksum: body.checksum ?? null,
        deliveryChannel: body.deliveryChannel as never,
        deliveryStatus: body.deliveryStatus as never,
        recipientSnapshot: body.recipientSnapshot,
        requestId: body.requestId ?? null,
        outboundEmailId: body.outboundEmailId ?? null,
      },
      { userId: userId ?? null },
    );
  }

  @Patch(':evidenceId/delivery-status')
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
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
  @Roles('ORG_ADMIN', 'MASTER_ADMIN')
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
