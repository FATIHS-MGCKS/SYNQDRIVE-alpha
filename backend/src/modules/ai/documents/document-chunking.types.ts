import { DocumentPageBlock } from '@modules/document-extraction/document-page.types';

export interface DocumentChunkingLimits {
  targetChars: number;
  maxChars: number;
  maxPages: number;
  maxChunks: number;
  overlapChars: number;
}

export interface DocumentTextChunk {
  chunkIndex: number;
  text: string;
  /** Inclusive 1-based page numbers covered by this chunk (empty when unknown). */
  pageNumbers: number[];
  /** Logical block indices for TXT without page numbers. */
  blockIndexes: number[];
  estimatedTokens: number;
  pageBoundaryReliable: boolean;
}

export interface DocumentChunkingResult {
  chunks: DocumentTextChunk[];
  totalPages: number;
  totalChars: number;
  limitExceeded: boolean;
  limitCode?: 'MAX_PAGES' | 'MAX_CHUNKS' | 'MAX_CHARS';
  limitMessage?: string;
  /** Pages (1-based) not covered by any chunk when limits forced truncation. */
  uncoveredPageNumbers: number[];
  warnings: string[];
}

export interface DocumentChunkingInput {
  pages: DocumentPageBlock[];
  limits: DocumentChunkingLimits;
}
