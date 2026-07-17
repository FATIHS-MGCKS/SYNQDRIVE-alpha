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
    }) => {
      if (params.vehicleId) {
        return {
          organizationId: params.organizationId,
          vehicleId: params.vehicleId,
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
          uploadContextType: 'VEHICLE',
          uploadContextId: id,
        };
      }
      return {
        organizationId: params.organizationId,
        vehicleId: null,
        uploadContextType: null,
        uploadContextId: null,
      };
    }),
    assertVehicleInOrganization: jest.fn(),
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
