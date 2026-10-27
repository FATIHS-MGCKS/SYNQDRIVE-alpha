import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { DocumentExtractionService } from '../document-extraction.service';
import {
  makeDocumentExtractionObservabilityMock,
  makeLifecycleMock,
  makeMalwareScanMock,
  makeRetentionMock,
  makeUploadContextMock,
  makeZb1RegistrationDocumentP4Mock,
} from '../document-extraction-test.helpers';
import {
  Zb1RegistrationDocumentP4Service,
} from './zb1-registration-document-p4.service';
import type { ConfigType } from '@nestjs/config';
import documentRetentionConfig from '@config/document-retention.config';

const registrationRecord = {
  id: 'ext-reg-1',
  vehicleId: 'v1',
  organizationId: 'org-1',
  effectiveDocumentType: 'REGISTRATION_CERTIFICATE' as const,
  documentType: 'REGISTRATION_CERTIFICATE' as const,
  objectKey: 'organizations/org-1/doc.pdf',
  mimeType: 'application/pdf',
  sourceFileName: 'schein.pdf',
  sizeBytes: 100,
  plausibility: { malwareScan: { status: 'CLEAN' } },
};

function makeServiceWithP4(p4: Zb1RegistrationDocumentP4Service | ReturnType<typeof makeZb1RegistrationDocumentP4Mock>) {
  const prisma = {
    vehicleDocumentExtraction: {
      findFirst: jest.fn().mockResolvedValue(registrationRecord),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      create: jest.fn(),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
    },
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue({
        role: MembershipRole.WORKER,
        permissions: { 'document-upload': { read: true, write: false, manage: false } },
      }),
    },
    vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const storage = {
    getObjectStream: jest.fn().mockResolvedValue({ pipe: jest.fn() }),
    putObject: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const svc = new DocumentExtractionService(
    prisma as any,
    { get: jest.fn() } as any,
    {
      queueEnabled: true,
      allowPendingWithoutQueue: false,
      jobAttempts: 4,
      jobBackoffMs: 5000,
      jobTimeoutMs: 120000,
      zb1RegistrationCertificateExtractionEnabled: true,
    } as any,
    storage as any,
    { add: jest.fn(), getJob: jest.fn().mockResolvedValue(null) } as any,
    { apply: jest.fn() } as any,
    { supportsExecutorPath: jest.fn(), executeConfirmedPlan: jest.fn() } as any,
    { runChecks: jest.fn().mockReturnValue({ overallStatus: 'OK', checks: [] }) } as any,
    { identify: jest.fn() } as any,
    { assess: jest.fn(), claimContentAnchor: jest.fn(), loadBlockedAssessmentFromAnchor: jest.fn() } as any,
    { assertAllowed: jest.fn() } as any,
    makeMalwareScanMock(storage) as any,
    makeLifecycleMock() as any,
    makeRetentionMock() as any,
    makeUploadContextMock() as any,
    makeDocumentExtractionObservabilityMock() as any,
    { buildForRecord: jest.fn() } as any,
    { buildForRecord: jest.fn() } as any,
    { listForRecord: jest.fn(), acceptSuggestion: jest.fn(), dismissSuggestion: jest.fn() } as any,
    { prepareContactPreview: jest.fn(), recordPrepareOpened: jest.fn(), sendPreparedContact: jest.fn() } as any,
    { resyncAfterPlanChange: jest.fn() } as any,
    { upsertForRecord: jest.fn(), ensureIndexedForOrg: jest.fn() } as any,
    p4 as any,
  );
  return { svc, prisma, storage };
}

function realP4Service(enabled: boolean) {
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
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'zb1RegistrationDocumentP4') {
        return {
          enabled,
          storageReleaseAcknowledged: true,
          gdprReleaseAcknowledged: true,
          retentionDaysAfterSoftDelete: 0,
          deleteOnVehicleOffboarding: true,
        };
      }
      return undefined;
    }),
  };
  return new Zb1RegistrationDocumentP4Service(
    config as any,
    { vehicleDocumentExtraction: { findMany: jest.fn(), update: jest.fn() } } as any,
    makeLifecycleMock() as any,
    retentionFixture,
  );
}

describe('ZB1 P4 document extraction ACL', () => {
  it('blocks download for document-upload read-only when P4 active', async () => {
    const { svc } = makeServiceWithP4(realP4Service(true));
    await expect(svc.getDownloadForVehicle('v1', 'ext-reg-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows download for org admin when P4 active', async () => {
    const p4 = realP4Service(true);
    const { svc, prisma } = makeServiceWithP4(p4);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: MembershipRole.ORG_ADMIN,
      permissions: {},
    });
    await expect(svc.getDownloadForVehicle('v1', 'ext-reg-1', 'admin-1')).resolves.toBeDefined();
  });

  it('still enforces ZB-I ACL when P4 feature flag off', async () => {
    const p4 = realP4Service(false);
    const { svc } = makeServiceWithP4(p4);
    await expect(svc.getDownloadForVehicle('v1', 'ext-reg-1', 'user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects cross-vehicle extraction lookup (IDOR)', async () => {
    const { svc, prisma } = makeServiceWithP4(makeZb1RegistrationDocumentP4Mock());
    prisma.vehicleDocumentExtraction.findFirst.mockResolvedValue(null);
    await expect(svc.getDownloadForVehicle('v-other', 'ext-reg-1', 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
