import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import documentRetentionConfig from '@config/document-retention.config';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  ZB1_REGISTRATION_DOCUMENT_PURPOSE,
  Zb1RegistrationDocumentP4Service,
} from './zb1-registration-document-p4.service';
import { DocumentLifecycleService } from '../document-lifecycle.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('Zb1RegistrationDocumentP4Service', () => {
  const prisma = {
    vehicleDocumentExtraction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const lifecycle = { softDeleteFile: jest.fn() };

  const retentionFixture: ConfigType<typeof documentRetentionConfig> = {
    enabled: false,
    dryRun: true,
    batchSize: 10,
    maxBatchesPerRun: 1,
    policyVersion: 'test',
    stripOcrCacheOnManualDelete: true,
    days: {
      ocrCacheAfterSoftDelete: 0,
      sensitiveExtractedDataAfterSoftDelete: 0,
      extractionRowAfterSoftDelete: 0,
      rejectedWithoutFile: 0,
    },
    encryptionAtRest: { declared: true, provider: 'local-disk', kmsKeyId: null },
    backup: {
      strategy: 'none',
      documentObjectsIncluded: false,
      lastVerifiedAt: null,
      note: null,
    },
  };

  const build = (cfg: Record<string, unknown>) => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'zb1RegistrationDocumentP4') return cfg;
        return undefined;
      }),
    };
    return new Zb1RegistrationDocumentP4Service(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      lifecycle as unknown as DocumentLifecycleService,
      retentionFixture,
    );
  };

  it('blocks upload when P4 enabled without GDPR release', () => {
    const svc = build({
      enabled: true,
      storageReleaseAcknowledged: true,
      gdprReleaseAcknowledged: false,
    });
    expect(() => svc.assertProductionGatesForUpload()).toThrow(BadRequestException);
    try {
      svc.assertProductionGatesForUpload();
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'ZB1_REGISTRATION_DOCUMENT_P4_GDPR_GATE',
      });
    }
  });

  it('no-op gates when P4 disabled', () => {
    const svc = build({ enabled: false });
    expect(() => svc.assertProductionGatesForUpload()).not.toThrow();
  });

  it('stamps retention purpose and configurable days in metadata', () => {
    const svc = build({ enabled: true, retentionDaysAfterSoftDelete: 14 });
    const stamped = svc.stampRegistrationDocumentMetadata(null) as Record<string, unknown>;
    const pipeline = stamped._pipeline as {
      lifecycle?: { retention?: { purpose?: string; registrationCertificateRetentionDaysAfterSoftDelete?: number } };
    };
    expect(pipeline?.lifecycle?.retention?.purpose).toBe(ZB1_REGISTRATION_DOCUMENT_PURPOSE);
    expect(pipeline?.lifecycle?.retention?.registrationCertificateRetentionDaysAfterSoftDelete).toBe(14);
  });

  it('denies access for workers without fleet.manage when P4 active', () => {
    const svc = build({ enabled: true });
    expect(() =>
      svc.assertAccess({
        record: { effectiveDocumentType: 'REGISTRATION_CERTIFICATE' },
        membershipRole: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: true, manage: false } },
      }),
    ).toThrow(ForbiddenException);
  });

  it('soft-deletes registration rows on vehicle offboarding', async () => {
    prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
      { id: 'e1', objectKey: 'k1', plausibility: {}, organizationId: 'org-1', vehicleId: 'v1' },
    ]);
    lifecycle.softDeleteFile.mockResolvedValue({});
    const svc = build({ enabled: true, deleteOnVehicleOffboarding: true });
    const result = await svc.softDeleteRegistrationDocumentsForVehicle({
      organizationId: 'org-1',
      vehicleId: 'v1',
      actorUserId: 'u1',
    });
    expect(result.affected).toBe(1);
    expect(lifecycle.softDeleteFile).toHaveBeenCalled();
  });

  it('marks extraction failed when mandatory storage missing', async () => {
    prisma.vehicleDocumentExtraction.update.mockResolvedValue({});
    const svc = build({ enabled: true });
    await expect(svc.assertMandatoryStorageCommitted('ext-1', null)).rejects.toMatchObject({
      response: { code: 'ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_FAILED' },
    });
    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorCode: 'ZB1_P4_STORAGE_REQUIRED' }),
      }),
    );
  });
});
