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
    createNoopDocumentsConfigStub(deps.config) as any,
    deps.storage as any,
  );
}
