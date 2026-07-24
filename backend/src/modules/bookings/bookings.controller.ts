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
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { mapGatekeeperToAuthoritativeRentalPreview } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.util';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import {
  BookingRentalEligibilityBookingQueryDto,
  BookingRentalEligibilityCheckDto,
} from './dto/booking-rental-eligibility-check.dto';
import {
  BookingWizardDraftBodyDto,
  BookingWizardDraftConfirmDto,
  BookingWizardDraftUpdateDto,
  BookingWizardEligibilityPreviewQueryDto,
} from './dto/booking-wizard-draft.dto';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequireBookingEligibilityPermission } from './decorators/require-booking-eligibility-permission.decorator';
import {
  CreateBookingEligibilityApprovalDto,
  DecideBookingEligibilityApprovalDto,
} from './booking-eligibility-approval/dto/booking-eligibility-approval.dto';
import { BookingEligibilityApprovalService } from './booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityDecisionService } from './booking-eligibility-decision/booking-eligibility-decision.service';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { toBookingCreateInput, toBookingUpdateInput } from './booking-input.sanitizer';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { CreateHandoverProtocolPayload } from './handover.types';
import { resolveHandoverActor } from './handover-actor.util';

@Controller('organizations/:orgId/bookings')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly handoverService: BookingsHandoverService,
    private readonly rentalEligibilityService: BookingRentalEligibilityService,
    private readonly eligibilityGatekeeper: BookingEligibilityGatekeeperService,
    private readonly wizardDraftService: BookingWizardDraftService,
    private readonly allowedDriversService: BookingAllowedDriversService,
    private readonly eligibilityApprovalService: BookingEligibilityApprovalService,
    private readonly eligibilityDecisionService: BookingEligibilityDecisionService,
  ) {}

  @Get('today/pickups')
  @RequirePermission('bookings', 'read')
  async findTodaysPickups(@Param('orgId') orgId: string) {
    return this.bookingsService.findTodaysPickups(orgId);
  }

  @Get('today/returns')
  @RequirePermission('bookings', 'read')
  async findTodaysReturns(@Param('orgId') orgId: string) {
    return this.bookingsService.findTodaysReturns(orgId);
  }

  @Get('stats')
  @RequirePermission('bookings', 'read')
  async getStats(@Param('orgId') orgId: string) {
    return this.bookingsService.getBookingStats(orgId);
  }

  @Get()
  @RequirePermission('bookings', 'read')
  async findAll(
    @Param('orgId') orgId: string,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.findAll(orgId, query);
  }

  @Post('eligibility-check')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async checkRentalEligibility(
    @Param('orgId') orgId: string,
    @Body() body: BookingRentalEligibilityCheckDto,
  ) {
    const startDate = new Date(body.startDate);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid startDate');
    }
    const endDate = body.endDate ? new Date(body.endDate) : undefined;
    const gateResult = await this.eligibilityGatekeeper.evaluate({
      organizationId: orgId,
      vehicleId: body.vehicleId,
      customerId: body.customerId,
      startDate,
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined,
      stage: 'PREVIEW',
      paymentIntent: body.paymentIntent ?? body.paymentMethod,
      foreignTravelRequested: body.foreignTravelRequested,
      additionalDriverCount: body.additionalDriverCount,
      depositReceived: body.depositReceived,
    });
    return mapGatekeeperToAuthoritativeRentalPreview(gateResult);
  }

  @Post('wizard-draft')
  @RequirePermission('bookings', 'write')
  async createWizardDraft(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftBodyDto,
  ) {
    return this.wizardDraftService.createOrRefreshDraft(orgId, body, { userId });
  }

  @Patch('wizard-draft/:bookingId')
  @RequirePermission('bookings', 'write')
  async updateWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftUpdateDto,
  ) {
    return this.wizardDraftService.updateDraftQuote(orgId, bookingId, body, { userId });
  }

  @Get('wizard-draft/:bookingId/checkout-context')
  @RequirePermission('bookings', 'read')
  async getWizardCheckoutContext(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.wizardDraftService.getCheckoutContext(orgId, bookingId);
  }

  @Get('wizard-draft/:bookingId/eligibility-preview')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async getWizardEligibilityPreview(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Query() query: BookingWizardEligibilityPreviewQueryDto,
  ) {
    const paymentIntent = query.paymentIntent ?? query.paymentMethod;
    return this.wizardDraftService.getEligibilityPreview(orgId, bookingId, {
      paymentIntent,
      targetStatus: query.targetStatus,
      eligibilityApprovalId: query.eligibilityApprovalId,
      userId,
    });
  }

  @Post('wizard-draft/:bookingId/confirm')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async confirmWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: BookingWizardDraftConfirmDto,
  ) {
    return this.wizardDraftService.confirmDraft(orgId, bookingId, body, { userId });
  }

  @Post('wizard-draft/:bookingId/abort')
  @RequirePermission('bookings', 'write')
  async abortWizardDraft(
    @Param('orgId') orgId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.wizardDraftService.abortDraft(orgId, bookingId);
  }

  @Get(':id/eligibility-approvals')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async listEligibilityApprovals(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.eligibilityApprovalService.listForBooking(orgId, id);
  }

  @Post(':id/eligibility-approvals')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async createEligibilityApproval(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @Body() body: CreateBookingEligibilityApprovalDto,
  ) {
    if (!userId) {
      throw new BadRequestException('Authenticated user is required');
    }
    return this.eligibilityApprovalService.createRequest({
      organizationId: orgId,
      bookingId: id,
      requestedByUserId: userId,
      exceptionReason: body.exceptionReason,
      targetBookingStatus: body.targetBookingStatus,
    });
  }

  @Post(':id/eligibility-approvals/:approvalId/decide')
  @RequireBookingEligibilityPermission('booking_eligibility.override')
  async decideEligibilityApproval(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('approvalId') approvalId: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('platformRole') platformRole: string | undefined,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
    @Body() body: DecideBookingEligibilityApprovalDto,
  ) {
    if (!userId) {
      throw new BadRequestException('Authenticated user is required');
    }
    return this.eligibilityApprovalService.decide({
      organizationId: orgId,
      bookingId: id,
      approvalId,
      decidedByUserId: userId,
      decision: body.decision,
      decisionReason: body.decisionReason,
      platformRole,
      membershipRole,
    });
  }

  @Get(':id/eligibility-decisions')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async listEligibilityDecisions(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.eligibilityDecisionService.listForBooking(orgId, id);
  }

  @Get(':id/eligibility-decisions/:decisionId')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async getEligibilityDecision(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('decisionId') decisionId: string,
  ) {
    return this.eligibilityDecisionService.getById(orgId, id, decisionId);
  }

  @Get(':id/rental-eligibility')
  @RequireBookingEligibilityPermission('booking_eligibility.review')
  async getBookingRentalEligibility(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Query() query: BookingRentalEligibilityBookingQueryDto,
  ) {
    const gateResult = await this.eligibilityGatekeeper.evaluateForBooking(
      orgId,
      id,
      'PREVIEW',
      {
        paymentIntent: query.paymentIntent ?? query.paymentMethod,
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
      },
    );
    return mapGatekeeperToAuthoritativeRentalPreview(gateResult);
  }

  @Get(':id/allowed-drivers')
  @RequirePermission('bookings', 'read')
  async listAllowedDrivers(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
  ) {
    assertCanReadBookingDrivers(membershipRole);
    return this.allowedDriversService.listForBooking(orgId, id);
  }

  @Post(':id/allowed-drivers')
  @RequirePermission('bookings', 'write')
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
  @RequirePermission('bookings', 'write')
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
  @RequirePermission('bookings', 'write')
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
  @RequirePermission('bookings', 'read')
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
  @RequirePermission('bookings', 'read')
  async findDetail(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    const detail = await this.bookingsService.findDetail(orgId, id);
    if (!detail) throw new NotFoundException(`Booking ${id} not found`);
    return detail;
  }

  @Get(':id')
  @RequirePermission('bookings', 'read')
  async findOne(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.findById(orgId, id);
  }

  @Post()
  @RequirePermission('bookings', 'write')
  async create(
    @Param('orgId') orgId: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('platformRole') platformRole: string | undefined,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
    @Body() body: CreateBookingDto,
  ) {
    const {
      eligibilityApprovalId,
      foreignTravelRequested,
      additionalDriverCount,
    } = body;
    const bookingBody = toBookingCreateInput(body);
    return this.bookingsService.create(orgId, bookingBody, {
      userId,
      platformRole,
      membershipRole,
      eligibilityApprovalId,
      foreignTravelRequested,
      additionalDriverCount,
    });
  }

  @Patch(':id')
  @RequirePermission('bookings', 'write')
  async update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser('id') userId: string | undefined,
    @CurrentUser('platformRole') platformRole: string | undefined,
    @CurrentUser('membershipRole') membershipRole: MembershipRole | undefined,
    @Body() body: UpdateBookingDto,
  ) {
    const {
      eligibilityApprovalId,
      eligibilityPreviewFingerprint,
      foreignTravelRequested,
      additionalDriverCount,
    } = body;
    const bookingBody = toBookingUpdateInput(body);
    return this.bookingsService.update(orgId, id, bookingBody, {
      userId,
      platformRole,
      membershipRole,
      eligibilityApprovalId,
      eligibilityPreviewFingerprint,
      foreignTravelRequested,
      additionalDriverCount,
    });
  }

  @Delete(':id')
  @RequirePermission('bookings', 'manage')
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
  @RequirePermission('bookings', 'write')
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
  @RequirePermission('bookings', 'read')
  async listHandovers(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
  ) {
    return this.handoverService.findForBooking(orgId, bookingId);
  }

  @Post(':id/handover/pickup')
  @RequirePermission('bookings', 'write')
  async createPickupHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CreateHandoverProtocolPayload,
  ) {
    return this.handoverService.createHandover(
      orgId,
      bookingId,
      'PICKUP',
      body,
      resolveHandoverActor(user),
    );
  }

  @Post(':id/handover/return')
  @RequirePermission('bookings', 'write')
  async createReturnHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CreateHandoverProtocolPayload,
  ) {
    return this.handoverService.createHandover(
      orgId,
      bookingId,
      'RETURN',
      body,
      resolveHandoverActor(user),
    );
  }
}
