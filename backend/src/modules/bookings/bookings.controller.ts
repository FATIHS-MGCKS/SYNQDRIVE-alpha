import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  GoneException,
  Req,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { BookingAllowedDriversService } from './booking-allowed-drivers/booking-allowed-drivers.service';
import {
  AddBookingAllowedDriverDto,
  SetBookingPrimaryDriverDto,
} from './booking-allowed-drivers/dto/booking-allowed-drivers.dto';
import { BookingRentalEligibilityService } from './booking-rental-eligibility.service';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import {
  BookingRentalEligibilityBookingQueryDto,
  BookingRentalEligibilityCheckDto,
} from './dto/booking-rental-eligibility-check.dto';
import {
  BookingWizardDraftBodyDto,
  BookingWizardDraftConfirmDto,
  BookingWizardDraftUpdateDto,
} from './dto/booking-wizard-draft.dto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MarkBookingNoShowDto } from './dto/mark-booking-no-show.dto';
import { mapCreateBookingDtoToCommand } from './booking-command.mapper';
import { UpdateBookingScheduleDto } from './dto/updates/update-booking-schedule.dto';
import { UpdateBookingCustomerDto } from './dto/updates/update-booking-customer.dto';
import { UpdateBookingVehicleDto } from './dto/updates/update-booking-vehicle.dto';
import { UpdateBookingStationsDto } from './dto/updates/update-booking-stations.dto';
import { UpdateBookingNotesDto } from './dto/updates/update-booking-notes.dto';
import { UpdateBookingOptionsDto } from './dto/updates/update-booking-options.dto';
import { UpdateBookingAllowedDriversDto } from './dto/updates/update-booking-allowed-drivers.dto';
import {
  mapUpdateBookingAllowedDriversDtoToCommand,
  mapUpdateBookingCustomerDtoToCommand,
  mapUpdateBookingNotesDtoToCommand,
  mapUpdateBookingOptionsDtoToCommand,
  mapUpdateBookingScheduleDtoToCommand,
  mapUpdateBookingStationsDtoToCommand,
  mapUpdateBookingVehicleDtoToCommand,
} from './booking-update-command.mapper';
import { BookingUpdateService } from './booking-update.service';
import { CreateHandoverProtocolPayload } from './handover.types';
import { resolveHandoverActor } from './handover-actor.util';
import { RequireBookingPermission } from './decorators/require-booking-permission.decorator';
import { BookingPermissionsGuard } from './guards/booking-permissions.guard';
import { BookingAccessService } from './booking-access.service';
import { BookingResponseRedactionService } from './booking-response-redaction.service';
import { BookingPermissionService } from './booking-permission.service';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';

type BookingRequest = {
  user?: {
    id?: string;
    platformRole?: string;
    membershipRole?: MembershipRole;
    organizationId?: string;
  };
  bookingMembershipPermissions?: MembershipPermissionsMap;
  bookingMembershipRole?: MembershipRole;
};

