import type { DocumentPdfProbeResult } from './document-file-identification-status.types';

const PDF_HEADER = '%PDF-';
const MAX_PROBE_BYTES = 8 * 1024 * 1024;

export function probePdfBuffer(buffer: Buffer): DocumentPdfProbeResult {
  const sample = buffer.subarray(0, Math.min(buffer.length, MAX_PROBE_BYTES));
  const ascii = sample.toString('latin1');

  if (!ascii.startsWith(PDF_HEADER)) {
    return corruptResult('Missing PDF header');
  }

  const hasEof = ascii.includes('%%EOF');
  const hasStartXref = /startxref\s+\d+/i.test(ascii);
  if (!hasEof && !hasStartXref) {
    return corruptResult('Missing PDF trailer');
  }

  const objCount = countPatternMatches(ascii, /\d+\s+\d+\s+obj\b/g);
  const endObjCount = countPatternMatches(ascii, /\bendobj\b/g);
  if (objCount > 0 && endObjCount === 0) {
    return corruptResult('Truncated PDF object stream');
  }

  const passwordProtected = isPasswordProtectedPdf(ascii);
  const streamCount = countPatternMatches(ascii, /\bstream\b/g);
  const estimatedDecompressedBytes = estimatePdfDecompressedBytes(ascii);
  const pageCount = estimatePdfPageCount(ascii);

  return {
    pageCount,
    objectCount: objCount,
    streamCount,
    estimatedDecompressedBytes,
    passwordProtected,
    corrupt: false,
  };
}

function corruptResult(reason: string): DocumentPdfProbeResult {
  return {
    pageCount: 0,
    objectCount: 0,
    streamCount: 0,
    estimatedDecompressedBytes: 0,
    passwordProtected: false,
    corrupt: true,
    corruptReason: reason,
  };
}

function countPatternMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches?.length ?? 0;
}

function isPasswordProtectedPdf(ascii: string): boolean {
  if (!/\/Encrypt\b/.test(ascii)) return false;
  // Ignore bare mentions in comments; require dictionary-style markers nearby.
  return /<<[^>]*\/Encrypt\b/.test(ascii) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(ascii);
}

function estimatePdfPageCount(ascii: string): number {
  const countValues = [...ascii.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const validCounts = countValues.filter((n) => Number.isFinite(n) && n > 0);
  if (validCounts.length > 0) {
    return Math.max(...validCounts);
  }

  const pageObjects = countPatternMatches(ascii, /\/Type\s*\/Page\b(?!s)/g);
  return Math.max(pageObjects, 1);
}

function estimatePdfDecompressedBytes(ascii: string): number {
  let total = 0;
  for (const match of ascii.matchAll(/\/Length\s+(\d+)/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      total += value;
      if (total > Number.MAX_SAFE_INTEGER) {
        return Number.MAX_SAFE_INTEGER;
      }
    }
  }
  return total;
}
