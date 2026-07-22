import type { LegalDocumentScopeService } from './legal-document-scope.service';

export function createNoopLegalDocumentScopeService(): LegalDocumentScopeService {
  return {
    loadScopeDocuments: jest.fn().mockResolvedValue([]),
    assertStationsBelongToOrg: jest.fn().mockResolvedValue(undefined),
    detectConflictsForCandidate: jest.fn().mockResolvedValue([]),
    assertNoScopeConflicts: jest.fn().mockResolvedValue(undefined),
    findIdenticalScopePeers: jest.fn().mockReturnValue([]),
    replaceStationScope: jest.fn().mockResolvedValue(undefined),
    detectConflictsAmong: jest.fn().mockReturnValue([]),
  } as unknown as LegalDocumentScopeService;
}
