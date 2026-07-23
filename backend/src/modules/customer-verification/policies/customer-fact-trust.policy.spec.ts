import {
  CustomerDocument,
  CustomerVerificationCheck,
} from '@prisma/client';
import {
  CUSTOMER_FACT_TRUST_HIERARCHY,
  isNonBindingCustomerDocumentStatus,
  isNonBindingExtractionLifecycleStatus,
  isPendingVerificationCheckStatus,
  isVerifiedVerificationCheckStatus,
  resolveTrustedDateOfBirth,
  resolveTrustedLicenseIssuedAt,
} from './customer-fact-trust.policy';

function buildDocument(
  overrides: Partial<CustomerDocument> & Pick<CustomerDocument, 'type' | 'status'>,
): CustomerDocument {
  return {
    id: overrides.id ?? 'doc-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    type: overrides.type,
    status: overrides.status,
    fileKey: 'file-key',
    originalFileName: null,
    mimeType: null,
    sizeBytes: null,
    extractedJson: overrides.extractedJson ?? null,
    uploadedByUserId: overrides.uploadedByUserId ?? 'uploader-1',
    reviewedByUserId: overrides.reviewedByUserId ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    rejectedReason: null,
    expiresAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: overrides.updatedAt ?? new Date('2026-06-01'),
  };
}

function buildCheck(
  overrides: Partial<CustomerVerificationCheck> &
    Pick<CustomerVerificationCheck, 'kind' | 'status'>,
): CustomerVerificationCheck {
  return {
    id: overrides.id ?? 'check-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    bookingId: null,
    provider: 'DIDIT',
    kind: overrides.kind,
    status: overrides.status,
    providerSessionId: null,
    providerWorkflowId: null,
    providerStatus: null,
    providerUrl: null,
    vendorData: null,
    extractedJson: overrides.extractedJson ?? null,
    decisionJson: null,
    warnings: null,
    checkedByUserId: overrides.checkedByUserId ?? null,
    startedAt: null,
    completedAt: overrides.completedAt ?? new Date('2026-06-01'),
    expiresAt: null,
    retentionUntil: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-06-01'),
  };
}

const baseInput = {
  customer: {
    id: 'cust-1',
    dateOfBirth: null,
    licenseIssuedAt: null,
    licenseExpiry: null,
    idVerified: false,
    licenseVerified: false,
  },
  idCheck: null,
  licenseCheck: null,
  documents: [] as CustomerDocument[],
  evaluatedAt: new Date('2026-07-01T10:00:00.000Z'),
};

