import { Injectable } from '@nestjs/common';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import type { BookingDetailDto, HandoverSideSummary } from './booking-detail.types';
import type { HandoverProtocolDto } from './handover.types';

@Injectable()
export class BookingResponseRedactionService {
  private flags(permissions: MembershipPermissionsMap | null | undefined) {
    const perms = normalizeMembershipPermissions(permissions);
    return {
      sensitive: evaluateModulePermission(perms, 'bookings-sensitive', 'read'),
      finance: evaluateModulePermission(perms, 'bookings-finance', 'read'),
      signature: evaluateModulePermission(perms, 'bookings-sensitive', 'read'),
      audit: evaluateModulePermission(perms, 'bookings-audit', 'read'),
      documents: evaluateModulePermission(perms, 'bookings-documents', 'read'),
    };
  }

  redactDetail(
    detail: BookingDetailDto,
    permissions: MembershipPermissionsMap | null | undefined,
  ): BookingDetailDto {
    const f = this.flags(permissions);
    const next = { ...detail };

    if (!f.sensitive) {
      next.customer = {
        customerId: detail.customer.customerId,
        fullName: '—',
        email: null,
        phone: null,
        customerStatus: null,
        identityStatus: null,
        licenseStatus: null,
        riskLevel: null,
        openInvoiceCount: 0,
        openFineCount: 0,
        noShowCount: 0,
      };
      next.core = { ...detail.core, notes: null };
    }

    if (!f.finance) {
      next.finance = {
        basePriceCents: null,
        extrasPriceCents: null,
        discountAmountCents: null,
        depositAmountCents: null,
        depositStatus: null,
        taxRate: null,
        taxAmountCents: null,
        grossAmountCents: null,
        paidAmountCents: null,
        openAmountCents: null,
        paymentStatus: null,
        invoiceStatus: null,
        finalInvoiceStatus: null,
        additionalChargesCents: null,
        refundAmountCents: null,
        retainedDepositAmountCents: null,
        computed: false,
      };
      next.payments = null;
    }

    if (!f.documents) {
      next.documents = {
        bundleStatus: null,
        completenessStatus: null,
        legalTermsAttached: false,
        legalWithdrawalAttached: false,
        legalPrivacyAttached: false,
        legalMissing: [],
        warnings: [],
        slots: [],
      };
    }

    if (!f.signature) {
      next.handover = {
        pickup: this.redactHandoverSummary(detail.handover.pickup),
        return: this.redactHandoverSummary(detail.handover.return),
      };
    }

    if (!f.audit) {
      next.activity = [];
    }

    return next;
  }

  redactBookingRow<T extends Record<string, unknown>>(
    row: T,
    permissions: MembershipPermissionsMap | null | undefined,
  ): T {
    const f = this.flags(permissions);
    const next = { ...row } as Record<string, unknown>;
    if (!f.finance) {
      delete next.dailyRate;
      delete next.dailyRateCents;
      delete next.totalPrice;
      delete next.totalPriceCents;
    }
    if (!f.sensitive) {
      delete next.customerName;
      delete next.customerPhone;
      delete next.notes;
      if (next.pickupProtocol) {
        next.pickupProtocol = this.redactHandoverProtocol(
          next.pickupProtocol as HandoverProtocolDto,
        );
      }
      if (next.returnProtocol) {
        next.returnProtocol = this.redactHandoverProtocol(
          next.returnProtocol as HandoverProtocolDto,
        );
      }
    } else if (!f.signature) {
      if (next.pickupProtocol) {
        next.pickupProtocol = this.redactHandoverProtocol(
          next.pickupProtocol as HandoverProtocolDto,
        );
      }
      if (next.returnProtocol) {
        next.returnProtocol = this.redactHandoverProtocol(
          next.returnProtocol as HandoverProtocolDto,
        );
      }
    }
    return next as T;
  }

  redactStats<T extends { revenueToday?: number; revenueMtd?: number }>(
    stats: T,
    permissions: MembershipPermissionsMap | null | undefined,
  ): T {
    const f = this.flags(permissions);
    if (f.finance) return stats;
    return {
      ...stats,
      revenueToday: 0,
      revenueMtd: 0,
    };
  }

  redactHandoverList(
    protocols: HandoverProtocolDto[],
    permissions: MembershipPermissionsMap | null | undefined,
  ): HandoverProtocolDto[] {
    const f = this.flags(permissions);
    if (f.signature) return protocols;
    return protocols.map((p) => this.redactHandoverProtocol(p));
  }

  private redactHandoverSummary(
    summary: HandoverSideSummary | null,
  ): HandoverSideSummary | null {
    if (!summary) return null;
    return {
      ...summary,
      signatureComplete: false,
      performedByName: null,
    };
  }

  private redactHandoverProtocol(protocol: HandoverProtocolDto): HandoverProtocolDto {
    return {
      ...protocol,
      customerSignatureDataUrl: null,
      staffSignatureDataUrl: null,
      customerSignatureName: null,
      staffSignatureName: null,
    };
  }
}
