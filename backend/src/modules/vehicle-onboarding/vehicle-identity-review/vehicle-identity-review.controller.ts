import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { VehicleIdentityP3Service } from './vehicle-identity-p3.service';
import { VehicleIdentityReviewService } from './vehicle-identity-review.service';
import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityManualDraftInput,
} from './vehicle-identity-review.types';

@Controller('organizations/:orgId/vehicles/:vehicleId/registration-identity-review')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class VehicleIdentityReviewController {
  constructor(
    private readonly service: VehicleIdentityReviewService,
    private readonly p3Service: VehicleIdentityP3Service,
  ) {}

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

  @Post('ai-v2-preview')
  @RequirePermission('fleet-condition', 'write')
  previewAiV2(
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
    return this.p3Service.previewAiV2(orgId, vehicleId, body);
  }

  @Post('save')
  @RequirePermission('fleet-condition', 'write')
  saveIdentity(
    @Param('orgId') orgId: string,
    @Param('vehicleId') vehicleId: string,
    @Body()
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
      acceptSuggestedFieldKeys?: string[];
    },
  ) {
    return this.p3Service.saveIdentity(orgId, vehicleId, body);
  }

  @Get('provenance')
  @RequirePermission('fleet-condition', 'read')
  getProvenance(@Param('orgId') orgId: string, @Param('vehicleId') vehicleId: string) {
    return this.p3Service.getProvenance(orgId, vehicleId);
  }
}