describe('customer-fact-trust.policy', () => {
  it('exposes the source-of-truth hierarchy in priority order', () => {
    expect(CUSTOMER_FACT_TRUST_HIERARCHY).toEqual([
      'CUSTOMER_CANONICAL_VERIFIED',
      'KYC_VERIFIED',
      'MANUAL_DOCUMENT_VERIFIED',
      'OCR_UNVERIFIED',
    ]);
  });

  describe('non-binding status helpers', () => {
    it.each(['UPLOADED', 'PENDING_REVIEW'] as const)(
      'treats customer document status %s as non-binding',
      (status) => {
        expect(isNonBindingCustomerDocumentStatus(status)).toBe(true);
      },
    );

    it.each(['VERIFIED', 'REJECTED', 'EXPIRED'] as const)(
      'does not treat customer document status %s as non-binding',
      (status) => {
        expect(isNonBindingCustomerDocumentStatus(status)).toBe(false);
      },
    );

    it.each(['UPLOADED', 'PENDING_REVIEW', 'PROCESSING', 'OCR_COMPLETED'] as const)(
      'treats extraction lifecycle status %s as non-binding',
      (status) => {
        expect(isNonBindingExtractionLifecycleStatus(status)).toBe(true);
      },
    );

    it('identifies verified and pending KYC check statuses', () => {
      expect(isVerifiedVerificationCheckStatus('VERIFIED')).toBe(true);
      expect(isPendingVerificationCheckStatus('IN_PROGRESS')).toBe(true);
      expect(isPendingVerificationCheckStatus('VERIFIED')).toBe(false);
    });
  });

  describe('resolveTrustedDateOfBirth', () => {
    it('prefers verified canonical customer field', () => {
      const result = resolveTrustedDateOfBirth({
        ...baseInput,
        customer: {
          ...baseInput.customer,
          dateOfBirth: new Date('1990-01-15'),
          idVerified: true,
        },
      });

      expect(result.isBinding).toBe(true);
      expect(result.fact.sourceType).toBe('CUSTOMER_CANONICAL_VERIFIED');
      expect(result.value?.toISOString()).toBe('1990-01-15T00:00:00.000Z');
    });

    it('prefers verified KYC check over unverified customer field', () => {
      const result = resolveTrustedDateOfBirth({
        ...baseInput,
        customer: {
          ...baseInput.customer,
          dateOfBirth: new Date('2008-01-01'),
          idVerified: false,
        },
        idCheck: buildCheck({
          kind: 'ID_DOCUMENT',
          status: 'VERIFIED',
          extractedJson: { date_of_birth: '1990-01-15' },
        }),
      });

      expect(result.isBinding).toBe(true);
      expect(result.fact.sourceType).toBe('KYC_VERIFIED');
      expect(result.value?.toISOString()).toBe('1990-01-15T00:00:00.000Z');
    });

    it('uses verified manual document when canonical and KYC are unavailable', () => {
      const result = resolveTrustedDateOfBirth({
        ...baseInput,
        documents: [
          buildDocument({
            id: 'id-doc',
            type: 'ID_FRONT',
            status: 'VERIFIED',
            extractedJson: { date_of_birth: '1992-03-10' },
            reviewedAt: new Date('2026-05-01'),
            reviewedByUserId: 'reviewer-1',
          }),
        ],
      });

      expect(result.isBinding).toBe(true);
      expect(result.fact.sourceType).toBe('MANUAL_DOCUMENT_VERIFIED');
      expect(result.fact.sourceId).toBe('id-doc');
      expect(result.fact.verifiedBy).toBe('reviewer-1');
    });

    it.each(['UPLOADED', 'PENDING_REVIEW'] as const)(
      'does not bind date of birth from %s document OCR',
      (status) => {
        const result = resolveTrustedDateOfBirth({
          ...baseInput,
          documents: [
            buildDocument({
              type: 'ID_FRONT',
              status,
              extractedJson: { date_of_birth: '2008-01-01' },
            }),
          ],
        });

        expect(result.isBinding).toBe(false);
        expect(result.hasUnverifiedSuggestion).toBe(true);
        expect(result.fact.sourceType).toBe('OCR_UNVERIFIED');
        expect(result.fact.verificationStatus).toBe('PENDING_REVIEW');
        expect(result.value).toBeNull();
      },
    );

    it('does not bind date of birth from in-flight KYC check', () => {
      const result = resolveTrustedDateOfBirth({
        ...baseInput,
        idCheck: buildCheck({
          kind: 'ID_DOCUMENT',
          status: 'IN_PROGRESS',
          extractedJson: { date_of_birth: '2008-01-01' },
        }),
      });

      expect(result.isBinding).toBe(false);
      expect(result.hasUnverifiedSuggestion).toBe(true);
      expect(result.fact.sourceType).toBe('OCR_UNVERIFIED');
    });

    it.each(['REJECTED', 'EXPIRED'] as const)(
      'does not bind date of birth from %s documents',
      (status) => {
        const result = resolveTrustedDateOfBirth({
          ...baseInput,
          documents: [
            buildDocument({
              type: 'ID_FRONT',
              status,
              extractedJson: { date_of_birth: '1990-01-15' },
            }),
          ],
        });

        expect(result.isBinding).toBe(false);
        expect(result.fact.verificationStatus).toBe('MISSING');
      },
    );
  });

  describe('resolveTrustedLicenseIssuedAt', () => {
    it('prefers verified canonical license issue date', () => {
      const result = resolveTrustedLicenseIssuedAt({
        ...baseInput,
        customer: {
          ...baseInput.customer,
          licenseIssuedAt: new Date('2018-01-01'),
          licenseVerified: true,
        },
      });

      expect(result.isBinding).toBe(true);
      expect(result.fact.sourceType).toBe('CUSTOMER_CANONICAL_VERIFIED');
    });

    it.each(['UPLOADED', 'PENDING_REVIEW'] as const)(
      'does not bind license issue date from %s OCR',
      (status) => {
        const result = resolveTrustedLicenseIssuedAt({
          ...baseInput,
          documents: [
            buildDocument({
              type: 'LICENSE_FRONT',
              status,
              extractedJson: { licenseIssuedAt: '2025-10-01' },
            }),
          ],
        });

        expect(result.isBinding).toBe(false);
        expect(result.hasUnverifiedSuggestion).toBe(true);
        expect(result.value).toBeNull();
      },
    );

    it('does not produce binding rejection from unverified OCR that would fail holding duration', () => {
      const result = resolveTrustedLicenseIssuedAt({
        ...baseInput,
        documents: [
          buildDocument({
            type: 'LICENSE_FRONT',
            status: 'UPLOADED',
            extractedJson: { licenseIssuedAt: '2025-10-01' },
          }),
        ],
      });

      expect(result.isBinding).toBe(false);
      expect(result.value).toBeNull();
      expect(result.fact.factualValue).toBe('2025-10-01T00:00:00.000Z');
    });
  });
});
