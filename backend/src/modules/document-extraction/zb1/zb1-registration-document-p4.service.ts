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
import {
  assertZb1RegistrationCertificateAccess,
  canAccessZb1RegistrationCertificate,
} from './zb1-registration-certificate-access.policy';
import { mergePipelineLifecycle, patchRetentionState } from '../document-pipeline-lifecycle.util';
import { DocumentLifecycleService } from '../document-lifecycle.service';

export const ZB1_REGISTRATION_DOCUMENT_PURPOSE = 'ZB1_REGISTRATION_CERTIFICATE_VEHICLE_FILE' as const;

export type Zb1RegistrationAccessContext = {
  membershipRole: MembershipRole | null;
  permissions: MembershipPermissionsMap | null;
};

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

  /** New persistent ZB-I storage requires P4 ON + release attestations. */
  assertRegistrationCertificatePersistenceAllowed(): void {
    if (!this.isP4Active()) {
      throw new BadRequestException({
        code: 'ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_DISABLED',
        message:
          'ZB-I (REGISTRATION_CERTIFICATE) document persistence is disabled until P4 storage is enabled and released.',
      });
    }
    this.assertProductionGatesForUpload();
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

  assertAccess(
    record: {
      effectiveDocumentType?: DocumentExtractionType | null;
      documentType?: DocumentExtractionType | null;
      requestedDocumentType?: DocumentExtractionType | null;
    },
    access: Zb1RegistrationAccessContext,
  ): void {
    if (!this.isRegistrationCertificate(record)) {
      return;
    }
    try {
      assertZb1RegistrationCertificateAccess(access);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new ForbiddenException({
        code: 'ZB1_REGISTRATION_DOCUMENT_FORBIDDEN',
        message: 'Registration certificate access denied.',
      });
    }
  }

  assertDeleteAccess(
    record: {
      effectiveDocumentType?: DocumentExtractionType | null;
      documentType?: DocumentExtractionType | null;
      requestedDocumentType?: DocumentExtractionType | null;
    },
    access: Zb1RegistrationAccessContext,
  ): void {
    this.assertAccess(record, access);
  }

  shouldHideFromListForUser(
    record: {
      effectiveDocumentType?: DocumentExtractionType | null;
      documentType?: DocumentExtractionType | null;
      requestedDocumentType?: DocumentExtractionType | null;
    },
    access: Zb1RegistrationAccessContext,
  ): boolean {
    if (!this.isRegistrationCertificate(record)) {
      return false;
    }
    return !canAccessZb1RegistrationCertificate(access);
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

  private registrationCertificateWhere(
    organizationId: string,
    vehicleId?: string,
  ): Prisma.VehicleDocumentExtractionWhereInput {
    const regCert = DocumentExtractionType.REGISTRATION_CERTIFICATE;
    return {
      organizationId,
      ...(vehicleId ? { vehicleId } : {}),
      OR: [
        { effectiveDocumentType: regCert },
        { documentType: regCert },
        { requestedDocumentType: regCert },
      ],
      fileDeletedAt: null,
      objectKey: { not: null },
    };
  }

  async softDeleteRegistrationDocumentsForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    actorUserId: string | null;
  }): Promise<{ affected: number }> {
    if (this.cfg?.deleteOnVehicleOffboarding === false) {
      return { affected: 0 };
    }
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: this.registrationCertificateWhere(input.organizationId, input.vehicleId),
      select: {
        id: true,
        objectKey: true,
        plausibility: true,
        organizationId: true,
        vehicleId: true,
        fileDeletedAt: true,
      },
    });
    let affected = 0;
    for (const row of rows) {
      await this.lifecycle.softDeleteFile({
        record: row,
        userId: input.actorUserId,
        toleratePhysicalDeleteFailure: true,
      });
      affected += 1;
    }
    if (affected > 0) {
      this.logger.log(
        `ZB-I soft-delete on offboarding vehicle=${input.vehicleId} org=${input.organizationId} count=${affected}`,
      );
    }
    return { affected };
  }

  async softDeleteRegistrationDocumentsForOrganization(input: {
    organizationId: string;
    actorUserId: string | null;
  }): Promise<{ affected: number }> {
    if (this.cfg?.deleteOnVehicleOffboarding === false) {
      return { affected: 0 };
    }
    const rows = await this.prisma.vehicleDocumentExtraction.findMany({
      where: this.registrationCertificateWhere(input.organizationId),
      select: {
        id: true,
        objectKey: true,
        plausibility: true,
        organizationId: true,
        vehicleId: true,
        fileDeletedAt: true,
      },
    });
    let affected = 0;
    for (const row of rows) {
      await this.lifecycle.softDeleteFile({
        record: row,
        userId: input.actorUserId,
        toleratePhysicalDeleteFailure: true,
      });
      affected += 1;
    }
    if (affected > 0) {
      this.logger.log(
        `ZB-I soft-delete on organization removal org=${input.organizationId} count=${affected}`,
      );
    }
    return { affected };
  }
}
