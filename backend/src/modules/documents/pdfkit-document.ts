import type PDFKit from 'pdfkit';

/**
 * pdfkit's CJS export is the constructor itself. TypeScript `import PDFDocument from 'pdfkit'`
 * compiles to `require('pdfkit').default`, which is undefined at runtime in production.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const PDFDocument = require('pdfkit') as typeof PDFKit;
