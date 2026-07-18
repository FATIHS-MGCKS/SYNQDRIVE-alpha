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
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { BookingsService } from './bookings.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { BookingAllowedDriversService } from './booking-allowed-drivers/booking-allowed-drivers.service';
import {
  assertCanManageBookingDrivers,
  assertCanReadBookingDrivers,
} from './booking-allowed-drivers/booking-allowed-drivers.policy';
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
import { Prisma } from '@prisma/client';
import { CreateHandoverProtocolPayload } from './handover.types';

@Controller('organizations/:orgId/bookings')
@UseGuards(OrgScopingGuard, RolesGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly handoverService: BookingsHandoverService,
    private readonly rentalEligibilityService: BookingRentalEligibilityService,
    private readonly wizardDraftService: BookingWizardDraftService,
    private readonly allowedDriversService: BookingAllowedDriversService,
  ) {}

  @Get('today/pickups')
  async findTodaysPickups(@Param('orgId') orgId: string) {
    return this.bookingsService.findTodaysPickups(orgId);
  }

  @Get('today/returns')
  async findTodaysReturns(@Param('orgId') orgId: string) {
    return this.bookingsService.findTodaysReturns(orgId);
  }

  @Get('stats')
  async getStats(@Param('orgId') orgId: string) {
    return this.bookingsService.getBookingStats(orgId);
  }

  @Get()
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.findAll(orgId, query);
  }

  @Post('eligibility-check')
  async checkRentalEligibility(
    @Param('orgId') orgId: string,
    @Body() body: BookingRentalEligibilityCheckDto,
  ) {
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
  async createWizardDraft(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftBodyDto,
  ) {
    return this.wizardDraftService.createOrRefreshDraft(orgId, body, { userId });
  }

  @Patch('wizard-draft/:bookingId')
  async updateWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftUpdateDto,
  ) {
    return this.wizardDraftService.updateDraftQuote(orgId, bookingId, body, { userId });
  }

  @Get('wizard-draft/:bookingId/checkout-context')
  async getWizardCheckoutContext(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.wizardDraftService.getCheckoutContext(orgId, bookingId);
  }

  @Post('wizard-draft/:bookingId/confirm')
  async confirmWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftConfirmDto,
  ) {
    return this.wizardDraftService.confirmDraft(orgId, bookingId, body, { userId });
  }

  @Post('wizard-draft/:bookingId/abort')
  async abortWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.wizardDraftService.abortDraft(orgId, bookingId);
  }

  @Get(':id/rental-eligibility')
  async getBookingRentalEligibility(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: BookingRentalEligibilityBookingQueryDto,
  ) {
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
  async listAllowedDrivers(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
  ) {
    assertCanReadBookingDrivers(membershipRole);
    return this.allowedDriversService.listForBooking(orgId, id);
  }

  @Post(':id/allowed-drivers')
  async addAllowedDriver(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
    @Body() body: AddBookingAllowedDriverDto,
  ) {
    assertCanManageBookingDrivers(membershipRole);
    return this.allowedDriversService.addAdditionalDriver({
      organizationId: orgId,
      bookingId: id,
      customerId: body.customerId,
      userId,
    });
  }

  @Patch(':id/primary-driver')
  async setPrimaryDriver(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
    @Body() body: SetBookingPrimaryDriverDto,
  ) {
    assertCanManageBookingDrivers(membershipRole);
    return this.allowedDriversService.setPrimaryDriver({
      organizationId: orgId,
      bookingId: id,
      customerId: body.customerId,
      userId,
    });
  }

  @Delete(':id/allowed-drivers/:customerId')
  async removeAllowedDriver(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('customerId') customerId: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
  ) {
    assertCanManageBookingDrivers(membershipRole);
    return this.allowedDriversService.removeAllowedDriver({
      organizationId: orgId,
      bookingId: id,
      customerId,
      userId,
    });
  }

  @Get('drivers/:customerId/conduct-history')
  async getDriverConductHistory(
    @Param('orgId') orgId: string,
    @Param('customerId') customerId: string,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
    @Query('limit') limit?: string,
  ) {
    assertCanReadBookingDrivers(membershipRole);
    return this.allowedDriversService.getDriverConductHistory({
      organizationId: orgId,
      driverCustomerId: customerId,
      limit: limit != null ? Number(limit) : undefined,
    });
  }

  @Get(':id/detail')
  async findDetail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    const detail = await this.bookingsService.findDetail(orgId, id);
    if (!detail) throw new NotFoundException(`Booking ${id} not found`);
    return detail;
  }

  @Get(':id')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.findById(orgId, id);
  }

  @Post()
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: Omit<Prisma.BookingCreateInput, 'organization'>,
  ) {
    return this.bookingsService.create(orgId, body, { userId });
  }

  @Patch(':id')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: Prisma.BookingUpdateInput,
  ) {
    return this.bookingsService.update(orgId, id, body, { userId });
  }

  @Delete(':id')
  async cancel(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.cancel(orgId, id);
  }

  // V4.6.81 — No-show transition (distinct from cancel). Surfaced as a
  // first-class action so operators can close out a booking whose
  // customer failed to appear, without overloading the generic cancel
  // path. See BookingsService.markNoShow for the guardrails.
  @Post(':id/no-show')
  async markNoShow(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: { reason?: string | null } = {},
  ) {
    return this.bookingsService.markNoShow(orgId, id, body?.reason ?? null);
  }

  // V4.6.75 — Handover routes (pickup + return).
  // Transition the booking through its operational lifecycle and persist the
  // formal protocol (odometer, fuel/SoC, cleanliness + warning-light checks,
  // customer + staff signature, noted damage ids).
  @Get(':id/handover')
  async listHandovers(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
  ) {
    return this.handoverService.findForBooking(orgId, bookingId);
  }

  @Post(':id/handover/pickup')
  async createPickupHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Body() body: CreateHandoverProtocolPayload,
  ) {
    return this.handoverService.createHandover(orgId, bookingId, 'PICKUP', body);
  }

  @Post(':id/handover/return')
  async createReturnHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Body() body: CreateHandoverProtocolPayload,
  ) {
    return this.handoverService.createHandover(orgId, bookingId, 'RETURN', body);
  }
}
