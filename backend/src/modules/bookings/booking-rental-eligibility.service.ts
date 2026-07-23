import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import type { BookingRentalEligibilityInput, BookingRentalEligibilityResult } from './booking-rental-eligibility.types';
import { BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE } from './booking-rental-eligibility.types';
import {
  calculateAgeAtDate,
  evaluateRentalEligibilityChecks,
  monthsBetween,
  resolveEligibilityStatus,
} from './booking-rental-eligibility.util';
import {
  collectCustomerEligibilityFacts,
  resolveTrustedDateOfBirth,
  resolveTrustedLicenseIssuedAt,
} from '@modules/customer-verification/policies/customer-fact-trust.policy';
import type { DocumentEligibilityStatus } from '@modules/customer-verification/types/customer-verification-eligibility.types';

@Injectable()
export class BookingRentalEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalEffectiveRules: RentalEffectiveRulesService,
    private readonly verificationService: CustomerVerificationService,
  ) {}

  async check(
    input: BookingRentalEligibilityInput,
  ): Promise<BookingRentalEligibilityResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: input.customerId, organizationId: input.organizationId },
      select: {
        id: true,
        organizationId: true,
        dateOfBirth: true,
        licenseIssuedAt: true,
        licenseExpiry: true,
        idVerified: true,
        licenseVerified: true,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const [rules, documents, checks] = await Promise.all([
      this.rentalEffectiveRules.computeForVehicle(
        input.organizationId,
        input.vehicleId,
      ),
      this.prisma.customerDocument.findMany({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
        },
        select: {
          id: true,
          type: true,
          status: true,
          extractedJson: true,
          reviewedAt: true,
          reviewedByUserId: true,
          uploadedByUserId: true,
          updatedAt: true,
        },
      }),
      this.prisma.customerVerificationCheck.findMany({
        where: {
          organizationId: input.organizationId,
          customerId: input.customerId,
        },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          kind: true,
          status: true,
          extractedJson: true,
          completedAt: true,
          checkedByUserId: true,
          updatedAt: true,
        },
      }),
    ]);

    const formattedRules = this.rentalEffectiveRules.formatEffectiveRules(rules);
    const evaluatedAt = new Date();
    const idCheck =
      checks.find((check) => check.kind === 'ID_DOCUMENT') ?? null;
    const licenseCheck =
      checks.find((check) => check.kind === 'DRIVING_LICENSE') ?? null;

    const factInput = {
      customer,
      idCheck,
      licenseCheck,
      documents,
      evaluatedAt,
    };

    const dateOfBirthFact = resolveTrustedDateOfBirth(factInput);
    const licenseIssuedAtFact = resolveTrustedLicenseIssuedAt(factInput);
    const facts = collectCustomerEligibilityFacts(factInput);

    const hasDateOfBirth =
      dateOfBirthFact.isBinding && dateOfBirthFact.value != null;
    const customerAge =
      hasDateOfBirth && dateOfBirthFact.value
        ? calculateAgeAtDate(dateOfBirthFact.value, input.startDate)
        : null;

    const hasLicenseIssuedAt =
      licenseIssuedAtFact.isBinding && licenseIssuedAtFact.value != null;
    const licenseHoldingMonths =
      hasLicenseIssuedAt && licenseIssuedAtFact.value
        ? monthsBetween(licenseIssuedAtFact.value, input.startDate)
        : null;

    let depositReceived = input.depositReceived === true;
    if (!depositReceived && input.bookingId) {
      depositReceived = await this.isDepositReceived(
        input.organizationId,
        input.bookingId,
      );
    }

    const evaluation = evaluateRentalEligibilityChecks({
      rules,
      formattedRules,
      customerAge,
      licenseHoldingMonths,
      hasDateOfBirth,
      hasLicenseIssuedAt,
      unverifiedDateOfBirthPending: dateOfBirthFact.hasUnverifiedSuggestion,
      unverifiedLicenseIssuedAtPending: licenseIssuedAtFact.hasUnverifiedSuggestion,
      paymentIntent: input.paymentIntent ?? input.paymentMethod,
      paymentMethod: input.paymentIntent ?? input.paymentMethod,
      foreignTravelRequested: input.foreignTravelRequested === true,
      additionalDriverCount: Math.max(0, input.additionalDriverCount ?? 0),
      depositReceived,
    });

    const verification = await this.verificationService.getEligibilityStatus(
      input.organizationId,
      input.customerId,
      {
        bookingId: input.bookingId,
        startDate: input.startDate,
      },
    );

    this.applyVerificationImpact(evaluation, verification);

    return {
      ...evaluation,
      status: resolveEligibilityStatus({
        missingFields: evaluation.missingFields,
        blockingReasons: evaluation.blockingReasons,
        manualApprovalReasons: evaluation.manualApprovalReasons,
      }),
      effectiveRules: formattedRules,
      decisionSource: BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE,
      facts,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      bookingId: input.bookingId,
    };
  }

  async checkForBooking(
    orgId: string,
    bookingId: string,
    overrides: Partial<
      Pick<
        BookingRentalEligibilityInput,
        | 'paymentIntent'
        | 'paymentMethod'
        | 'foreignTravelRequested'
        | 'additionalDriverCount'
        | 'depositReceived'
      >
    > = {},
  ): Promise<BookingRentalEligibilityResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        id: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.check({
      organizationId: orgId,
      vehicleId: booking.vehicleId,
      customerId: booking.customerId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      bookingId: booking.id,
      ...overrides,
    });
  }

  private applyVerificationImpact(
    evaluation: Pick<
      BookingRentalEligibilityResult,
      'warningReasons' | 'manualApprovalReasons'
    >,
    verification: {
      idDocument: DocumentEligibilityStatus;
      drivingLicense: DocumentEligibilityStatus;
      proofOfAddress: string;
    },
  ): void {
    this.applyDocumentVerificationImpact(
      evaluation,
      verification.idDocument,
      'Ausweisprüfung',
    );
    this.applyDocumentVerificationImpact(
      evaluation,
      verification.drivingLicense,
      'Führerscheinprüfung',
    );

    if (
      verification.proofOfAddress === 'required' ||
      verification.proofOfAddress === 'pending'
    ) {
      evaluation.warningReasons.push(
        'Adressnachweis optional — noch nicht bestätigt',
      );
    }
  }

  private applyDocumentVerificationImpact(
    evaluation: Pick<
      BookingRentalEligibilityResult,
      'warningReasons' | 'manualApprovalReasons'
    >,
    status: DocumentEligibilityStatus,
    label: string,
  ): void {
    if (status === 'verified') {
      return;
    }
    if (status === 'pickup_required') {
      evaluation.warningReasons.push(`${label} beim Pickup vorgesehen`);
      return;
    }
    if (status === 'missing') {
      return;
    }
    if (status === 'requires_review' || status === 'pending') {
      evaluation.manualApprovalReasons.push(
        `${label} erfordert manuelle Freigabe`,
      );
      return;
    }
    if (status === 'rejected' || status === 'expired') {
      evaluation.manualApprovalReasons.push(
        `${label} ist nicht verifiziert (${status})`,
      );
    }
  }

  private async isDepositReceived(orgId: string, bookingId: string): Promise<boolean> {
    const deposit = await this.prisma.bookingDeposit.findFirst({
      where: { organizationId: orgId, bookingId },
      select: { status: true },
    });
    if (!deposit) return false;
    return ['RECEIVED', 'PARTIALLY_USED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
      deposit.status,
    );
  }
}
