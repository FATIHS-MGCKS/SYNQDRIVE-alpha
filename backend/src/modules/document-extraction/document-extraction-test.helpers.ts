export function makeMalwareScanMock(storage?: {
  putObject: jest.Mock | ((input: unknown) => Promise<unknown>);
}) {
  return {
    isEnabled: jest.fn().mockReturnValue(false),
    storeScannedUpload:
      storage == null
        ? jest.fn().mockResolvedValue({
            objectKey: 'organizations/org-1/vehicles/v1/documents/test.pdf',
            storageProvider: 'local',
            sizeBytes: 10,
            mimeType: 'application/pdf',
            malwareScan: { status: 'NOT_SCANNED' },
          })
        : jest.fn(async (input: unknown) => ({
            ...(await storage.putObject(input)),
            malwareScan: { status: 'NOT_SCANNED' },
          })),
  };
}

export function makeUploadContextMock() {
  return {
    resolveUploadTarget: jest.fn(async (params: {
      organizationId: string;
      vehicleId?: string | null;
      optionalContextType?: string | null;
      optionalContextId?: string | null;
      sourceSurface?: string | null;
      providedByUserId?: string | null;
    }) => {
      const providedAt = new Date().toISOString();
      if (params.vehicleId) {
        return {
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
          contextCandidate: {
            entityType: 'VEHICLE',
            entityId: params.vehicleId,
            sourceSurface: params.sourceSurface ?? 'vehicle_detail',
            providedAt,
            providedByUserId: params.providedByUserId ?? null,
            confirmationStatus: 'CANDIDATE',
          },
          searchScope: { entityType: 'VEHICLE', entityId: params.vehicleId, narrowsSearch: true },
          uploadContextType: 'VEHICLE',
          uploadContextId: params.vehicleId,
        };
      }
      const type = params.optionalContextType?.toUpperCase() || null;
      const id = params.optionalContextId || null;
      if (type === 'VEHICLE' && id) {
        return {
          organizationId: params.organizationId,
          vehicleId: id,
          contextCandidate: {
            entityType: 'VEHICLE',
            entityId: id,
            sourceSurface: params.sourceSurface ?? 'org_inbox',
            providedAt,
            providedByUserId: params.providedByUserId ?? null,
            confirmationStatus: 'CANDIDATE',
          },
          searchScope: { entityType: 'VEHICLE', entityId: id, narrowsSearch: true },
          uploadContextType: 'VEHICLE',
          uploadContextId: id,
        };
      }
      if (type && type !== 'NONE' && id) {
        return {
          organizationId: params.organizationId,
          vehicleId: null,
          contextCandidate: {
            entityType: type,
            entityId: id,
            sourceSurface: params.sourceSurface ?? 'org_inbox',
            providedAt,
            providedByUserId: params.providedByUserId ?? null,
            confirmationStatus: 'CANDIDATE',
          },
          searchScope: { entityType: type, entityId: id, narrowsSearch: true },
          uploadContextType: type,
          uploadContextId: id,
        };
      }
      return {
        organizationId: params.organizationId,
        vehicleId: null,
        contextCandidate: null,
        searchScope: null,
        uploadContextType: null,
        uploadContextId: null,
      };
    }),
    loadEntitySnapshot: jest.fn().mockResolvedValue(null),
    assertVehicleInOrganization: jest.fn(),
    assertEntityInOrganization: jest.fn(),
  };
}

export function makeVehicleCandidateResolverMock() {
  return {
    resolve: jest.fn().mockResolvedValue({
      evaluatedAt: new Date().toISOString(),
      hints: {},
      candidates: [],
      blockerPresent: false,
      autoConfirmEligible: false,
    }),
  };
}

export function makeBookingCandidateResolverMock() {
  return {
    supportsDocumentType: jest.fn((type: string) => ['FINE', 'INVOICE', 'DAMAGE', 'ACCIDENT'].includes(type)),
    resolve: jest.fn().mockResolvedValue({
      evaluatedAt: new Date().toISOString(),
      hints: { eventTimePrecision: 'missing' },
      candidates: [],
      ambiguousOverlap: false,
      autoConfirmEligible: false,
    }),
  };
}

export function makeCustomerCandidateResolverMock() {
  return {
    supportsDocumentType: jest.fn((type: string) =>
      ['FINE', 'INVOICE', 'DAMAGE', 'ACCIDENT', 'OTHER'].includes(type),
    ),
    resolve: jest.fn().mockResolvedValue({
      evaluatedAt: new Date().toISOString(),
      hints: {
        customerNumberPresent: false,
        bookingLinkPresent: false,
        namePresent: false,
        emailPresent: false,
        phonePresent: false,
        addressPresent: false,
        documentReferencePresent: false,
      },
      candidates: [],
      ambiguousNameMatch: false,
      autoConfirmEligible: false,
    }),
  };
}

