import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { VehicleIdentityReviewService } from './vehicle-identity-review.service';
import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityManualDraftInput,
} from './vehicle-identity-review.types';

@Controller('organizations/:orgId/vehicles/:vehicleId/registration-identity-review')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class VehicleIdentityReviewController {
  constructor(private readonly service: VehicleIdentityReviewService) {}

  @Get()
  @RequirePermission('fleet-condition', 'read')
  getSnapshot(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Query('documentExtractionId') documentExtractionId?: string,
    @Query('vinMismatchAcknowledged') vinMismatchAcknowledged?: string,
  ) {
    return this.service.getReviewSnapshot(orgId, vehicleId, {
      documentExtractionId,
      vinMismatchAcknowledged: vinMismatchAcknowledged === 'true',
    });
  }

  @Post('reconcile')
  @RequirePermission('fleet-condition', 'read')
  reconcile(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      vinMismatchAcknowledged?: boolean;
    },
  ) {
    return this.service.getReviewSnapshot(orgId, vehicleId, {
      documentExtractionId: body.documentExtractionId,
      manual: body.manual ?? null,
      vinMismatchAcknowledged: body.vinMismatchAcknowledged,
    });
  }

  @Post('validate-confirmations')
  @RequirePermission('fleet-condition', 'write')
  validateConfirmations(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
    },
  ) {
    return this.service.validateConfirmations(orgId, vehicleId, body);
  }
}
