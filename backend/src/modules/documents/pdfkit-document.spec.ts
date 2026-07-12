import { PDFDocument } from './pdfkit-document';

describe('pdfkit-document', () => {
  it('exports a constructable PDFDocument (not .default)', () => {
    expect(typeof PDFDocument).toBe('function');
    const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true });
    expect(doc).toBeDefined();
    doc.end();
  });
});
