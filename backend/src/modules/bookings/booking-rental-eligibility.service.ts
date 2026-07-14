import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalEffectiveRulesService } from '@modules/rental-rules/rental-effective-rules.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { CustomerDocumentType } from '@prisma/client';
import type { BookingRentalEligibilityInput, BookingRentalEligibilityResult } from './booking-rental-eligibility.types';
import { BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE } from './booking-rental-eligibility.types';
import {
  calculateAgeAtDate,
  evaluateRentalEligibilityChecks,
  monthsBetween,
} from './booking-rental-eligibility.util';
import { parseLicenseIssuedAtFromExtractedJson } from '@shared/utils/license-issued-at.util';

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

    const rules = await this.rentalEffectiveRules.computeForVehicle(
      input.organizationId,
      input.vehicleId,
    );
    const formattedRules = this.rentalEffectiveRules.formatEffectiveRules(rules);

    const licenseIssuedAt =
      customer.licenseIssuedAt ??
      (await this.resolveLicenseIssuedAtFromDocuments(
        input.organizationId,
        input.customerId,
      ));

    const hasDateOfBirth = customer.dateOfBirth != null;
    const customerAge = customer.dateOfBirth
      ? calculateAgeAtDate(customer.dateOfBirth, input.startDate)
      : null;

    const hasLicenseIssuedAt = licenseIssuedAt != null;
    const licenseHoldingMonths =
      licenseIssuedAt != null
        ? monthsBetween(licenseIssuedAt, input.startDate)
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

    if (verification.idDocument !== 'verified') {
      if (verification.idDocument === 'pickup_required') {
        evaluation.warningReasons.push(
          'Ausweisprüfung beim Pickup vorgesehen',
        );
      } else if (verification.idDocument !== 'missing') {
        evaluation.warningReasons.push(
          'Ausweisprüfung noch nicht abgeschlossen',
        );
      }
    }

    if (verification.drivingLicense !== 'verified') {
      if (verification.drivingLicense === 'pickup_required') {
        evaluation.warningReasons.push(
          'Führerscheinprüfung beim Pickup vorgesehen',
        );
      } else if (verification.drivingLicense !== 'missing') {
        evaluation.warningReasons.push(
          'Führerscheinprüfung noch nicht abgeschlossen',
        );
      }
    }

    if (
      verification.proofOfAddress === 'required' ||
      verification.proofOfAddress === 'pending'
    ) {
      evaluation.warningReasons.push(
        'Adressnachweis optional — noch nicht bestätigt',
      );
    }

    return {
      ...evaluation,
      effectiveRules: formattedRules,
      decisionSource: BOOKING_RENTAL_ELIGIBILITY_DECISION_SOURCE,
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

  private async resolveLicenseIssuedAtFromDocuments(
    orgId: string,
    customerId: string,
  ): Promise<Date | null> {
    const licenseDoc = await this.prisma.customerDocument.findFirst({
      where: {
        organizationId: orgId,
        customerId,
        type: { in: [CustomerDocumentType.LICENSE_FRONT, CustomerDocumentType.LICENSE_BACK] },
        status: { in: ['VERIFIED', 'UPLOADED', 'PENDING_REVIEW'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { extractedJson: true },
    });

    if (!licenseDoc?.extractedJson) return null;
    return parseLicenseIssuedAtFromExtractedJson(licenseDoc.extractedJson);
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
