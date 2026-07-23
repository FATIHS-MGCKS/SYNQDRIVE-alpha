import { Injectable } from '@nestjs/common';

import {
  BookingStatus,
  Customer,
  CustomerEligibilityPolicy,
  CustomerRiskLevel,
} from '@prisma/client';

import { PrismaService } from '@shared/database/prisma.service';

import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';

import {
  assembleCustomerEligibilityResult,
  createEligibilityBuckets,
  CustomerEligibilityEvaluateOptions,
  CustomerEligibilityResult,
  EligibilityBuckets,
  pushUniqueReason,
} from './types/customer-eligibility.types';
import {
  mapEligibilityToRentalClearance,
  type RentalClearanceSummary,
} from './rental-clearance.util';

const TERMINAL_FINE_STATUSES = ['RESOLVED', 'CLOSED'] as const;
const OPEN_INVOICE_STATUSES = ['SENT', 'OVERDUE'] as const;

@Injectable()
export class CustomerEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verificationService: CustomerVerificationService,
  ) {}

  async evaluateForBooking(
    orgId: string,
    customerId: string,
    options: CustomerEligibilityEvaluateOptions = {},
  ): Promise<CustomerEligibilityResult> {
    const buckets = createEligibilityBuckets();

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
    });

    if (!customer) {
      pushUniqueReason(
        buckets.globalBlockingReasons,
        'Customer not found in organization',
      );
      return assembleCustomerEligibilityResult(customerId, buckets, {
        canCreatePendingBooking: false,
        canConfirmBooking: false,
        canStartRental: false,
      });
    }

    const policy = await this.getOrCreatePolicy(orgId);
    const refDate = options.startDate ?? new Date();

    this.applyStatusBlocks(customer, buckets);
    this.applyExpiryBlocks(customer, refDate, policy, buckets);

    const verification =
      options.verificationSnapshot ??
      (await this.verificationService.getEligibilityStatus(
        orgId,
        customerId,
        {
          bookingId: options.bookingId,
          startDate: refDate,
          policy,
        },
      ));

    this.applyVerificationFromCanonical(verification, policy, buckets);
    this.applyRiskRules(customer, policy, buckets);

    await this.applyFinancialBlocks(orgId, customerId, policy, buckets);
    await this.applyTaskWarnings(orgId, customerId, buckets);

    const hasGlobalBlock = buckets.globalBlockingReasons.length > 0;
    const hasConfirmBlock = buckets.confirmBlockingReasons.length > 0;
    const hasPickupBlock = buckets.pickupBlockingReasons.length > 0;

    if (customer.status === 'UNDER_REVIEW') {
      if (
        options.requestedStatus === 'CONFIRMED' ||
        options.requestedStatus === 'ACTIVE'
      ) {
        pushUniqueReason(
          buckets.confirmBlockingReasons,
          'Customer is under review — only pending bookings are allowed',
        );
        pushUniqueReason(
          buckets.requiredActions,
          'Complete customer review',
        );
      }

      return assembleCustomerEligibilityResult(customerId, buckets, {
        canCreatePendingBooking: !hasGlobalBlock,
        canConfirmBooking: false,
        canStartRental: false,
      });
    }

    const canCreatePendingBooking = !hasGlobalBlock;
    const canConfirmBooking =
      !hasGlobalBlock &&
      !hasConfirmBlock &&
      verification.canConfirmBooking;
    const canStartRental =
      !hasGlobalBlock &&
      !hasConfirmBlock &&
      !hasPickupBlock &&
      verification.canStartPickup;

    return assembleCustomerEligibilityResult(customerId, buckets, {
      canCreatePendingBooking,
      canConfirmBooking,
      canStartRental,
    });
  }

  /** Batch list summary — one policy load, parallel per-customer evaluation (no frontend N+1). */
  async evaluateBatchForList(
    orgId: string,
    customerIds: string[],
  ): Promise<Map<string, RentalClearanceSummary>> {
    const uniqueIds = [...new Set(customerIds.filter(Boolean))];
    const map = new Map<string, RentalClearanceSummary>();
    if (uniqueIds.length === 0) return map;

    const evaluations = await Promise.all(
      uniqueIds.map(async (customerId) => {
        const result = await this.evaluateForBooking(orgId, customerId, {});
        return [customerId, mapEligibilityToRentalClearance(result)] as const;
      }),
    );

    for (const [id, summary] of evaluations) {
      map.set(id, summary);
    }
    return map;
  }

  private applyVerificationFromCanonical(
    verification: Awaited<
      ReturnType<CustomerVerificationService['getEligibilityStatus']>
    >,
    policy: CustomerEligibilityPolicy,
    buckets: EligibilityBuckets,
  ) {
    for (const reason of verification.confirmBlockingReasons ??
      verification.blockingReasons) {
      pushUniqueReason(buckets.confirmBlockingReasons, reason);
    }

    for (const reason of verification.pickupBlockingReasons ?? []) {
      pushUniqueReason(buckets.pickupBlockingReasons, reason);
    }

    for (const warning of verification.warnings) {
      if (!buckets.warnings.includes(warning)) {
        buckets.warnings.push(warning);
      }
    }

    if (verification.idDocument === 'requires_review') {
      buckets.warnings.push('Ausweisprüfung: manuelle Prüfung erforderlich');
      pushUniqueReason(
        buckets.requiredActions,
        'Ausweisprüfung abschließen',
      );
    }
    if (verification.drivingLicense === 'requires_review') {
      buckets.warnings.push('Führerscheinprüfung: manuelle Prüfung erforderlich');
      pushUniqueReason(
        buckets.requiredActions,
        'Führerscheinprüfung abschließen',
      );
    }

    if (policy.requireVerifiedIdForPickup && verification.idDocument === 'pickup_required') {
      pushUniqueReason(
        buckets.requiredActions,
        'Ausweisprüfung beim Pickup durchführen',
      );
    }
    if (
      policy.requireVerifiedLicenseForPickup &&
      verification.drivingLicense === 'pickup_required'
    ) {
      pushUniqueReason(
        buckets.requiredActions,
        'Führerscheinprüfung beim Pickup durchführen',
      );
    }
  }

  private applyStatusBlocks(customer: Customer, buckets: EligibilityBuckets) {
    if (customer.archivedAt) {
      pushUniqueReason(buckets.globalBlockingReasons, 'Customer is archived');
      pushUniqueReason(
        buckets.requiredActions,
        'Restore customer from archive',
      );
    }
    if (customer.status === 'BLOCKED') {
      pushUniqueReason(buckets.globalBlockingReasons, 'Customer is blocked');
    }
    if (customer.status === 'SUSPENDED') {
      pushUniqueReason(buckets.globalBlockingReasons, 'Customer is suspended');
    }
    if (customer.status === 'INACTIVE') {
      pushUniqueReason(buckets.globalBlockingReasons, 'Customer is inactive');
    }
    if (customer.status === 'UNDER_REVIEW') {
      buckets.warnings.push('Customer is under review');
    }
  }

  private applyExpiryBlocks(
    customer: Customer,
    refDate: Date,
    policy: CustomerEligibilityPolicy,
    buckets: EligibilityBuckets,
  ) {
    if (
      policy.blockExpiredLicense &&
      customer.licenseExpiry &&
      customer.licenseExpiry < refDate
    ) {
      pushUniqueReason(
        buckets.confirmBlockingReasons,
        'Driver license expired before booking start',
      );
      pushUniqueReason(
        buckets.requiredActions,
        'Update valid driver license',
      );
    } else if (customer.licenseExpiry && policy.warnLicenseExpiringWithinDays) {
      const warnBefore = new Date(refDate);
      warnBefore.setDate(
        warnBefore.getDate() + policy.warnLicenseExpiringWithinDays,
      );
      if (customer.licenseExpiry <= warnBefore) {
        buckets.warnings.push('Driver license expiring soon');
      }
    }

    if (
      policy.blockExpiredId &&
      customer.idExpiry &&
      customer.idExpiry < refDate
    ) {
      pushUniqueReason(
        buckets.confirmBlockingReasons,
        'ID document expired before booking start',
      );
      pushUniqueReason(buckets.requiredActions, 'Update valid ID document');
    } else if (customer.idExpiry && policy.warnIdExpiringWithinDays) {
      const warnBefore = new Date(refDate);
      warnBefore.setDate(warnBefore.getDate() + policy.warnIdExpiringWithinDays);
      if (customer.idExpiry <= warnBefore) {
        buckets.warnings.push('ID document expiring soon');
      }
    }
  }

  private applyRiskRules(
    customer: Customer,
    policy: CustomerEligibilityPolicy,
    buckets: EligibilityBuckets,
  ) {
    if (customer.riskLevel === CustomerRiskLevel.HIGH) {
      buckets.warnings.push('Customer has high risk rating');
      if (policy.blockHighRiskCustomer) {
        pushUniqueReason(
          buckets.globalBlockingReasons,
          'High-risk customer blocked by policy',
        );
      }
    }
    if (customer.riskLevel === CustomerRiskLevel.NOT_ASSESSED) {
      buckets.warnings.push('Customer risk not yet assessed');
    }
  }

  private async applyFinancialBlocks(
    orgId: string,
    customerId: string,
    policy: CustomerEligibilityPolicy,
    buckets: EligibilityBuckets,
  ) {
    const now = new Date();

    const overdueInvoices = await this.prisma.orgInvoice.count({
      where: {
        organizationId: orgId,
        customerId,
        status: { in: [...OPEN_INVOICE_STATUSES] },
        OR: [
          { status: 'OVERDUE' },
          { dueDate: { lt: now }, status: 'SENT' },
        ],
      },
    });
    if (overdueInvoices > 0) {
      const msg = `Customer has ${overdueInvoices} open overdue invoice(s)`;
      if (policy.blockOpenOverdueInvoices) {
        pushUniqueReason(buckets.globalBlockingReasons, msg);
      } else {
        buckets.warnings.push(msg);
      }
    }

    const openFines = await this.prisma.fine.count({
      where: {
        organizationId: orgId,
        customerId,
        status: { notIn: [...TERMINAL_FINE_STATUSES] },
      },
    });
    if (openFines > 0) {
      const msg = `Customer has ${openFines} open fine(s)`;
      if (policy.blockOpenFines) {
        pushUniqueReason(buckets.globalBlockingReasons, msg);
      } else {
        buckets.warnings.push(msg);
      }
    }
  }

  private async applyTaskWarnings(
    orgId: string,
    customerId: string,
    buckets: EligibilityBuckets,
  ) {
    const criticalOpen = await this.prisma.orgTask.count({
      where: {
        organizationId: orgId,
        customerId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] },
        priority: { in: ['HIGH', 'CRITICAL'] },
      },
    });
    if (criticalOpen > 0) {
      buckets.warnings.push(
        `Customer has ${criticalOpen} open high-priority task(s)`,
      );
    }
  }

  private async getOrCreatePolicy(
    orgId: string,
  ): Promise<CustomerEligibilityPolicy> {
    const existing = await this.prisma.customerEligibilityPolicy.findUnique({
      where: { organizationId: orgId },
    });
    if (existing) return existing;
    return this.prisma.customerEligibilityPolicy.create({
      data: { organizationId: orgId },
    });
  }
}
