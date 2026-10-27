import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentExtractionType, MembershipRole, Prisma } from '@prisma/client';
import documentRetentionConfig from '@config/document-retention.config';
import type { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import type { MembershipPermissionsMap } from '@shared/auth/permission.util';
import { canAccessZb1RegistrationVehicleDocument } from './zb1-registration-document-p4.access.util';
import { mergePipelineLifecycle, patchRetentionState } from '../document-pipeline-lifecycle.util';
import { DocumentLifecycleService } from '../document-lifecycle.service';

export const ZB1_REGISTRATION_DOCUMENT_PURPOSE = 'ZB1_REGISTRATION_CERTIFICATE_VEHICLE_FILE' as const;

@Injectable()
export class Zb1RegistrationDocumentP4Service {
  private readonly logger = new Logger(Zb1RegistrationDocumentP4Service.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly lifecycle: DocumentLifecycleService,
    @Inject(documentRetentionConfig.KEY)
    private readonly retentionConfig: ConfigType<typeof documentRetentionConfig>,
  ) {}

  private get cfg() {
    return this.config.get<{
      enabled?: boolean;
      storageReleaseAcknowledged?: boolean;
      gdprReleaseAcknowledged?: boolean;
      retentionDaysAfterSoftDelete?: number;
      deleteOnVehicleOffboarding?: boolean;
    }>('zb1RegistrationDocumentP4');
  }

  isP4Active(): boolean {
    return this.cfg?.enabled === true;
  }

  resolveEffectiveDocumentType(record: {
    effectiveDocumentType?: DocumentExtractionType | null;
    documentType?: DocumentExtractionType | null;
    requestedDocumentType?: DocumentExtractionType | null;
  }): DocumentExtractionType | null {
    return (
      record.effectiveDocumentType ??
      record.documentType ??
      record.requestedDocumentType ??
      null
    );
  }

  isRegistrationCertificate(record: {
    effectiveDocumentType?: DocumentExtractionType | null;
    documentType?: DocumentExtractionType | null;
    requestedDocumentType?: DocumentExtractionType | null;
  }): boolean {
    return this.resolveEffectiveDocumentType(record) === 'REGISTRATION_CERTIFICATE';
  }

  assertProductionGatesForUpload(): void {
    if (!this.isP4Active()) return;
    if (!this.cfg?.storageReleaseAcknowledged) {
      throw new BadRequestException({
        code: 'ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_GATE',
        message:
          'ZB-I document storage (P4) is not released for this environment (storage release attestation missing).',
      });
    }
    if (!this.cfg?.gdprReleaseAcknowledged) {
      throw new BadRequestException({
        code: 'ZB1_REGISTRATION_DOCUMENT_P4_GDPR_GATE',
        message:
          'ZB-I document storage (P4) requires documented GDPR/OCR provider release before activation.',
      });
    }
    if (!this.retentionConfig.encryptionAtRest.declared) {
      throw new BadRequestException({
        code: 'ZB1_REGISTRATION_DOCUMENT_P4_ENCRYPTION_GATE',
        message: 'DOCUMENT_STORAGE_ENCRYPTION_DECLARED must be true before P4 ZB-I storage is enabled.',
      });
    }
  }

  assertAccess(input: {
    record: {
      effectiveDocumentType?: DocumentExtractionType | null;
      documentType?: DocumentExtractionType | null;
      requestedDocumentType?: DocumentExtractionType | null;
    };
    membershipRole?: MembershipRole | null;
    permissions?: MembershipPermissionsMap | null;
    platformRole?: string | null;
  }): void {
    if (!this.isP4Active() || !this.isRegistrationCertificate(input.record)) {
      return;
    }
    if (input.platformRole === 'MASTER_ADMIN') {
      return;
    }
    if (
      !canAccessZb1RegistrationVehicleDocument({
        membershipRole: input.membershipRole ?? null,
        permissions: input.permissions ?? null,
      })
    ) {
      throw new ForbiddenException({
        code: 'ZB1_REGISTRATION_DOCUMENT_FORBIDDEN',
        message: 'Registration certificate documents are restricted to organization admins and fleet managers.',
      });
    }
  }

  stampRegistrationDocumentMetadata(plausibility: unknown): Prisma.InputJsonValue {
    const days = this.cfg?.retentionDaysAfterSoftDelete ?? 0;
    let next = mergePipelineLifecycle(plausibility, {
      retention: {
        policyVersion: this.retentionConfig.policyVersion,
        purpose: ZB1_REGISTRATION_DOCUMENT_PURPOSE,
        registrationCertificateRetentionDaysAfterSoftDelete: days,
      },
      mistralTransfer: {
        provider: 'mistral',
        status: 'not_sent',
        includesDocumentBytes: true,
        includesImageBase64: false,
      },
    });
    next = patchRetentionState(next, {
      policyVersion: this.retentionConfig.policyVersion,
      purpose: ZB1_REGISTRATION_DOCUMENT_PURPOSE,
    }) as Record<string, unknown>;
    return next as Prisma.InputJsonValue;
  }

  async assertMandatoryStorageCommitted(extractionId: string, objectKey: string | null | undefined): Promise<void> {
    if (!this.isP4Active()) return;
    if (!objectKey) {
      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: {
          status: 'FAILED',
          processingStage: 'STORAGE',
          errorPhase: 'UPLOAD',
          errorCode: 'ZB1_P4_STORAGE_REQUIRED',
          errorMessage: 'Mandatory ZB-I document storage failed',
        },
      });
      throw new BadRequestException({
        code: 'ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_FAILED',
        message: 'Upload cannot complete without successful private document storage.',
      });
    }
  }

  async softDeleteRegistrationDocumentsForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    actorUserId: string | null;
  }): Promise<{ affected: number }> {
    if (!this.isP4Active() || this.cfg?.deleteOnVehicleOffboarding !== true) {
      return { affected: 0 };
    }
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        OR: [
          { effectiveDocumentType: 'REGISTRATION_CERTIFICATE' },
          { documentType: 'REGISTRATION_CERTIFICATE' },
          { requestedDocumentType: 'REGISTRATION_CERTIFICATE' },
        ],
        fileDeletedAt: null,
        objectKey: { not: null },
      },
      select: {
        id: true,
        objectKey: true,
        plausibility: true,
        organizationId: true,
        vehicleId: true,
      },
    });
    let affected = 0;
    for (const row of rows) {
      await this.lifecycle.softDeleteFile({
        record: row,
        userId: input.actorUserId,
      });
      affected += 1;
    }
    if (affected > 0) {
      this.logger.log(
        `P4 ZB-I soft-delete on offboarding vehicle=${input.vehicleId} org=${input.organizationId} count=${affected}`,
      );
    }
    return { affected };
  }

  /** Hook for organization deletion / tenant teardown (P4 enabled + offboarding flag). */
  async softDeleteRegistrationDocumentsForOrganization(input: {
    organizationId: string;
    actorUserId: string | null;
  }): Promise<{ affected: number }> {
    if (!this.isP4Active() || this.cfg?.deleteOnVehicleOffboarding !== true) {
      return { affected: 0 };
    }
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          { effectiveDocumentType: 'REGISTRATION_CERTIFICATE' },
          { documentType: 'REGISTRATION_CERTIFICATE' },
          { requestedDocumentType: 'REGISTRATION_CERTIFICATE' },
        ],
        fileDeletedAt: null,
        objectKey: { not: null },
      },
      select: {
        id: true,
        objectKey: true,
        plausibility: true,
        organizationId: true,
        vehicleId: true,
      },
    });
    let affected = 0;
    for (const row of rows) {
      await this.lifecycle.softDeleteFile({
        record: row,
        userId: input.actorUserId,
      });
      affected += 1;
    }
    if (affected > 0) {
      this.logger.log(
        `P4 ZB-I soft-delete on organization removal org=${input.organizationId} count=${affected}`,
      );
    }
    return { affected };
  }

  shouldHideFromListForUser(input: {
    record: {
      effectiveDocumentType?: DocumentExtractionType | null;
      documentType?: DocumentExtractionType | null;
      requestedDocumentType?: DocumentExtractionType | null;
    };
    membershipRole?: MembershipRole | null;
    permissions?: MembershipPermissionsMap | null;
    platformRole?: string | null;
  }): boolean {
    if (!this.isP4Active() || !this.isRegistrationCertificate(input.record)) {
      return false;
    }
    if (input.platformRole === 'MASTER_ADMIN') {
      return false;
    }
    return !canAccessZb1RegistrationVehicleDocument({
      membershipRole: input.membershipRole ?? null,
      permissions: input.permissions ?? null,
    });
  }
}