export function makeDriverCandidateResolverMock() {
  return {
    supportsDocumentType: jest.fn((type: string) => ['FINE', 'ACCIDENT', 'DAMAGE'].includes(type)),
    resolve: jest.fn().mockResolvedValue({
      evaluatedAt: new Date().toISOString(),
      hints: {
        driverNamePresent: false,
        licensePresent: false,
        driverIdPresent: false,
        bookingLinkPresent: false,
        tripAssignmentPresent: false,
      },
      candidates: [],
      ambiguousDriverPool: false,
      unassignedDriver: false,
      autoConfirmEligible: false,
    }),
  };
}

export function makePartnerCandidateResolverMock() {
  return {
    supportsDocumentType: jest.fn((type: string) =>
      ['INVOICE', 'SERVICE', 'OIL_CHANGE', 'TIRE', 'BRAKE', 'BATTERY', 'TUV_REPORT', 'BOKRAFT_REPORT', 'FINE', 'DAMAGE', 'ACCIDENT'].includes(type),
    ),
    resolve: jest.fn().mockResolvedValue({
      evaluatedAt: new Date().toISOString(),
      hints: {
        organizationNamePresent: false,
        ibanPresent: false,
        vatIdPresent: false,
        taxIdPresent: false,
        emailPresent: false,
        addressPresent: false,
        vendorIdPresent: false,
        expectedPartnerKind: 'WORKSHOP',
      },
      candidates: [],
      newPartnerSuggestion: null,
      ambiguousPartnerMatch: false,
      autoConfirmEligible: false,
    }),
  };
}

export function makeLifecycleMock() {
  return {
    buildStorageCapabilitiesSnapshot: jest.fn().mockReturnValue({
      provider: 'local',
      zones: ['quarantine', 'clean'],
      transport: { apiTransport: 'https', providerTransport: 'local-filesystem' },
      encryptionAtRest: { declared: false, provider: 'none' },
      backup: { strategy: 'none', documentObjectsIncluded: false },
    }),
    seedLifecycleOnCreate: jest.fn((plausibility: unknown) => plausibility),
    softDeleteFile: jest.fn(async ({ record, userId }: { record: { id: string }; userId?: string | null }) => ({
      ...record,
      objectKey: null,
      fileDeletedAt: new Date(),
      fileDeletedById: userId ?? null,
    })),
    setLegalHold: jest.fn(),
    clearLegalHold: jest.fn(),
    recordDownloadAudit: jest.fn(),
    assertNotOnLegalHold: jest.fn(),
    hasDownstreamLinks: jest.fn().mockReturnValue(false),
    redactSensitiveExtractedData: jest.fn().mockReturnValue(null),
  };
}

export function makeRetentionMock() {
  return {
    runOnce: jest.fn().mockResolvedValue({
      trigger: 'manual',
      dryRun: true,
      phases: [],
      totals: { candidates: 0, affected: 0, skipped: 0 },
    }),
  };
}

export function makeStorageMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    putObject: jest.fn().mockResolvedValue({
      objectKey: 'organizations/org-1/vehicles/v1/documents/2026/07/ext-1.pdf',
      storageProvider: 'local',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    }),
    putQuarantineObject: jest.fn().mockResolvedValue({
      objectKey: 'quarantine/organizations/org-1/vehicles/v1/documents/2026/07/ext-1.pdf',
      storageProvider: 'local',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    }),
    promoteQuarantineToClean: jest.fn().mockResolvedValue({
      objectKey: 'organizations/org-1/vehicles/v1/documents/2026/07/ext-1.pdf',
      storageProvider: 'local',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    }),
    getObject: jest.fn(),
    getObjectStream: jest.fn(),
    deleteObject: jest.fn(),
    getInternalPath: jest.fn().mockReturnValue(null),
    getCapabilities: jest.fn().mockReturnValue({
      provider: 'local',
      zones: ['quarantine', 'clean'],
      transport: { apiTransport: 'https', providerTransport: 'local-filesystem' },
      encryptionAtRest: { declared: false, provider: 'none' },
      backup: { strategy: 'none', documentObjectsIncluded: false },
    }),
    resolveStorageZone: jest.fn().mockReturnValue('clean'),
    ...overrides,
  };
}
