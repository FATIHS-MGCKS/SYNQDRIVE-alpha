import type {
  DocumentURLChunk,
  ImageURLChunk,
  OCRPageObject,
  OCRResponse,
} from '@mistralai/mistralai/models/components';
import {
  MISTRAL_OCR_SUPPORTED_MIME_TYPES,
  MistralOcrOutput,
  MistralOcrPage,
  MistralOcrSupportedMimeType,
} from './mistral-ocr.types';

const PAGE_MARKER_PREFIX = '--- PAGE ';

export function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

export function isSupportedOcrMimeType(mimeType: string): mimeType is MistralOcrSupportedMimeType {
  const normalized = normalizeMimeType(mimeType);
  return (MISTRAL_OCR_SUPPORTED_MIME_TYPES as readonly string[]).includes(normalized);
}

export function buildDataUrl(buffer: Buffer, mimeType: string): string {
  const normalized = normalizeMimeType(mimeType);
  const imageMime =
    normalized === 'image/jpg' ? 'image/jpeg' : normalized;
  return `data:${imageMime};base64,${buffer.toString('base64')}`;
}

export function buildOcrDocument(input: {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}): DocumentURLChunk | ImageURLChunk {
  const normalized = normalizeMimeType(input.mimeType);
  const dataUrl = buildDataUrl(input.buffer, normalized);

  if (normalized === 'application/pdf') {
    return {
      type: 'document_url',
      documentUrl: dataUrl,
      documentName: input.originalName ?? 'document.pdf',
    };
  }

  return {
    type: 'image_url',
    imageUrl: dataUrl,
  };
}

function mapPage(page: OCRPageObject): MistralOcrPage {
  return {
    pageIndex: page.index,
    pageNumber: page.index + 1,
    markdown: page.markdown ?? '',
    header: page.header ?? null,
    footer: page.footer ?? null,
    tables: page.tables?.map((table) => ({
      id: table.id,
      format: table.format,
      content: table.content,
    })),
  };
}

export function buildPageMarkedMarkdown(pages: MistralOcrPage[]): string {
  return pages
    .map((page) => `${PAGE_MARKER_PREFIX}${page.pageNumber} ---\n${page.markdown}`)
    .join('\n\n');
}

export function normalizeOcrResponse(params: {
  response: OCRResponse;
  provider: 'mistral';
  modelFallback: string;
  processingDurationMs: number;
}): MistralOcrOutput {
  const sortedPages = [...params.response.pages].sort((a, b) => a.index - b.index);
  const pages = sortedPages.map(mapPage);
  const normalizedMarkdown = buildPageMarkedMarkdown(pages);

  return {
    fullText: normalizedMarkdown,
    normalizedMarkdown,
    pages,
    pageCount: pages.length,
    provider: params.provider,
    model: params.response.model || params.modelFallback,
    processingDurationMs: params.processingDurationMs,
    usage: {
      pagesProcessed: params.response.usageInfo.pagesProcessed,
      docSizeBytes: params.response.usageInfo.docSizeBytes ?? null,
    },
  };
}
