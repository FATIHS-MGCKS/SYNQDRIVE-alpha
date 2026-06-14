import { Injectable, Logger } from '@nestjs/common';
import { OcrNotConfiguredError, UnsupportedFileTypeError } from './document-extraction.errors';

export interface TextExtractionInput {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface TextExtractionResult {
  /** Plain UTF-8 text extracted from the document. */
  text: string;
  /** Which extractor produced the text: 'pdf' | 'text'. */
  method: string;
}

/** Minimal structural type for the pdf-parse v2 `PDFParse` class we rely on. */
interface PdfParseInstance {
  getText(params?: { pageJoiner?: string }): Promise<{ text?: string }>;
  destroy(): Promise<void>;
}
type PdfParseCtor = new (options: { data: Uint8Array }) => PdfParseInstance;

/**
 * Extracts plain text from uploaded documents BEFORE the AI agent is involved.
 *
 * DIMO Agents are a vehicle-aware reasoning layer, not a raw OCR/parse API, so
 * the worker always extracts text first and only sends text to the agent.
 *
 * Implemented now:
 *  - PDF (digital/text-based) via `pdf-parse` v2 (`PDFParse` class, pdfjs-based)
 *  - plain text (UTF-8)
 *
 * Intentionally NOT implemented (kept modular for a future vision model):
 *  - image OCR (PNG/JPEG/WebP) → throws {@link OcrNotConfiguredError}
 *  - scanned/image-only PDFs (no extractable text) → throws OcrNotConfiguredError
 */
@Injectable()
export class DocumentTextExtractorService {
  private readonly logger = new Logger(DocumentTextExtractorService.name);

  // pdf-parse v2 PDFParse class; cached after first lazy load.
  private pdfParseCtor: PdfParseCtor | null = null;

  async extractText(input: TextExtractionInput): Promise<TextExtractionResult> {
    const mime = (input.mimeType || '').toLowerCase();

    if (mime === 'application/pdf') {
      return this.extractFromPdf(input.buffer);
    }
    if (mime === 'text/plain') {
      return { text: input.buffer.toString('utf8'), method: 'text' };
    }
    if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp') {
      // Honest failure — we never fabricate OCR output for images.
      return this.extractFromImage();
    }
    throw new UnsupportedFileTypeError(`Cannot extract text from type "${input.mimeType}"`);
  }

  private async extractFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
    const PdfParse = await this.loadPdfParse();
    let text = '';
    let parser: PdfParseInstance | null = null;
    try {
      parser = new PdfParse({ data: new Uint8Array(buffer) });
      // pageJoiner: '' suppresses the library's "-- n of m --" page markers so
      // the agent receives clean document text only.
      const result = await parser.getText({ pageJoiner: '' });
      text = (result?.text ?? '').trim();
    } catch (err) {
      // Do not log document contents; only the failure reason.
      this.logger.warn(`PDF text extraction failed: ${(err as Error).message}`);
      throw new OcrNotConfiguredError(
        'Could not read text from this PDF. It may be scanned/image-based; OCR is not configured yet.',
      );
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
    if (text.length === 0) {
      throw new OcrNotConfiguredError(
        'This PDF contains no extractable text (likely scanned/image-based); OCR is not configured yet.',
      );
    }
    return { text, method: 'pdf' };
  }

  private extractFromImage(): never {
    throw new OcrNotConfiguredError('Image OCR is not configured yet');
  }

  private async loadPdfParse(): Promise<PdfParseCtor> {
    if (this.pdfParseCtor) return this.pdfParseCtor;
    // pdf-parse v2 is ESM-first but ships a CommonJS build via its `require`
    // export condition, so require() resolves the .cjs bundle that exports the
    // `PDFParse` class. (v1's `lib/pdf-parse.js` path no longer exists.)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('pdf-parse');
    const ctor = (mod.PDFParse ?? mod.default?.PDFParse ?? mod.default ?? mod) as PdfParseCtor;
    this.pdfParseCtor = ctor;
    return ctor;
  }
}
