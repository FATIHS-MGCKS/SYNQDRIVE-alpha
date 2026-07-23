import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireLegalDocumentPermission } from '../decorators/require-legal-document-permission.decorator';
import { BookingLegalDocumentSnapshotService } from './booking-legal-document-snapshot.service';

@Controller('organizations/:orgId/bookings/:bookingId/legal-document-snapshots')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BookingLegalDocumentSnapshotController {
  constructor(private readonly snapshots: BookingLegalDocumentSnapshotService) {}

  @Get()
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  list(@Param('orgId') orgId: string, @Param('bookingId') bookingId: string) {
    return this.snapshots.listForBooking(orgId, bookingId);
  }

  @Get(':snapshotId')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  getOne(@Param('orgId') orgId: string, @Param('snapshotId') snapshotId: string) {
    return this.snapshots.getById(orgId, snapshotId);
  }

  @Post(':snapshotId/verify-integrity')
  @RequireLegalDocumentPermission('legal_documents.audit_view')
  verifyIntegrity(
    @Param('orgId') orgId: string,
    @Param('snapshotId') snapshotId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    return this.snapshots.verifySnapshotIntegrity(orgId, snapshotId, userId ?? null);
  }
}
