import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { OperatorAppService } from './operator-app.service';
import type { OperatorProcess } from './operator-data.types';
import { buildContentDispositionInline } from '@modules/documents/storage/document-storage-content-disposition.util';

@Controller('organizations/:orgId/operator')
@UseGuards(OrgScopingGuard, PermissionsGuard, RolesGuard)
export class OperatorAppController {
  constructor(private readonly operatorApp: OperatorAppService) {}

  @Get('bookings/:bookingId/context')
  @RequirePermission('bookings', 'read')
  getBookingContext(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Query('process') process: OperatorProcess,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.getBookingContext(orgId, bookingId, process ?? 'PICKUP', {
      userId: user.id,
      membershipRole: user.membershipRole,
      platformRole: user.platformRole,
    });
  }

  @Get('handover-sessions/:sessionId/resume')
  @RequirePermission('bookings', 'read')
  getHandoverSessionResume(
    @Param('orgId') orgId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.getHandoverSessionResume(orgId, sessionId, {
      userId: user.id,
      membershipRole: user.membershipRole,
      platformRole: user.platformRole,
    });
  }

  @Get('vehicles/:vehicleId/resume')
  @RequirePermission('bookings', 'read')
  getVehicleResume(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.getVehicleResume(orgId, vehicleId, {
      userId: user.id,
      membershipRole: user.membershipRole,
      platformRole: user.platformRole,
    });
  }

  @Get('customers/search')
  @RequirePermission('bookings', 'read')
  searchCustomers(
    @Param('orgId') orgId: string,
    @Query('q') q: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.searchCustomers(
      orgId,
      q ?? '',
      limit ? Number(limit) : 10,
      {
        userId: user.id,
        membershipRole: user.membershipRole,
        platformRole: user.platformRole,
      },
    );
  }

  @Get('customers/:customerId/summary')
  @RequirePermission('bookings', 'read')
  getCustomerSummary(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.getCustomerSummary(orgId, customerId, {
      userId: user.id,
      membershipRole: user.membershipRole,
      platformRole: user.platformRole,
    });
  }

  @Post('customers/:customerId/documents/:documentId/preview-grant')
  @RequirePermission('customers', 'read')
  grantCustomerDocumentPreview(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Query('process') process: OperatorProcess | undefined,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.grantCustomerDocumentPreview(
      orgId,
      customerId,
      documentId,
      process ?? null,
      {
        userId: user.id,
        membershipRole: user.membershipRole,
        platformRole: user.platformRole,
      },
    );
  }

  @Post('bookings/:bookingId/documents/:documentId/preview-grant')
  @RequirePermission('customers', 'read')
  grantBookingDocumentPreview(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Param('documentId') documentId: string,
    @Query('process') process: OperatorProcess | undefined,
    @CurrentUser() user: { id: string; membershipRole?: string; platformRole?: string },
  ) {
    return this.operatorApp.grantBookingDocumentPreview(
      orgId,
      bookingId,
      documentId,
      process ?? null,
      {
        userId: user.id,
        membershipRole: user.membershipRole,
        platformRole: user.platformRole,
      },
    );
  }

  @Get('preview/:token')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  async streamPreview(
    @Param('orgId') orgId: string,
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.operatorApp.streamPreview(orgId, token);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': buildContentDispositionInline(file.fileName),
    });
    return file.stream;
  }
}
