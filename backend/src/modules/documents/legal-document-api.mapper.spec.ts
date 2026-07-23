import { LEGAL_STATUS } from './documents.constants';
import {
  deriveIntegrityStatus,
  deriveScanStatus,
  mapLegalDocumentToApiResponse,
  resolveActorRef,
} from './legal-document-api.mapper';

describe('legal-document-api.mapper', () => {
  const baseDoc = {
    id: 'doc-1',
    organizationId: 'org-1',
    documentType: 'TERMS_AND_CONDITIONS',
    legalVariant: null,
    title: 'AGB',
    versionLabel: '2026-01',
    language: 'de',
    jurisdictionCountry: 'DE',
    customerSegment: 'BOTH',
    bookingChannel: 'ALL',
    productScope: null,
    stationScopeMode: 'ORGANIZATION_WIDE',
    priority: 0,
    isMandatory: true,
    noticePurpose: 'GENERAL_NOTICE',
    status: LEGAL_STATUS.ACTIVE,
    fileName: 'agb.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    objectKey: 'organizations/org-1/legal/secret.pdf',
    checksum: 'abc123',
    sizeBytes: 2048,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validUntil: null,
    submittedForReviewAt: null,
    submittedForReviewByUserId: null,
    approvedAt: new Date('2026-01-02T00:00:00.000Z'),
    approvedByUserId: 'user-2',
    activatedAt: new Date('2026-01-03T00:00:00.000Z'),
    activatedByUserId: 'user-3',
    revokedAt: null,
    revokedByUserId: null,
    statusReason: null,
    changeSummary: 'Initial',
    legalOwnerName: 'Legal Team',
    uploadedByUserId: 'user-1',
    scanStatus: 'SCAN_PASSED',
    pageCount: 3,
    integrityStatus: 'VERIFIED',
    integrityCheckedAt: new Date('2026-01-01T00:00:00.000Z'),
    integrityDetail: null,
    integrityUnavailable: false,
    validationErrorCode: null,
    validationErrorDetail: null,
    validatedAt: new Date('2026-01-01T00:00:00.000Z'),
    malwareScannedAt: null,
    malwareScannerId: null,
    quarantineObjectKey: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    stations: [{ stationId: 'station-1' }],
  };

  it('maps professional API fields without exposing storage internals', () => {
    const usersById = new Map([
      ['user-1', { id: 'user-1', displayName: 'Uploader' }],
      ['user-2', { id: 'user-2', displayName: 'Approver' }],
      ['user-3', { id: 'user-3', displayName: 'Activator' }],
    ]);

    const dto = mapLegalDocumentToApiResponse(baseDoc as any, {
      snapshotCount: 7,
      usersById,
    });

    expect(dto).toEqual(
      expect.objectContaining({
        id: 'doc-1',
        documentType: 'TERMS_AND_CONDITIONS',
        documentVariant: null,
        jurisdiction: 'DE',
        customerSegment: 'BOTH',
        channelScope: 'ALL',
        stationScope: { mode: 'ORGANIZATION_WIDE', stationIds: ['station-1'] },
        fileSize: 2048,
        checksum: 'abc123',
        pageCount: 3,
        scanStatus: 'SCAN_PASSED',
        integrityStatus: 'VERIFIED',
        snapshotCount: 7,
        uploadedBy: { id: 'user-1', displayName: 'Uploader' },
        approvedBy: { id: 'user-2', displayName: 'Approver' },
        activatedBy: { id: 'user-3', displayName: 'Activator' },
      }),
    );

    expect(dto).not.toHaveProperty('objectKey');
    expect(dto).not.toHaveProperty('storageProvider');
    expect(dto).not.toHaveProperty('mimeType');
    expect(dto.legacyDocumentType).toBeNull();
    expect(dto.applicationScope.jurisdictionCountry).toBe('DE');
    expect(dto.fileName).toBe('agb.pdf');
    expect(dto.sizeBytes).toBe(2048);
    expect(dto.activeFrom).toBe(dto.activatedAt);
  });

  it('derives integrity status from persisted record', () => {
    expect(deriveIntegrityStatus('VERIFIED', 'abc', 100)).toBe('VERIFIED');
    expect(deriveIntegrityStatus('CHECKSUM_MISMATCH', 'abc', 100)).toBe('CHECKSUM_MISMATCH');
    expect(deriveIntegrityStatus(null, 'abc', null)).toBe('UNVERIFIED');
    expect(deriveIntegrityStatus(null, null, 100)).toBe('UNVERIFIED');
  });

  it('derives scan status from persisted record', () => {
    expect(deriveScanStatus('SCAN_PASSED')).toBe('SCAN_PASSED');
    expect(deriveScanStatus(null)).toBe('UPLOADED');
    expect(deriveScanStatus('VALIDATION_FAILED')).toBe('VALIDATION_FAILED');
  });

  it('falls back to unknown user display when actor map is missing', () => {
    expect(resolveActorRef('missing-user')).toEqual({
      id: 'missing-user',
      displayName: 'Unbekannter Benutzer',
    });
  });
});
