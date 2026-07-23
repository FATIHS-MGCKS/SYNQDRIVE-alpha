import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LegalDocumentChecksumVerificationService } from './legal-document-checksum-verification.service';
import { LegalDocumentIntegrityPersistenceService } from './legal-document-integrity-persistence.service';
import { LegalDocumentIntegrityAlertService } from './legal-document-integrity-alert.service';
import { LegalDocumentStorageReconciliationService } from './legal-document-storage-reconciliation.service';
import { LocalDocumentStorageService } from '../storage/local-document-storage.service';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from './legal-document-integrity.constants';
import { LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS } from './legal-document-integrity.constants';
import documentsConfig from '@config/documents.config';
import type { ConfigType } from '@nestjs/config';

function configStub(baseDir: string, quarantineDir: string) {
  return {
    get: jest.fn((key: string, def?: unknown) => {
      const map: Record<string, unknown> = {
        'documents.localStorageDir': baseDir,
        'documents.localQuarantineStorageDir': quarantineDir,
      };
      return key in map ? map[key] : def;
    }),
  } as any;
}

const documentsCfg = {
  integrityReconciliationBatchSize: 10,
  integrityReconciliationRateLimitMs: 0,
  integrityAlertThreshold: 5,
} as ConfigType<typeof documentsConfig>;

