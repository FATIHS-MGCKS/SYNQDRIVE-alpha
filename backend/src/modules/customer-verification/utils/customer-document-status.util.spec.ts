import {
  Customer,
  CustomerDocument,
  CustomerVerificationCheck,
  CustomerVerificationProvider,
} from '@prisma/client';
import {
  buildDomainStatus,
  computeMissingUploadSlots,
  documentTypeToVerificationKind,
  mapCheckStatusToDomainStatus,
} from './customer-document-status.util';
import { ID_DOCUMENT_TYPES, LICENSE_DOCUMENT_TYPES } from './customer-verification-status.util';

const baseCustomer = {
  id: 'c1',
  organizationId: 'org1',
  firstName: 'Max',
  lastName: 'Mustermann',
  email: 'max@example.com',
  phone: null,
  licenseNumber: 'B123',
  dateOfBirth: null,
  address: null,
  city: 'Kassel',
  zip: null,
  country: 'DE',
  company: null,
  taxId: null,
  customerType: 'INDIVIDUAL',
  riskLevel: 'NOT_ASSESSED',
  riskSource: 'NONE',
  riskReason: null,
  riskUpdatedAt: null,
  riskUpdatedByUserId: null,
  notes: null,
  licenseExpiry: null,
  licenseClass: 'B',
  idType: 'Personalausweis',
  idNumber: 'L01X00T47',
  idExpiry: null,
  idVerified: false,
  licenseVerified: false,
  idVerificationStatus: 'NOT_SUBMITTED',
  licenseVerificationStatus: 'NOT_SUBMITTED',
  idFrontUrl: null,
  idBackUrl: null,
  licenseFrontUrl: null,
  licenseBackUrl: null,
  emailNormalized: null,
  phoneNormalized: null,
  licenseNumberNormalized: null,
  idNumberNormalized: null,
  fullNameNormalized: null,
  archivedAt: null,
  archivedByUserId: null,
  archiveReason: null,
  piiAnonymizedAt: null,
  piiAnonymizedByUserId: null,
  retentionUntil: null,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
} as Customer;

function diditVerifiedCheck(
  kind: CustomerVerificationCheck['kind'],
): CustomerVerificationCheck {
  return {
    id: `chk-${kind}`,
    organizationId: 'org1',
    customerId: 'c1',
    bookingId: null,
    provider: CustomerVerificationProvider.DIDIT,
    kind,
    status: 'VERIFIED',
    providerSessionId: 'sess-1',
    providerWorkflowId: 'wf-1',
    providerStatus: 'Approved',
    providerUrl: null,
    vendorData: null,
    extractedJson: { country: 'DE' },
    decisionJson: { source: 'didit' },
    warnings: null,
    checkedByUserId: null,
    startedAt: new Date('2026-01-01'),
    completedAt: new Date('2026-01-02'),
    expiresAt: null,
    retentionUntil: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };
}

