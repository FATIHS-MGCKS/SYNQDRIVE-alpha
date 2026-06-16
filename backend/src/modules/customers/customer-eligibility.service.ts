import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  Customer,
  CustomerEligibilityPolicy,
  CustomerRiskLevel,
  CustomerStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CustomerEligibilityEvaluateOptions,
  CustomerEligibilityResult,
} from './types/customer-eligibility.types';

const TERMINAL_FINE_STATUSES = ['RESOLVED', 'CLOSED'] as const;
const OPEN_INVOICE_STATUSES = ['SENT', 'OVERDUE'] as const;

@Injectable()
export class CustomerEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluateForBooking(
    orgId: string,
    customerId: string,
    options: CustomerEligibilityEvaluateOptions = {},
  ): Promise<CustomerEligibilityResult> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
    });

    const result: CustomerEligibilityResult = {
      customerId,
      canCreatePendingBooking: false,
      canConfirmBooking: false,
      canStartRental: false,
      blockingReasons: [],
      warnings: [],
      requiredActions: [],
    };

    if (!customer) {
      result.blockingReasons.push('Customer not found in organization');
      return result;
    }

    const policy = await this.getOrCreatePolicy(orgId);
    const refDate = options.startDate ?? new Date();

    this.applyStatusBlocks(customer, result);
    this.applyExpiryBlocks(customer, refDate, policy, result);
    this.applyVerificationRules(customer, policy, result);
    this.applyRiskRules(customer, policy, result);

    await this.applyFinancialBlocks(orgId, customerId, policy, result);
    await this.applyTaskWarnings(orgId, customerId, result);

    const hasHardBlock = result.blockingReasons.length > 0;

    if (customer.status === 'UNDER_REVIEW') {
      result.canCreatePendingBooking = !hasHardBlock;
      result.canConfirmBooking = false;
      result.canStartRental = false;
      if (
        options.requestedStatus === 'CONFIRMED' ||
        options.requestedStatus === 'ACTIVE'
      ) {
        result.blockingReasons.push(
          'Customer is under review — only pending bookings are allowed',
        );
        result.requiredActions.push('Complete customer review');
      }
      return result;
    }

    result.canCreatePendingBooking = !hasHardBlock;
    result.canConfirmBooking =
      !hasHardBlock && !this.hasConfirmBlockers(customer, policy, result);
    result.canStartRental =
      !hasHardBlock && !this.hasPickupBlockers(customer, policy, result);

    return result;
  }

  private applyStatusBlocks(
    customer: Customer,
    result: CustomerEligibilityResult,
  ) {
    if (customer.archivedAt) {
      result.blockingReasons.push('Customer is archived');
      result.requiredActions.push('Restore customer from archive');
    }
    if (customer.status === 'BLOCKED') {
      result.blockingReasons.push('Customer is blocked');
    }
    if (customer.status === 'SUSPENDED') {
      result.blockingReasons.push('Customer is suspended');
    }
    if (customer.status === 'INACTIVE') {
      result.blockingReasons.push('Customer is inactive');
    }
    if (customer.status === 'UNDER_REVIEW') {
      result.warnings.push('Customer is under review');
    }
  }

  private applyExpiryBlocks(
    customer: Customer,
    refDate: Date,
    policy: CustomerEligibilityPolicy,
    result: CustomerEligibilityResult,
  ) {
    if (
      policy.blockExpiredLicense &&
      customer.licenseExpiry &&
      customer.licenseExpiry < refDate
    ) {
      result.blockingReasons.push('Driver license expired before booking start');
      result.requiredActions.push('Update valid driver license');
    } else if (customer.licenseExpiry && policy.warnLicenseExpiringWithinDays) {
      const warnBefore = new Date(refDate);
      warnBefore.setDate(
        warnBefore.getDate() + policy.warnLicenseExpiringWithinDays,
      );
      if (customer.licenseExpiry <= warnBefore) {
        result.warnings.push('Driver license expiring soon');
      }
    }

    if (
      policy.blockExpiredId &&
      customer.idExpiry &&
      customer.idExpiry < refDate
    ) {
      result.blockingReasons.push('ID document expired before booking start');
      result.requiredActions.push('Update valid ID document');
    } else if (customer.idExpiry && policy.warnIdExpiringWithinDays) {
      const warnBefore = new Date(refDate);
      warnBefore.setDate(warnBefore.getDate() + policy.warnIdExpiringWithinDays);
      if (customer.idExpiry <= warnBefore) {
        result.warnings.push('ID document expiring soon');
      }
    }
  }

  private applyVerificationRules(
    customer: Customer,
    policy: CustomerEligibilityPolicy,
    result: CustomerEligibilityResult,
  ) {
    if (customer.idVerificationStatus !== 'VERIFIED') {
      const msg = `ID verification: ${customer.idVerificationStatus}`;
      result.warnings.push(msg);
      if (policy.requireVerifiedIdForPickup) {
        result.requiredActions.push('Verify customer ID documents');
      }
      if (policy.requireVerifiedIdForConfirmedBooking) {
        result.warnings.push('Verified ID required for confirmed booking');
      }
    }
    if (customer.licenseVerificationStatus !== 'VERIFIED') {
      const msg = `License verification: ${customer.licenseVerificationStatus}`;
      result.warnings.push(msg);
      if (policy.requireVerifiedLicenseForPickup) {
        result.requiredActions.push('Verify customer license documents');
      }
      if (policy.requireVerifiedLicenseForConfirmedBooking) {
        result.warnings.push(
          'Verified license required for confirmed booking',
        );
      }
    }
  }

  private applyRiskRules(
    customer: Customer,
    policy: CustomerEligibilityPolicy,
    result: CustomerEligibilityResult,
  ) {
    if (customer.riskLevel === CustomerRiskLevel.HIGH) {
      result.warnings.push('Customer has high risk rating');
      if (policy.blockHighRiskCustomer) {
        result.blockingReasons.push('High-risk customer blocked by policy');
      }
    }
    if (customer.riskLevel === CustomerRiskLevel.NOT_ASSESSED) {
      result.warnings.push('Customer risk not yet assessed');
    }
  }

  private hasConfirmBlockers(
    customer: Customer,
    policy: CustomerEligibilityPolicy,
    result: CustomerEligibilityResult,
  ): boolean {
    if (
      policy.requireVerifiedIdForConfirmedBooking &&
      customer.idVerificationStatus !== 'VERIFIED'
    ) {
      result.blockingReasons.push('Verified ID required for confirmed booking');
      return true;
    }
    if (
      policy.requireVerifiedLicenseForConfirmedBooking &&
      customer.licenseVerificationStatus !== 'VERIFIED'
    ) {
      result.blockingReasons.push(
        'Verified license required for confirmed booking',
      );
      return true;
    }
    if (policy.blockHighRiskCustomer && customer.riskLevel === 'HIGH') {
      return true;
    }
    if (policy.blockOpenOverdueInvoices) {
      const has = result.blockingReasons.some((r) =>
        r.includes('overdue invoice'),
      );
      if (has) return true;
    }
    if (policy.blockOpenFines) {
      const has = result.blockingReasons.some((r) => r.includes('open fine'));
      if (has) return true;
    }
    return false;
  }

  private hasPickupBlockers(
    customer: Customer,
    policy: CustomerEligibilityPolicy,
    result: CustomerEligibilityResult,
  ): boolean {
    if (
      policy.requireVerifiedIdForPickup &&
      customer.idVerificationStatus !== 'VERIFIED'
    ) {
      result.blockingReasons.push('Verified ID required for pickup');
      return true;
    }
    if (
      policy.requireVerifiedLicenseForPickup &&
      customer.licenseVerificationStatus !== 'VERIFIED'
    ) {
      result.blockingReasons.push('Verified license required for pickup');
      return true;
    }
    return this.hasConfirmBlockers(customer, policy, result);
  }

  private async applyFinancialBlocks(
    orgId: string,
    customerId: string,
    policy: CustomerEligibilityPolicy,
    result: CustomerEligibilityResult,
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
        result.blockingReasons.push(msg);
      } else {
        result.warnings.push(msg);
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
        result.blockingReasons.push(msg);
      } else {
        result.warnings.push(msg);
      }
    }
  }

  private async applyTaskWarnings(
    orgId: string,
    customerId: string,
    result: CustomerEligibilityResult,
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
      result.warnings.push(
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
