import type { InvoiceDocumentsViewDto } from '../invoice-document-read.types';
import type { InvoiceDocumentsReadService } from '../invoice-documents-read.service';

export function mockInvoiceDocumentsRead(
  view: Partial<InvoiceDocumentsViewDto> = {},
): Pick<InvoiceDocumentsReadService, 'getDocumentsForInvoice' | 'getDocumentsForInvoicesBatch'> {
  const defaultView: InvoiceDocumentsViewDto = {
    activeDocumentId: null,
    cacheMismatch: false,
    documents: [],
    ...view,
  };
  return {
    getDocumentsForInvoice: jest.fn().mockResolvedValue(defaultView),
    getDocumentsForInvoicesBatch: jest.fn().mockResolvedValue(new Map()),
  };
}