@Controller('organizations/:orgId/bookings')
@UseGuards(OrgScopingGuard, RolesGuard, BookingPermissionsGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly handoverService: BookingsHandoverService,
    private readonly rentalEligibilityService: BookingRentalEligibilityService,
    private readonly wizardDraftService: BookingWizardDraftService,
    private readonly allowedDriversService: BookingAllowedDriversService,
    private readonly bookingAccess: BookingAccessService,
    private readonly bookingRedaction: BookingResponseRedactionService,
    private readonly bookingPermissions: BookingPermissionService,
    private readonly bookingUpdateService: BookingUpdateService,
  ) {}

  private updateContext(req: BookingRequest, userId?: string) {
    const perms = normalizeMembershipPermissions(req.bookingMembershipPermissions);
    return {
      userId: userId ?? null,
      hasOverridePermission: evaluateModulePermission(perms, 'bookings', 'manage'),
    };
  }

  private perms(req: BookingRequest) {
    return req.bookingMembershipPermissions ?? null;
  }

  @Get('today/pickups')
  @RequireBookingPermission('booking.read')
  async findTodaysPickups(
    @Param('orgId') orgId: string,
    @Req() req: BookingRequest,
  ) {
    const rows = await this.bookingsService.findTodaysPickups(orgId);
    return rows.map((row) =>
      this.bookingRedaction.redactBookingRow(row as Record<string, unknown>, this.perms(req)),
    );
  }

  @Get('today/returns')
  @RequireBookingPermission('booking.read')
  async findTodaysReturns(
    @Param('orgId') orgId: string,
    @Req() req: BookingRequest,
  ) {
    const rows = await this.bookingsService.findTodaysReturns(orgId);
    return rows.map((row) =>
      this.bookingRedaction.redactBookingRow(row as Record<string, unknown>, this.perms(req)),
    );
  }

  @Get('stats')
  @RequireBookingPermission('booking.read')
  async getStats(@Param('orgId') orgId: string, @Req() req: BookingRequest) {
    const stats = await this.bookingsService.getBookingStats(orgId);
    return this.bookingRedaction.redactStats(stats, this.perms(req));
  }

  @Get()
  @RequireBookingPermission('booking.read')
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: ListBookingsQueryDto,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    const scopeWhere = userId
      ? await this.bookingAccess.driverScopedWhereClause({
          orgId,
          userId,
          membershipRole: req.bookingMembershipRole,
          permissions: this.perms(req),
        })
      : null;

    const result = await this.bookingsService.findAll(orgId, query, {
      scopeWhere: scopeWhere ?? undefined,
    });

    if (Array.isArray(result)) {
      return result.map((row) =>
        this.bookingRedaction.redactBookingRow(row as Record<string, unknown>, this.perms(req)),
      );
    }

    if (result && typeof result === 'object' && Array.isArray((result as { data?: unknown[] }).data)) {
      const paginated = result as { data: Record<string, unknown>[]; meta?: unknown };
      return {
        ...paginated,
        data: paginated.data.map((row) =>
          this.bookingRedaction.redactBookingRow(row, this.perms(req)),
        ),
      };
    }

    return result;
  }

  @Post('eligibility-check')
  @RequireBookingPermission('booking.create')
  async checkRentalEligibility(
    @Param('orgId') orgId: string,
    @Body() body: BookingRentalEligibilityCheckDto,
  ) {
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
      vehicleId: body.vehicleId,
      customerId: body.customerId,
    });
    const startDate = new Date(body.startDate);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid startDate');
    }
    const endDate = body.endDate ? new Date(body.endDate) : undefined;
    return this.rentalEligibilityService.check({
      organizationId: orgId,
      vehicleId: body.vehicleId,
      customerId: body.customerId,
      startDate,
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined,
      paymentIntent: body.paymentIntent ?? body.paymentMethod,
      paymentMethod: body.paymentIntent ?? body.paymentMethod,
      foreignTravelRequested: body.foreignTravelRequested,
      additionalDriverCount: body.additionalDriverCount,
      depositReceived: body.depositReceived,
    });
  }

  @Post('wizard-draft')
  @RequireBookingPermission('booking.create')
  async createWizardDraft(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftBodyDto,
  ) {
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
      vehicleId: body.vehicleId,
      customerId: body.customerId,
      stationId: body.pickupStationId ?? body.returnStationId,
    });
    return this.wizardDraftService.createOrRefreshDraft(orgId, body, { userId });
  }

  @Patch('wizard-draft/:bookingId')
  @RequireBookingPermission('booking.update')
  async updateWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftUpdateDto,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.wizardDraftService.updateDraftQuote(orgId, bookingId, body, { userId });
  }

  @Get('wizard-draft/:bookingId/checkout-context')
  @RequireBookingPermission('booking.read')
  async getWizardCheckoutContext(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    if (userId) {
      await this.bookingAccess.assertDriverScopedBookingAccess({
        orgId,
        bookingId,
        userId,
        membershipRole: req.bookingMembershipRole,
        permissions: this.perms(req),
      });
    }
    return this.wizardDraftService.getCheckoutContext(orgId, bookingId);
  }

  @Post('wizard-draft/:bookingId/confirm')
  @RequireBookingPermission('booking.confirm')
  async confirmWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftConfirmDto,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.wizardDraftService.confirmDraft(orgId, bookingId, body, { userId });
  }

  @Post('wizard-draft/:bookingId/abort')
  @RequireBookingPermission('booking.cancel')
  async abortWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    return this.wizardDraftService.abortDraft(orgId, bookingId);
  }

  @Get(':id/rental-eligibility')
  @RequireBookingPermission('booking.read')
  async getBookingRentalEligibility(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: BookingRentalEligibilityBookingQueryDto,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    if (userId) {
      await this.bookingAccess.assertDriverScopedBookingAccess({
        orgId,
        bookingId: id,
        userId,
        membershipRole: req.bookingMembershipRole,
        permissions: this.perms(req),
      });
    }
    return this.rentalEligibilityService.checkForBooking(orgId, id, {
      paymentIntent: query.paymentIntent ?? query.paymentMethod,
      paymentMethod: query.paymentIntent ?? query.paymentMethod,
      foreignTravelRequested:
        query.foreignTravelRequested === true ||
        (query.foreignTravelRequested as unknown) === 'true',
      additionalDriverCount:
        query.additionalDriverCount != null
          ? Number(query.additionalDriverCount)
          : undefined,
      depositReceived:
        query.depositReceived === true ||
        (query.depositReceived as unknown) === 'true',
    });
  }

  @Get(':id/allowed-drivers')
  @RequireBookingPermission('booking.read_sensitive')
  async listAllowedDrivers(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    if (userId) {
      await this.bookingAccess.assertDriverScopedBookingAccess({
        orgId,
        bookingId: id,
        userId,
        membershipRole: req.bookingMembershipRole,
        permissions: this.perms(req),
      });
    }
    return this.allowedDriversService.listForBooking(orgId, id);
  }

  @Post(':id/allowed-drivers')
  @RequireBookingPermission('booking.update_customer')
  async addAllowedDriver(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: AddBookingAllowedDriverDto,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
      customerId: body.customerId,
    });
    return this.allowedDriversService.addAdditionalDriver({
      organizationId: orgId,
      bookingId: id,
      customerId: body.customerId,
      userId,
    });
  }

  @Patch(':id/primary-driver')
  @RequireBookingPermission('booking.update_customer')
  async setPrimaryDriver(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: SetBookingPrimaryDriverDto,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
      customerId: body.customerId,
    });
    return this.allowedDriversService.setPrimaryDriver({
      organizationId: orgId,
      bookingId: id,
      customerId: body.customerId,
      userId,
    });
  }

  @Delete(':id/allowed-drivers/:customerId')
  @RequireBookingPermission('booking.update_customer')
  async removeAllowedDriver(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('customerId') customerId: string,
    @CurrentUser('id') userId: string | undefined,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, { customerId });
    return this.allowedDriversService.removeAllowedDriver({
      organizationId: orgId,
      bookingId: id,
      customerId,
      userId,
    });
  }

  @Get('drivers/:customerId/conduct-history')
  @RequireBookingPermission('booking.read_sensitive')
  async getDriverConductHistory(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
    @Query('limit') limit?: string,
  ) {
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, { customerId });
    return this.allowedDriversService.getDriverConductHistory({
      organizationId: orgId,
      driverCustomerId: customerId,
      limit: limit != null ? Number(limit) : undefined,
    });
  }

  @Get(':id/detail')
  @RequireBookingPermission('booking.read')
  async findDetail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    if (userId) {
      await this.bookingAccess.assertDriverScopedBookingAccess({
        orgId,
        bookingId: id,
        userId,
        membershipRole: req.bookingMembershipRole,
        permissions: this.perms(req),
      });
    }
    const detail = await this.bookingsService.findDetail(orgId, id);
    if (!detail) throw new NotFoundException('Booking not found');
    return this.bookingRedaction.redactDetail(detail, this.perms(req));
  }

  @Get(':id')
  @RequireBookingPermission('booking.read')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    if (userId) {
      await this.bookingAccess.assertDriverScopedBookingAccess({
        orgId,
        bookingId: id,
        userId,
        membershipRole: req.bookingMembershipRole,
        permissions: this.perms(req),
      });
    }
    const booking = await this.bookingsService.findById(orgId, id);
    if (!booking) throw new NotFoundException('Booking not found');
    return this.bookingRedaction.redactBookingRow(
      booking as Record<string, unknown>,
      this.perms(req),
    );
  }

  @Post()
  @RequireBookingPermission('booking.create')
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: CreateBookingDto,
  ) {
    const command = mapCreateBookingDtoToCommand(body);
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
      vehicleId: command.vehicleId,
      customerId: command.customerId,
      stationId: command.pickupStationId ?? command.returnStationId,
    });
    return this.bookingsService.create(orgId, command, { userId });
  }

  @Patch(':id/schedule')
  @RequireBookingPermission('booking.update_schedule')
  async updateSchedule(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: UpdateBookingScheduleDto,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    const command = mapUpdateBookingScheduleDtoToCommand(body);
    return this.bookingUpdateService.updateSchedule(orgId, id, command, this.updateContext(req, userId));
  }

  @Patch(':id/customer')
  @RequireBookingPermission('booking.update_customer')
  async updateCustomer(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: UpdateBookingCustomerDto,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, { customerId: body.customerId });
    const command = mapUpdateBookingCustomerDtoToCommand(body);
    return this.bookingUpdateService.updateCustomer(orgId, id, command, this.updateContext(req, userId));
  }

  @Patch(':id/vehicle')
  @RequireBookingPermission('booking.update_vehicle')
  async updateVehicle(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: UpdateBookingVehicleDto,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    await this.bookingAccess.assertSecondaryResourceInOrg(orgId, { vehicleId: body.vehicleId });
    const command = mapUpdateBookingVehicleDtoToCommand(body);
    return this.bookingUpdateService.updateVehicle(orgId, id, command, this.updateContext(req, userId));
  }

  @Patch(':id/stations')
  @RequireBookingPermission('booking.update_stations')
  async updateStations(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: UpdateBookingStationsDto,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    const stationId = body.pickupStationId ?? body.returnStationId;
    if (stationId) {
      await this.bookingAccess.assertSecondaryResourceInOrg(orgId, { stationId });
    }
    const command = mapUpdateBookingStationsDtoToCommand(body);
    return this.bookingUpdateService.updateStations(orgId, id, command, this.updateContext(req, userId));
  }

  @Patch(':id/notes')
  @RequireBookingPermission('booking.update_notes')
  async updateNotes(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: UpdateBookingNotesDto,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    const command = mapUpdateBookingNotesDtoToCommand(body);
    return this.bookingUpdateService.updateNotes(orgId, id, command);
  }

  @Patch(':id/options')
  @RequireBookingPermission('booking.update_options')
  async updateOptions(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: UpdateBookingOptionsDto,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    const command = mapUpdateBookingOptionsDtoToCommand(body);
    return this.bookingUpdateService.updateOptions(orgId, id, command, this.updateContext(req, userId));
  }

  @Patch(':id/allowed-drivers')
  @RequireBookingPermission('booking.update_allowed_drivers')
  async updateAllowedDrivers(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: UpdateBookingAllowedDriversDto,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    const command = mapUpdateBookingAllowedDriversDtoToCommand(body);
    return this.bookingUpdateService.updateAllowedDrivers(orgId, id, command, this.updateContext(req, userId));
  }

  /** @deprecated Use action-specific PATCH routes (`/schedule`, `/customer`, etc.). */
  @Patch(':id')
  @RequireBookingPermission('booking.update')
  async update() {
    throw new GoneException({
      message:
        'Generic booking PATCH is removed. Use PATCH /bookings/:id/schedule|customer|vehicle|stations|notes|options|allowed-drivers',
      code: 'BOOKING_GENERIC_PATCH_REMOVED',
    });
  }

  @Delete(':id')
  @RequireBookingPermission('booking.cancel')
  async cancel(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    return this.bookingsService.cancel(orgId, id);
  }

  @Post(':id/no-show')
  @RequireBookingPermission('booking.mark_no_show')
  async markNoShow(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: MarkBookingNoShowDto,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, id);
    return this.bookingsService.markNoShow(orgId, id, body.reason ?? null);
  }

  @Get(':id/handover')
  @RequireBookingPermission('booking.handover.read')
  async listHandovers(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Req() req: BookingRequest,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    if (userId) {
      await this.bookingAccess.assertDriverScopedBookingAccess({
        orgId,
        bookingId,
        userId,
        membershipRole: req.bookingMembershipRole,
        permissions: this.perms(req),
      });
    }
    const protocols = await this.handoverService.findForBooking(orgId, bookingId);
    return this.bookingRedaction.redactHandoverList(protocols, this.perms(req));
  }

  @Post(':id/handover/pickup')
  @RequireBookingPermission('booking.handover.perform')
  async createPickupHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CreateHandoverProtocolPayload,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    if (body.actualStationId) {
      await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
        stationId: body.actualStationId,
      });
    }
    return this.handoverService.createHandover(
      orgId,
      bookingId,
      'PICKUP',
      body,
      resolveHandoverActor(user),
    );
  }

  @Post(':id/handover/return')
  @RequireBookingPermission('booking.handover.perform')
  async createReturnHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CreateHandoverProtocolPayload,
  ) {
    await this.bookingAccess.assertBookingInOrg(orgId, bookingId);
    if (body.actualStationId) {
      await this.bookingAccess.assertSecondaryResourceInOrg(orgId, {
        stationId: body.actualStationId,
      });
    }
    return this.handoverService.createHandover(
      orgId,
      bookingId,
      'RETURN',
      body,
      resolveHandoverActor(user),
    );
  }
}
