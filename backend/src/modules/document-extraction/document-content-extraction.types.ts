import type { DocumentPageBlock } from './document-page.types';

export type DocumentTextSourceMethod = 'TXT_DIRECT' | 'TEXT_LAYER' | 'OCR';

export interface DocumentContentExtractionInput {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  extractionId?: string;
}

export interface DocumentContentExtractionResult {
  text: string;
  sourceMethod: DocumentTextSourceMethod;
  normalizedMimeType: string;
  displayFileName: string;
  pageCount?: number;
  ocrProvider?: string;
  ocrModel?: string;
  /** Page-aware blocks for chunked AI extraction. */
  pages: DocumentPageBlock[];
  pageBoundaryReliable: boolean;
}
