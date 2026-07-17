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
    ...overrides,
  };
}
