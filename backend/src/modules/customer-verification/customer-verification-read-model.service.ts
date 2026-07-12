import { Injectable } from '@nestjs/common';
import {
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
  CustomerVerificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { parseIsoDate } from './providers/didit/didit-decision.parser';
import { parseLicenseIssuedAtFromExtractedJson } from '@shared/utils/license-issued-at.util';

const TERMINAL_CHECK_STATUSES = new Set<CustomerVerificationCheckStatus>([
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'KYC_EXPIRED',
  'ABANDONED',
  'FAILED',
]);

@Injectable()
export class CustomerVerificationReadModelService {
  constructor(private readonly prisma: PrismaService) {}

  mapCheckStatusToCustomerStatus(
    status: CustomerVerificationCheckStatus,
  ): CustomerVerificationStatus {
    switch (status) {
      case 'VERIFIED':
        return 'VERIFIED';
      case 'REJECTED':
      case 'FAILED':
        return 'REJECTED';
      case 'EXPIRED':
      case 'KYC_EXPIRED':
        return 'EXPIRED';
      case 'NOT_STARTED':
      case 'ABANDONED':
        return 'NOT_SUBMITTED';
      case 'PENDING':
      case 'IN_PROGRESS':
      case 'AWAITING_USER':
      case 'REQUIRES_REVIEW':
      default:
        return 'PENDING_REVIEW';
    }
  }

  async syncCustomerFromCheck(
    organizationId: string,
    customerId: string,
    kind: CustomerVerificationCheckKind,
    checkStatus: CustomerVerificationCheckStatus,
    extractedJson: Prisma.InputJsonValue | null | undefined,
  ): Promise<void> {
    const customerStatus = this.mapCheckStatusToCustomerStatus(checkStatus);
    const data: Prisma.CustomerUpdateInput = {};

    if (kind === 'ID_DOCUMENT') {
      data.idVerificationStatus = customerStatus;
      data.idVerified = customerStatus === 'VERIFIED';
      this.applyIdExtractedFields(data, extractedJson);
    } else if (kind === 'DRIVING_LICENSE') {
      data.licenseVerificationStatus = customerStatus;
      data.licenseVerified = customerStatus === 'VERIFIED';
      this.applyLicenseExtractedFields(data, extractedJson);
    }

    if (Object.keys(data).length === 0) {
      return;
    }

    await this.prisma.customer.updateMany({
      where: { id: customerId, organizationId },
      data,
    });
  }

  isTerminalStatus(status: CustomerVerificationCheckStatus): boolean {
    return TERMINAL_CHECK_STATUSES.has(status);
  }

  private applyIdExtractedFields(
    data: Prisma.CustomerUpdateInput,
    extractedJson: Prisma.InputJsonValue | null | undefined,
  ): void {
    if (!extractedJson || typeof extractedJson !== 'object' || Array.isArray(extractedJson)) {
      return;
    }
    const extracted = extractedJson as Record<string, unknown>;
    const dob = parseIsoDate(
      typeof extracted.date_of_birth === 'string' ? extracted.date_of_birth : undefined,
    );
    const idExpiry = parseIsoDate(
      typeof extracted.expiration_date === 'string'
        ? extracted.expiration_date
        : undefined,
    );
    if (dob) data.dateOfBirth = dob;
    if (idExpiry) data.idExpiry = idExpiry;
  }

  private applyLicenseExtractedFields(
    data: Prisma.CustomerUpdateInput,
    extractedJson: Prisma.InputJsonValue | null | undefined,
  ): void {
    if (!extractedJson || typeof extractedJson !== 'object' || Array.isArray(extractedJson)) {
      return;
    }
    const extracted = extractedJson as Record<string, unknown>;
    const licenseExpiry = parseIsoDate(
      typeof extracted.expiration_date === 'string'
        ? extracted.expiration_date
        : undefined,
    );
    const licenseIssuedAt = parseLicenseIssuedAtFromExtractedJson(extracted);
    if (licenseExpiry) data.licenseExpiry = licenseExpiry;
    if (licenseIssuedAt) data.licenseIssuedAt = licenseIssuedAt;
  }
}
