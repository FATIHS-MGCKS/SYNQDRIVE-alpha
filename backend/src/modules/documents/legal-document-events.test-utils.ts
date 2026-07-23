import { LegalDocumentEventsService } from './legal-document-events.service';

export function createNoopLegalDocumentEventsService(): LegalDocumentEventsService {
  return {
    appendInTransaction: jest.fn().mockResolvedValue({ id: 'evt-test' }),
    listForDocument: jest.fn(),
    listForOrganization: jest.fn(),
    toDto: jest.fn((event) => event),
  } as unknown as LegalDocumentEventsService;
}
