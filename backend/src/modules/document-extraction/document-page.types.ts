import { DocumentTextSourceMethod } from './document-content-extraction.types';

/** A logical page or text block with optional page number. */
export interface DocumentPageBlock {
  /** 1-based page number when known; null for TXT logical sections. */
  pageNumber: number | null;
  text: string;
  sourceMethod: DocumentTextSourceMethod;
  /** False when page boundaries were inferred (e.g. flat PDF text). */
  hasReliablePageBoundaries: boolean;
}

export interface DocumentStructuredContent {
  /** Full concatenated text for backward compatibility. */
  text: string;
  pages: DocumentPageBlock[];
  pageBoundaryReliable: boolean;
  sourceMethod: DocumentTextSourceMethod;
  pageCount?: number;
}
