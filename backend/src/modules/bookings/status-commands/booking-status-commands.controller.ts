import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { BookingStatus } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { BookingAccessService } from '../booking-access.service';
import { BookingPermissionsGuard } from '../guards/booking-permissions.guard';
import { RequireBookingPermission } from '../decorators/require-booking-permission.decorator';
import { BookingStatusCommandService } from '../status-commands/booking-status-command.service';
import { toBookingStatusCommandResponse } from '../status-commands/booking-status-command.response';
import { NoShowBookingStatusCommandDto } from '../dto/status-commands/no-show-booking-status-command.dto';
import { CancelBookingStatusCommandDto } from '../dto/status-commands/cancel-booking-status-command.dto';
import { AdminOverrideBookingStatusDto } from '../dto/status-commands/admin-override-booking-status.dto';
import { resolveBookingRequestContext } from '../util/booking-request-context.util';

@Controller('organizations/:orgId/bookings/:id/status')
@UseGuards(OrgScopingGuard, RolesGuard, BookingPermissionsGuard)
export class BookingStatusCommandsController {
  constructor(
    private readonly statusCommands: BookingStatusCommandService,
    private readonly bookingAccess: BookingAccessService,
  ) {}

  @Post('confirm')
  @RequireBookingPermission('booking.confirm')
  async confirm(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null },
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.statusCommands.execute({
      organizationId: orgId,
      bookingId,
      command: 'CONFIRM',
      idempotencyKey: idempotencyKey ?? '',
      actor: this.actor(user),
    });
    return toBookingStatusCommandResponse(result);
  }

  @Post('cancel')
  @RequireBookingPermission('booking.cancel')
  async cancel(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CancelBookingStatusCommandDto,
    @Req() req: Request,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null },
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.statusCommands.execute({
      organizationId: orgId,
      bookingId,
      command: 'CANCEL',
      idempotencyKey: idempotencyKey ?? '',
      actor: this.actor(user),
      cancellation: {
        reasonCode: body.reasonCode,
        description: body.description ?? null,
        effectiveAt: body.effectiveAt ? new Date(body.effectiveAt) : new Date(),
      },
      requestContext: resolveBookingRequestContext(req),
    });
    return toBookingStatusCommandResponse(result);
  }

  @Post('no-show')
  @RequireBookingPermission('booking.mark_no_show')
  async markNoShow(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: NoShowBookingStatusCommandDto,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null },
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.statusCommands.execute({
      organizationId: orgId,
      bookingId,
      command: 'MARK_NO_SHOW',
      idempotencyKey: idempotencyKey ?? '',
      actor: this.actor(user),
      reason: body.reason ?? null,
    });
    return toBookingStatusCommandResponse(result);
  }

  @Post('activate')
  @RequireBookingPermission('booking.handover.perform')
  async activate(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null },
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.statusCommands.execute({
      organizationId: orgId,
      bookingId,
      command: 'ACTIVATE',
      idempotencyKey: idempotencyKey ?? '',
      actor: this.actor(user),
    });
    return toBookingStatusCommandResponse(result);
  }

  @Post('complete')
  @RequireBookingPermission('booking.handover.perform')
  async complete(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null },
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.statusCommands.execute({
      organizationId: orgId,
      bookingId,
      command: 'COMPLETE',
      idempotencyKey: idempotencyKey ?? '',
      actor: this.actor(user),
    });
    return toBookingStatusCommandResponse(result);
  }

  @Post('override')
  @RequireBookingPermission('booking.override')
  async adminOverride(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: AdminOverrideBookingStatusDto,
    @Req() req: Request,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null },
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    const result = await this.statusCommands.execute({
      organizationId: orgId,
      bookingId,
      command: 'ADMIN_OVERRIDE',
      idempotencyKey: idempotencyKey ?? '',
      actor: this.actor(user),
      requestContext: resolveBookingRequestContext(req),
      override: {
        toStatus: body.toStatus as BookingStatus,
        reason: body.reason,
        hasPermission: true,
        affectedInvariants: body.affectedInvariants,
        approvalRequestId: body.approvalRequestId ?? null,
      },
    });
    return toBookingStatusCommandResponse(result);
  }

  private actor(user: {
    id?: string;
    displayName?: string | null;
    name?: string | null;
  }) {
    return {
      userId: user?.id ?? null,
      displayName: user?.displayName ?? user?.name ?? null,
    };
  }
}
