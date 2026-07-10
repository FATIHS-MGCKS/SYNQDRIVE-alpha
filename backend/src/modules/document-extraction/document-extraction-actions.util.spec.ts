import { getAllowedDocumentExtractionActions } from './document-extraction-actions.util';

describe('getAllowedDocumentExtractionActions', () => {
  it('allows confirm and reextract on READY_FOR_REVIEW', () => {
    const actions = getAllowedDocumentExtractionActions({
      status: 'READY_FOR_REVIEW',
      objectKey: 'k1',
      effectiveDocumentType: 'INVOICE',
    });
    expect(actions).toEqual(
      expect.arrayContaining(['download', 'confirm', 'reextract', 'set_document_type', 'delete_file', 'cancel']),
    );
  });

  it('allows set_document_type on AWAITING_DOCUMENT_TYPE', () => {
    const actions = getAllowedDocumentExtractionActions({
      status: 'AWAITING_DOCUMENT_TYPE',
      objectKey: 'k1',
      effectiveDocumentType: null,
    });
    expect(actions).toEqual(
      expect.arrayContaining(['set_document_type', 'download', 'cancel', 'delete_file']),
    );
    expect(actions).not.toContain('confirm');
  });

  it('allows retry on FAILED when type is resolved', () => {
    const actions = getAllowedDocumentExtractionActions({
      status: 'FAILED',
      objectKey: 'k1',
      effectiveDocumentType: 'SERVICE',
    });
    expect(actions).toContain('retry');
  });

  it('does not allow actions on APPLIED', () => {
    const actions = getAllowedDocumentExtractionActions({
      status: 'APPLIED',
      objectKey: 'k1',
      effectiveDocumentType: 'SERVICE',
    });
    expect(actions).toEqual(['download']);
  });
});
