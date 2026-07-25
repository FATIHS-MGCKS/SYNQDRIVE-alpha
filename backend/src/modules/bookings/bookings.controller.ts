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
import { BookingsHandoverSessionService } from './handover-session/bookings-handover-session.service';
import { CompletePickupHandoverService } from './handover-session/complete-pickup-handover.service';
import {
  isHandoverSessionAction,
  isHandoverSessionStatusValue,
} from './handover-session/bookings-handover-session.service';
import type { HandoverSessionTransitionBodyDto } from './handover-session/dto/handover-session.dto';
import { CompleteReturnHandoverService } from './handover-session/complete-return-handover.service';
import type { CompleteReturnHandoverBodyDto } from './handover-session/dto/complete-return-handover.dto';
import { CorrectHandoverCompletionService } from './handover-session/correct-handover-completion.service';
import type { CorrectHandoverCompletionBodyDto } from './handover-session/dto/correct-handover-completion.dto';
import { HandoverCompletionRecordQueryService } from './handover-session/handover-completion-record-query.service';
import { BookingsHandoverDraftService } from './handover-session/bookings-handover-draft.service';
import type {
  CancelHandoverDraftBodyDto,
  CreateHandoverDraftBodyDto,
  UpdateHandoverDraftBodyDto,
} from './handover-session/dto/handover-draft.dto';
import { resolveHandoverActor } from './handover-actor.util';
import type { HandoverKind } from '@prisma/client';

