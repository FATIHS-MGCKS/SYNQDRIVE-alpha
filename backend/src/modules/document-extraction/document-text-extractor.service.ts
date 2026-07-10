import { Injectable, Logger } from '@nestjs/common';

/** Minimal structural type for the pdf-parse v2 `PDFParse` class we rely on. */
interface PdfPageText {
  num: number;
  text?: string;
}

interface PdfTextResult {
  text?: string;
  pages?: PdfPageText[];
  total?: number;
}

interface PdfParseInstance {
  getText(params?: { pageJoiner?: string }): Promise<PdfTextResult>;
  destroy(): Promise<void>;
}
type PdfParseCtor = new (options: { data: Uint8Array }) => PdfParseInstance;

export interface PdfTextExtractionResult {
  text: string;
  pages: Array<{ pageNumber: number; text: string }>;
  pageBoundaryReliable: boolean;
}

/**
 * Local text extraction helpers — PDF text layer and plain UTF-8 only.
 * OCR routing is handled by {@link DocumentContentExtractorService}.
 */
@Injectable()
export class DocumentTextExtractorService {
  private readonly logger = new Logger(DocumentTextExtractorService.name);
  private pdfParseCtor: PdfParseCtor | null = null;

  extractPlainText(buffer: Buffer): string {
    return buffer.toString('utf8');
  }

  /**
   * Attempts to read a digital PDF text layer with per-page blocks when available.
   */
  async tryExtractPdfText(buffer: Buffer): Promise<PdfTextExtractionResult | null> {
    const PdfParse = await this.loadPdfParse();
    let parser: PdfParseInstance | null = null;
    try {
      parser = new PdfParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText({ pageJoiner: '\n\n' });
      const text = (result?.text ?? '').trim();
      if (!text) return null;

      const pagesFromParser =
        result.pages
          ?.map((page) => ({
            pageNumber: page.num,
            text: (page.text ?? '').trim(),
          }))
          .filter((p) => p.text.length > 0) ?? [];

      if (pagesFromParser.length > 0) {
        return {
          text,
          pages: pagesFromParser,
          pageBoundaryReliable: true,
        };
      }

      return {
        text,
        pages: this.inferPdfPagesFromFlatText(text),
        pageBoundaryReliable: false,
      };
    } catch (err) {
      this.logger.warn(`PDF text extraction failed: ${(err as Error).message}`);
      return null;
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  private inferPdfPagesFromFlatText(text: string): Array<{ pageNumber: number; text: string }> {
    const byFormFeed = text.split('\f').map((part) => part.trim()).filter(Boolean);
    if (byFormFeed.length > 1) {
      return byFormFeed.map((part, idx) => ({ pageNumber: idx + 1, text: part }));
    }
    return [{ pageNumber: 1, text }];
  }

  private async loadPdfParse(): Promise<PdfParseCtor> {
    if (this.pdfParseCtor) return this.pdfParseCtor;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('pdf-parse');
    const ctor = (mod.PDFParse ?? mod.default?.PDFParse ?? mod.default ?? mod) as PdfParseCtor;
    this.pdfParseCtor = ctor;
    return ctor;
  }
}
