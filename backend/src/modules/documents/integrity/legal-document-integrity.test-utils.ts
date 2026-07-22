import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from './legal-document-integrity.constants';
import type { LegalDocumentIntegrityCheckResult } from './legal-document-integrity.types';
import type { OrganizationLegalDocument } from '@prisma/client';

export function createNoopLegalDocumentChecksumVerificationService() {
  return {
    verify: jest.fn().mockResolvedValue({
      status: LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED,
      checkedAt: new Date(),
      expectedChecksum: null,
      actualChecksum: null,
    } satisfies LegalDocumentIntegrityCheckResult),
    isBlockingStatus: jest.fn().mockReturnValue(false),
  };
}

export function createNoopLegalDocumentIntegrityPersistenceService() {
  return {
    applyVerificationResult: jest
      .fn()
      .mockImplementation(async (doc: OrganizationLegalDocument) => doc),
    markUnexpectedObject: jest.fn().mockResolvedValue(undefined),
  };
}

export function createNoopDocumentsConfigStub(
  overrides: Record<string, unknown> = {},
) {
  return {
    integrityVerifyOnDownload: false,
    integrityReconciliationBatchSize: 50,
    integrityReconciliationRateLimitMs: 0,
    integrityAlertThreshold: 5,
    ...overrides,
  };
}

export function createNoopLegalDocumentOperationalNotificationService() {
  return {
    loadAndSyncOrgReadiness: jest.fn().mockResolvedValue(undefined),
    syncBundleCompleteness: jest.fn().mockResolvedValue(undefined),
    syncPickupGateBlock: jest.fn().mockResolvedValue(undefined),
    syncIntegrityAlert: jest.fn().mockResolvedValue(undefined),
    syncReconciliationFailure: jest.fn().mockResolvedValue(undefined),
  };
}

export function createNoopLegalDocumentRetentionPolicyService() {
  return {
    getOrganizationPolicy: jest.fn().mockResolvedValue(null),
    upsertOrganizationPolicy: jest.fn(),
    getPlatformPolicyVersion: jest.fn().mockResolvedValue('test'),
    getPlatformDefaults: jest.fn().mockResolvedValue({}),
    resolveClassPolicy: jest.fn().mockResolvedValue({ retentionDays: 365, anchor: 'ARCHIVED_AT' }),
    computeDeletionEligibleAt: jest.fn().mockReturnValue(new Date('2099-01-01T00:00:00.000Z')),
  };
}

export function createLegalDocumentsServiceForTests(
  prisma: unknown,
  deps: {
    events: unknown;
    scope?: unknown;
    fourEyes?: unknown;
    ingestion: unknown;
    storage: unknown;
    checksumVerification?: unknown;
    integrityPersistence?: unknown;
    retentionPolicy?: unknown;
    operationalNotifications?: unknown;
    config?: Record<string, unknown>;
  },
) {
  const { LegalDocumentsService } = require('../legal-documents.service') as typeof import('../legal-documents.service');
  return new LegalDocumentsService(
    prisma as any,
    deps.events as any,
    (deps.scope ?? { replaceStationScope: jest.fn(), validateScopeUpdate: jest.fn() }) as any,
    (deps.fourEyes ?? { assertCanApprove: jest.fn(), assertCanActivate: jest.fn() }) as any,
    deps.ingestion as any,
    (deps.checksumVerification ?? createNoopLegalDocumentChecksumVerificationService()) as any,
    (deps.integrityPersistence ?? createNoopLegalDocumentIntegrityPersistenceService()) as any,
    (deps.retentionPolicy ?? createNoopLegalDocumentRetentionPolicyService()) as any,
    (deps.operationalNotifications ?? createNoopLegalDocumentOperationalNotificationService()) as any,
    createNoopDocumentsConfigStub(deps.config) as any,
    deps.storage as any,
  );
}