describe('customer-document-status.util', () => {
  it('maps document types to verification kinds', () => {
    expect(documentTypeToVerificationKind('ID_FRONT')).toBe('ID_DOCUMENT');
    expect(documentTypeToVerificationKind('LICENSE_BACK')).toBe('DRIVING_LICENSE');
    expect(documentTypeToVerificationKind('PROOF_OF_ADDRESS')).toBe('PROOF_OF_ADDRESS');
  });

  it('didit verified ID without documents hides ID upload slots', () => {
    const idDocument = buildDomainStatus({
      kind: 'ID_DOCUMENT',
      customer: baseCustomer,
      documents: [],
      latestCheck: diditVerifiedCheck('ID_DOCUMENT'),
      documentTypes: ID_DOCUMENT_TYPES,
      expiryDate: null,
      displayName: 'Deutscher Personalausweis',
      documentNumber: baseCustomer.idNumber,
      userNames: new Map(),
    });

    expect(idDocument.status).toBe('VERIFIED');
    expect(idDocument.provider).toBe('DIDIT');
    expect(idDocument.source).toBe('verification_check');

    const missing = computeMissingUploadSlots({
      idDocument,
      drivingLicense: buildDomainStatus({
        kind: 'DRIVING_LICENSE',
        customer: baseCustomer,
        documents: [],
        latestCheck: null,
        documentTypes: LICENSE_DOCUMENT_TYPES,
        expiryDate: null,
        displayName: 'Deutscher Führerschein',
        documentNumber: baseCustomer.licenseNumber,
        userNames: new Map(),
      }),
      proofOfAddress: buildDomainStatus({
        kind: 'PROOF_OF_ADDRESS',
        customer: baseCustomer,
        documents: [],
        latestCheck: null,
        documentTypes: ['PROOF_OF_ADDRESS'],
        expiryDate: null,
        displayName: 'Adressnachweis',
        proofOfAddressEligibility: 'not_required',
        userNames: new Map(),
      }),
      documents: [],
    });

    expect(missing.map((slot) => slot.documentType)).toEqual([
      'LICENSE_FRONT',
      'LICENSE_BACK',
    ]);
  });

  it('manual verified document produces verified domain status', () => {
    const reviewedAt = new Date('2026-02-01T10:00:00Z');
    const documents: CustomerDocument[] = [
      {
        id: 'doc-1',
        organizationId: 'org1',
        customerId: 'c1',
        type: 'ID_FRONT',
        status: 'VERIFIED',
        fileKey: 'file-1',
        originalFileName: 'id.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        extractedJson: null,
        uploadedByUserId: 'u1',
        reviewedByUserId: 'u2',
        reviewedAt,
        rejectedReason: null,
        expiresAt: null,
        createdAt: reviewedAt,
        updatedAt: reviewedAt,
      },
    ];

    const check = {
      ...diditVerifiedCheck('ID_DOCUMENT'),
      provider: CustomerVerificationProvider.MANUAL,
      status: 'VERIFIED' as const,
      checkedByUserId: 'u2',
      decisionJson: {
        manualReview: true,
        documentId: 'doc-1',
        documentType: 'ID_FRONT',
        reviewedAt: reviewedAt.toISOString(),
      },
    };

    const idDocument = buildDomainStatus({
      kind: 'ID_DOCUMENT',
      customer: baseCustomer,
      documents,
      latestCheck: check,
      documentTypes: ID_DOCUMENT_TYPES,
      expiryDate: null,
      displayName: 'Deutscher Personalausweis',
      documentNumber: baseCustomer.idNumber,
      userNames: new Map([['u2', 'Anna Operator']]),
    });

    expect(idDocument.status).toBe('VERIFIED');
    expect(idDocument.provider).toBe('MANUAL');
    expect(idDocument.checkedByName).toBe('Anna Operator');
    expect(idDocument.verifiedAt).toBe(check.completedAt?.toISOString());
  });

  it('proof of address not required hides upload slot', () => {
    const proofOfAddress = buildDomainStatus({
      kind: 'PROOF_OF_ADDRESS',
      customer: baseCustomer,
      documents: [],
      latestCheck: null,
      documentTypes: ['PROOF_OF_ADDRESS'],
      expiryDate: null,
      displayName: 'Adressnachweis',
      proofOfAddressEligibility: 'not_required',
      userNames: new Map(),
    });

    const missing = computeMissingUploadSlots({
      idDocument: buildDomainStatus({
        kind: 'ID_DOCUMENT',
        customer: baseCustomer,
        documents: [],
        latestCheck: diditVerifiedCheck('ID_DOCUMENT'),
        documentTypes: ID_DOCUMENT_TYPES,
        expiryDate: null,
        displayName: 'Deutscher Personalausweis',
        userNames: new Map(),
      }),
      drivingLicense: buildDomainStatus({
        kind: 'DRIVING_LICENSE',
        customer: baseCustomer,
        documents: [],
        latestCheck: diditVerifiedCheck('DRIVING_LICENSE'),
        documentTypes: LICENSE_DOCUMENT_TYPES,
        expiryDate: null,
        displayName: 'Deutscher Führerschein',
        userNames: new Map(),
      }),
      proofOfAddress,
      documents: [],
    });

    expect(proofOfAddress.status).toBe('NOT_REQUIRED');
    expect(missing.some((slot) => slot.documentType === 'PROOF_OF_ADDRESS')).toBe(false);
  });

  it('rejected check exposes rejected reason and shows upload slots again', () => {
    const rejectedCheck = {
      ...diditVerifiedCheck('ID_DOCUMENT'),
      provider: CustomerVerificationProvider.MANUAL,
      status: 'REJECTED' as const,
      decisionJson: {
        manualReview: true,
        rejectedReason: 'Bild unscharf',
      },
    };

    const idDocument = buildDomainStatus({
      kind: 'ID_DOCUMENT',
      customer: baseCustomer,
      documents: [],
      latestCheck: rejectedCheck,
      documentTypes: ID_DOCUMENT_TYPES,
      expiryDate: null,
      displayName: 'Deutscher Personalausweis',
      userNames: new Map(),
    });

    const missing = computeMissingUploadSlots({
      idDocument,
      drivingLicense: buildDomainStatus({
        kind: 'DRIVING_LICENSE',
        customer: baseCustomer,
        documents: [],
        latestCheck: null,
        documentTypes: LICENSE_DOCUMENT_TYPES,
        expiryDate: null,
        displayName: 'Deutscher Führerschein',
        userNames: new Map(),
      }),
      proofOfAddress: buildDomainStatus({
        kind: 'PROOF_OF_ADDRESS',
        customer: baseCustomer,
        documents: [],
        latestCheck: null,
        documentTypes: ['PROOF_OF_ADDRESS'],
        expiryDate: null,
        displayName: 'Adressnachweis',
        proofOfAddressEligibility: 'not_required',
        userNames: new Map(),
      }),
      documents: [],
    });

    expect(mapCheckStatusToDomainStatus('REJECTED')).toBe('REJECTED');
    expect(idDocument.rejectedReason).toBe('Bild unscharf');
    expect(missing.map((slot) => slot.documentType)).toEqual([
      'ID_FRONT',
      'ID_BACK',
      'LICENSE_FRONT',
      'LICENSE_BACK',
    ]);
  });

  it('pending review document does not duplicate upload slot', () => {
    const pendingDoc: CustomerDocument = {
      id: 'doc-pending',
      organizationId: 'org1',
      customerId: 'c1',
      type: 'LICENSE_FRONT',
      status: 'PENDING_REVIEW',
      fileKey: 'file-2',
      originalFileName: 'license.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      extractedJson: null,
      uploadedByUserId: 'u1',
      reviewedByUserId: null,
      reviewedAt: null,
      rejectedReason: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const drivingLicense = buildDomainStatus({
      kind: 'DRIVING_LICENSE',
      customer: baseCustomer,
      documents: [pendingDoc],
      latestCheck: null,
      documentTypes: LICENSE_DOCUMENT_TYPES,
      expiryDate: null,
      displayName: 'Deutscher Führerschein',
      userNames: new Map(),
    });

    const missing = computeMissingUploadSlots({
      idDocument: buildDomainStatus({
        kind: 'ID_DOCUMENT',
        customer: baseCustomer,
        documents: [],
        latestCheck: diditVerifiedCheck('ID_DOCUMENT'),
        documentTypes: ID_DOCUMENT_TYPES,
        expiryDate: null,
        displayName: 'Deutscher Personalausweis',
        userNames: new Map(),
      }),
      drivingLicense,
      proofOfAddress: buildDomainStatus({
        kind: 'PROOF_OF_ADDRESS',
        customer: baseCustomer,
        documents: [],
        latestCheck: null,
        documentTypes: ['PROOF_OF_ADDRESS'],
        expiryDate: null,
        displayName: 'Adressnachweis',
        proofOfAddressEligibility: 'not_required',
        userNames: new Map(),
      }),
      documents: [pendingDoc],
    });

    expect(drivingLicense.status).toBe('PENDING_REVIEW');
    expect(missing.map((slot) => slot.documentType)).toEqual(['LICENSE_BACK']);
  });
});