@Controller('organizations/:orgId/bookings')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly handoverService: BookingsHandoverService,
    private readonly handoverSessionService: BookingsHandoverSessionService,
    private readonly completePickupHandoverService: CompletePickupHandoverService,
    private readonly completeReturnHandoverService: CompleteReturnHandoverService,
    private readonly correctHandoverCompletionService: CorrectHandoverCompletionService,
    private readonly handoverCompletionRecordQueryService: HandoverCompletionRecordQueryService,
    private readonly handoverDraftService: BookingsHandoverDraftService,
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

  @Post(':id/handover/pickup/complete')
  @RequirePermission('bookings', 'write')
  async completePickupHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CompletePickupHandoverBodyDto,
  ) {
    if (!body?.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }
    const { idempotencyKey, sessionId, expectedVersion, scopeOverrideReason, ...payload } = body;
    return this.completePickupHandoverService.completePickupHandover({
      organizationId: orgId,
      bookingId,
      idempotencyKey: idempotencyKey.trim(),
      payload,
      actor: resolveHandoverActor(user),
      sessionId: sessionId ?? null,
      expectedVersion: expectedVersion ?? null,
      scopeOverrideReason: scopeOverrideReason ?? null,
    });
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

  @Post(':id/handover/return/complete')
  @RequirePermission('bookings', 'write')
  async completeReturnHandover(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CompleteReturnHandoverBodyDto,
  ) {
    if (!body?.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotencyKey is required');
    }
    const { idempotencyKey, sessionId, expectedVersion, scopeOverrideReason, ...payload } = body;
    return this.completeReturnHandoverService.completeReturnHandover({
      organizationId: orgId,
      bookingId,
      idempotencyKey: idempotencyKey.trim(),
      payload,
      actor: resolveHandoverActor(user),
      sessionId: sessionId ?? null,
      expectedVersion: expectedVersion ?? null,
      scopeOverrideReason: scopeOverrideReason ?? null,
    });
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

  @Post(':id/handover/drafts/:kind')
  @RequirePermission('bookings', 'write')
  async createHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CreateHandoverDraftBodyDto,
  ) {
    const kind = this.parseHandoverKind(kindParam);
    return this.handoverDraftService.createDraft({
      organizationId: orgId,
      bookingId,
      kind,
      actor: resolveHandoverActor(user),
      currentStep: body.currentStep,
      draft: body.draft,
      actualStationId: body.actualStationId ?? null,
    });
  }

  @Get(':id/handover/drafts/:kind')
  @RequirePermission('bookings', 'read')
  async getHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
  ) {
    const kind = this.parseHandoverKind(kindParam);
    return this.handoverDraftService.getDraft(orgId, bookingId, kind, resolveHandoverActor(user));
  }

  @Patch(':id/handover/drafts/:kind')
  @RequirePermission('bookings', 'write')
  async updateHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: UpdateHandoverDraftBodyDto,
  ) {
    const kind = this.parseHandoverKind(kindParam);
    if (body.expectedVersion == null || !Number.isFinite(body.expectedVersion)) {
      throw new BadRequestException('expectedVersion is required');
    }
    return this.handoverDraftService.updateDraft({
      organizationId: orgId,
      bookingId,
      kind,
      actor: resolveHandoverActor(user),
      expectedVersion: body.expectedVersion,
      currentStep: body.currentStep,
      draft: body.draft,
      validateStep: body.validateStep,
      actualStationId: body.actualStationId ?? null,
      acquireLock: body.acquireLock,
    });
  }

  @Delete(':id/handover/drafts/:kind')
  @RequirePermission('bookings', 'write')
  async cancelHandoverDraft(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CancelHandoverDraftBodyDto,
  ) {
    const kind = this.parseHandoverKind(kindParam);
    return this.handoverDraftService.cancelDraft({
      organizationId: orgId,
      bookingId,
      kind,
      actor: resolveHandoverActor(user),
      expectedVersion: body?.expectedVersion ?? null,
      cancelReason: body?.cancelReason ?? null,
    });
  }

  @Get(':id/handover/completion-records/:kind')
  @RequirePermission('bookings', 'read')
  async listHandoverCompletionRecords(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
  ) {
    const kind = this.parseHandoverKind(kindParam);
    return this.handoverCompletionRecordQueryService.listForBooking(orgId, bookingId, kind);
  }

  @Post(':id/handover/completion-records/:kind/correct')
  @RequirePermission('bookings', 'manage')
  async correctHandoverCompletion(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: CorrectHandoverCompletionBodyDto,
  ) {
    const kind = this.parseHandoverKind(kindParam);
    if (!body?.correctionReason?.trim()) {
      throw new BadRequestException('correctionReason is required');
    }
    const { correctionReason, ...payload } = body;
    return this.correctHandoverCompletionService.correctHandoverCompletion({
      organizationId: orgId,
      bookingId,
      kind,
      correctionReason: correctionReason.trim(),
      payload,
      actor: resolveHandoverActor(user),
    });
  }

  // V4.9.840 — Server-side handover session state machine (draft/resume/cancel).
  @Get(':id/handover/sessions/:kind')
  @RequirePermission('bookings', 'read')
  async getHandoverSession(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
  ) {
    const kind = this.parseHandoverKind(kindParam);
    return this.handoverSessionService.getSessionView(
      orgId,
      bookingId,
      kind,
      resolveHandoverActor(user),
    );
  }

  @Post(':id/handover/sessions/:kind/transition')
  @RequirePermission('bookings', 'write')
  async transitionHandoverSession(
    @Param('orgId') orgId: string,
    @Param('id') bookingId: string,
    @Param('kind') kindParam: string,
    @CurrentUser() user: { id?: string; displayName?: string | null; name?: string | null; platformRole?: string; membershipRole?: string },
    @Body() body: HandoverSessionTransitionBodyDto,
  ) {
    const kind = this.parseHandoverKind(kindParam);
    if (!body?.action || !isHandoverSessionAction(body.action)) {
      throw new BadRequestException('Invalid handover session action');
    }
    if (body.toStatus && !isHandoverSessionStatusValue(body.toStatus)) {
      throw new BadRequestException('Invalid handover session status');
    }
    return this.handoverSessionService.transition(
      orgId,
      bookingId,
      kind,
      body,
      resolveHandoverActor(user),
    );
  }

  private parseHandoverKind(kindParam: string): HandoverKind {
    const normalized = kindParam?.toUpperCase();
    if (normalized !== 'PICKUP' && normalized !== 'RETURN') {
      throw new BadRequestException('kind must be pickup or return');
    }
    return normalized;
  }
}
