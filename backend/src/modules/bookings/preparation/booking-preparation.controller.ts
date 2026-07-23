import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { resolveHandoverActor } from '../handover-actor.util';
import { BookingPreparationStateService } from './booking-preparation-state.service';
import { BookingPreparationRecoveryService } from './booking-preparation-recovery.service';
import { BookingPreparationRetryDto } from './dto/booking-preparation-retry.dto';
import type { BookingPreparationArtifactType } from './booking-preparation.constants';

@Controller('organizations/:orgId/bookings/:bookingId/preparation')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BookingPreparationController {
  constructor(
    private readonly preparationState: BookingPreparationStateService,
    private readonly recovery: BookingPreparationRecoveryService,
  ) {}

  @Get()
  @RequirePermission('bookings', 'read')
  async getSnapshot(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.preparationState.getSnapshot(orgId, bookingId);
  }

  @Post('retry')
  @RequirePermission('bookings', 'manage')
  async retry(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: BookingPreparationRetryDto,
    @CurrentUser() user: { id: string; organizationId?: string },
  ) {
    const actor = resolveHandoverActor(user);
    return this.recovery.retryArtifact(
      orgId,
      bookingId,
      body.artifactType as BookingPreparationArtifactType,
      actor,
      body.idempotencyKey,
    );
  }
}
