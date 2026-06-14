/**
 * Renderer-agnostic document model.
 *
 * Templates build a `RenderableDocument` (structured sections, not raw HTML),
 * and a renderer turns it into a PDF buffer. We deliberately model structured
 * content instead of an `html` string because the default renderer is a pure-JS
 * (pdfkit) implementation with NO headless browser — keeping the model abstract
 * means a future Chromium/HTML renderer can be bound to the same DOCUMENT_RENDERER
 * token without changing any template or service.
 */

export interface RenderableParty {
  heading: string;
  lines: string[];
}

export interface RenderKeyValue {
  label: string;
  value: string;
}

export interface RenderTableColumn {
  header: string;
  /** Relative width weight (defaults to equal). */
  width?: number;
  align?: 'left' | 'right' | 'center';
}

export interface RenderTotalRow {
  label: string;
  value: string;
  emphasize?: boolean;
}

export interface RenderSignature {
  label: string;
  name?: string | null;
  /** PNG data URL captured by the signature pad, if signed digitally. */
  dataUrl?: string | null;
}

export type RenderSection =
  | { kind: 'keyValues'; heading?: string; rows: RenderKeyValue[]; columns?: 1 | 2 }
  | { kind: 'table'; heading?: string; columns: RenderTableColumn[]; rows: string[][] }
  | { kind: 'totals'; heading?: string; rows: RenderTotalRow[] }
  | { kind: 'paragraph'; heading?: string; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'legalRefs'; heading?: string; items: RenderKeyValue[] }
  | { kind: 'signatures'; heading?: string; signatures: RenderSignature[] };

export interface RenderableOrg {
  name: string;
  addressLines: string[];
  contactLines: string[];
  taxId?: string | null;
  logoUrl?: string | null;
}

export interface RenderableDocument {
  documentTitle: string;
  documentNumber?: string | null;
  documentDate?: string | null;
  org: RenderableOrg;
  /** Up to two parties drawn side-by-side (e.g. seller / customer). */
  parties?: RenderableParty[];
  /** Compact label/value meta grid (booking ref, vehicle, period…). */
  meta?: RenderKeyValue[];
  sections: RenderSection[];
  footerLines?: string[];
}

/** DI token for the swappable renderer (pdfkit today, Chromium/HTML later). */
export const DOCUMENT_RENDERER = Symbol('DOCUMENT_RENDERER');

export interface DocumentRenderInput {
  document: RenderableDocument;
  fileName: string;
  documentType: string;
  organizationId: string;
  bookingId?: string | null;
}

export interface DocumentRenderer {
  /** Renders a structured document to a PDF buffer. */
  renderPdf(input: DocumentRenderInput): Promise<Buffer>;
}
