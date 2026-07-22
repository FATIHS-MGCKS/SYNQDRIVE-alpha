import { Injectable, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import legalDocumentRetentionConfig from '@config/legal-document-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LEGAL_DOCUMENT_RETENTION_CLASS,
  type LegalDocumentRetentionClass,
} from './legal-document-retention.constants';
import type {
  LegalDocumentRetentionClassPolicy,
  LegalDocumentRetentionClassPolicyMap,
} from './legal-document-retention.types';

@Injectable()
export class LegalDocumentRetentionPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(legalDocumentRetentionConfig.KEY)
    private readonly config: ConfigType<typeof legalDocumentRetentionConfig>,
  ) {}

  getPlatformPolicyVersion(): string {
    return this.config.policyVersion;
  }

  async resolveClassPolicy(
    organizationId: string,
    retentionClass: LegalDocumentRetentionClass,
  ): Promise<LegalDocumentRetentionClassPolicy> {
    const orgPolicy = await this.prisma.organizationLegalDocumentRetentionPolicy.findUnique({
      where: { organizationId },
    });
    const overrides = (orgPolicy?.classPolicies ?? {}) as LegalDocumentRetentionClassPolicyMap;
    const override = overrides[retentionClass];
    if (override && Number.isFinite(override.retentionDays)) {
      return {
        retentionDays: Math.max(0, override.retentionDays),
        anchor: override.anchor ?? this.defaultAnchor(retentionClass),
      };
    }
    return {
      retentionDays: this.platformDays(retentionClass),
      anchor: this.defaultAnchor(retentionClass),
    };
  }

  computeDeletionEligibleAt(
    retentionClass: LegalDocumentRetentionClass,
    anchorDate: Date,
    retentionDays: number,
  ): Date | null {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return null;
    }
    const eligible = new Date(anchorDate);
    eligible.setUTCDate(eligible.getUTCDate() + retentionDays);
    return eligible;
  }

  getPlatformDefaults() {
    return this.config.days;
  }

  async getOrganizationPolicy(organizationId: string) {
    return this.prisma.organizationLegalDocumentRetentionPolicy.findUnique({
      where: { organizationId },
    });
  }

  async upsertOrganizationPolicy(
    organizationId: string,
    classPolicies: LegalDocumentRetentionClassPolicyMap,
    updatedByUserId?: string | null,
  ) {
    return this.prisma.organizationLegalDocumentRetentionPolicy.upsert({
      where: { organizationId },
      create: {
        organizationId,
        policyVersion: this.config.policyVersion,
        classPolicies: classPolicies as object,
        updatedByUserId: updatedByUserId ?? null,
      },
      update: {
        policyVersion: this.config.policyVersion,
        classPolicies: classPolicies as object,
        updatedByUserId: updatedByUserId ?? null,
      },
    });
  }

  private platformDays(retentionClass: LegalDocumentRetentionClass): number {
    switch (retentionClass) {
      case LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER:
        return this.config.days.legalMasterAfterArchive;
      case LEGAL_DOCUMENT_RETENTION_CLASS.BOOKING_SNAPSHOT:
        return this.config.days.bookingSnapshot;
      case LEGAL_DOCUMENT_RETENTION_CLASS.DELIVERY_EVIDENCE:
        return this.config.days.deliveryEvidenceRecipientRedaction;
      case LEGAL_DOCUMENT_RETENTION_CLASS.QUARANTINE_TEMP:
        return this.config.days.quarantineTemp;
      case LEGAL_DOCUMENT_RETENTION_CLASS.AUDIT_EVENT:
        return this.config.days.auditEvent;
      default:
        return 0;
    }
  }

  private defaultAnchor(
    retentionClass: LegalDocumentRetentionClass,
  ): LegalDocumentRetentionClassPolicy['anchor'] {
    switch (retentionClass) {
      case LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER:
        return 'archived_at';
      case LEGAL_DOCUMENT_RETENTION_CLASS.BOOKING_SNAPSHOT:
        return 'voided_at';
      case LEGAL_DOCUMENT_RETENTION_CLASS.DELIVERY_EVIDENCE:
        return 'presented_at';
      case LEGAL_DOCUMENT_RETENTION_CLASS.QUARANTINE_TEMP:
        return 'created_at';
      default:
        return 'created_at';
    }
  }
}