describe('LegalDocumentStorageReconciliationService (integration)', () => {
  let baseDir: string;
  let quarantineDir: string;
  let storage: LocalDocumentStorageService;
  let prisma: any;
  let reconciliation: LegalDocumentStorageReconciliationService;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'synq-reconcile-'));
    quarantineDir = await mkdtemp(join(tmpdir(), 'synq-reconcile-q-'));
    storage = new LocalDocumentStorageService(configStub(baseDir, quarantineDir));

    prisma = {
      organizationLegalDocument: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      legalDocumentStorageReconciliationRun: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          organizationLegalDocument: {
            update: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
              ...docs[0],
              ...data,
            })),
          },
          organizationLegalDocumentEvent: {
            create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
          },
        }),
      ),
    };

    const verification = new LegalDocumentChecksumVerificationService(storage);
    const operationalNotifications = {
      syncIntegrityAlert: jest.fn().mockResolvedValue(undefined),
      syncIntegrityTechnicalAlert: jest.fn().mockResolvedValue(undefined),
      syncReconciliationFailure: jest.fn().mockResolvedValue(undefined),
      syncTechnicalAlert: jest.fn().mockResolvedValue(undefined),
      loadAndSyncOrgReadiness: jest.fn().mockResolvedValue(undefined),
    };
    const alerts = new LegalDocumentIntegrityAlertService(documentsCfg, operationalNotifications as any);
    const persistence = new LegalDocumentIntegrityPersistenceService(
      prisma,
      { appendIntegrityEventInTransaction: jest.fn().mockResolvedValue({ id: 'evt-1' }) } as any,
      alerts,
    );
    reconciliation = new LegalDocumentStorageReconciliationService(
      prisma,
      documentsCfg,
      storage,
      verification,
      persistence,
      alerts,
    );
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
    await rm(quarantineDir, { recursive: true, force: true });
  });

  const docs: Array<Record<string, unknown>> = [
    {
      id: 'doc-1',
      organizationId: 'org-1',
      objectKey: '',
      checksum: null,
      sizeBytes: null,
      status: 'ACTIVE',
      integrityStatus: 'UNVERIFIED',
      integrityUnavailable: false,
      integrityDetail: null,
      integrityCheckedAt: null,
      versionLabel: 'v1',
      documentType: 'TERMS_AND_CONDITIONS',
      legalVariant: null,
      language: 'de',
      jurisdictionCountry: 'DE',
      customerSegment: 'BOTH',
      bookingChannel: 'ALL',
      productScope: null,
      stationScopeMode: 'ORGANIZATION_WIDE',
      priority: 0,
      isMandatory: true,
      noticePurpose: 'GENERAL_NOTICE',
      validFrom: null,
      validUntil: null,
      statusReason: null,
      checksumField: null,
      quarantineObjectKey: null,
    },
  ];

  async function seedVerifiedDoc() {
    const put = await storage.putObject({
      organizationId: 'org-1',
      bookingId: null,
      documentType: 'TERMS_AND_CONDITIONS',
      originalName: 'agb.pdf',
      buffer: Buffer.from('abc'),
      mimeType: 'application/pdf',
    });
    docs[0].objectKey = put.objectKey;
    docs[0].checksum = put.contentHash;
    docs[0].sizeBytes = put.sizeBytes;
  }

  function mockRunLifecycle() {
    prisma.legalDocumentStorageReconciliationRun.create.mockResolvedValue({
      id: 'run-1',
      cursor: null,
      status: LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.RUNNING,
    });
    prisma.legalDocumentStorageReconciliationRun.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'run-1',
        status: data.status ?? LEGAL_DOCUMENT_RECONCILIATION_RUN_STATUS.RUNNING,
        cursor: data.cursor ?? null,
      }),
    );
  }

  it('dry-run reports drift without persisting document updates', async () => {
    await seedVerifiedDoc();
    docs[0].checksum = 'deadbeef';
    prisma.organizationLegalDocument.findMany
      .mockResolvedValueOnce([docs[0]])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ objectKey: docs[0].objectKey, quarantineObjectKey: null }]);
    mockRunLifecycle();

    const result = await reconciliation.run({
      organizationId: 'org-1',
      dryRun: true,
      scanUnexpectedObjects: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.metrics.checksumMismatch).toBe(1);
    expect(result.drifts[0]?.kind).toBe('CHECKSUM_MISMATCH');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('detects missing objects', async () => {
    docs[0].objectKey = 'organizations/org-1/legal/TERMS_AND_CONDITIONS/2026/07/missing.pdf';
    docs[0].checksum = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3';
    docs[0].sizeBytes = 3;
    prisma.organizationLegalDocument.findMany
      .mockResolvedValueOnce([docs[0]])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ objectKey: docs[0].objectKey, quarantineObjectKey: null }]);
    mockRunLifecycle();

    const result = await reconciliation.run({
      organizationId: 'org-1',
      dryRun: true,
      scanUnexpectedObjects: false,
    });

    expect(result.metrics.missingObject).toBe(1);
    expect(result.drifts[0]?.kind).toBe('MISSING_OBJECT');
  });

  it('verifies matching checksum without drift', async () => {
    await seedVerifiedDoc();
    prisma.organizationLegalDocument.findMany
      .mockResolvedValueOnce([docs[0]])
      .mockResolvedValueOnce([{ organizationId: 'org-1' }])
      .mockResolvedValueOnce([{ objectKey: docs[0].objectKey, quarantineObjectKey: null }]);
    mockRunLifecycle();

    const result = await reconciliation.run({
      organizationId: 'org-1',
      dryRun: true,
      scanUnexpectedObjects: true,
    });

    expect(result.metrics.verified).toBe(1);
    expect(result.drifts.filter((d) => d.kind !== 'UNEXPECTED_OBJECT')).toHaveLength(0);
  });

  it('scopes reconciliation to a single tenant', async () => {
    await seedVerifiedDoc();
    prisma.organizationLegalDocument.findMany.mockImplementation(
      async (args: { where?: { organizationId?: string } }) => {
        if (args.where?.organizationId === 'org-1') return [docs[0]];
        return [];
      },
    );
    mockRunLifecycle();

    const result = await reconciliation.run({
      organizationId: 'org-1',
      dryRun: true,
      scanUnexpectedObjects: false,
    });

    expect(result.organizationId).toBe('org-1');
    expect(prisma.organizationLegalDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
  });
});
