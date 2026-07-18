export const DOCUMENT_FILE_IDENTIFICATION_STATUSES = {
  ACCEPTED: 'ACCEPTED',
  REQUIRES_PASSWORD: 'REQUIRES_PASSWORD',
  REJECTED_CORRUPT: 'REJECTED_CORRUPT',
  REJECTED_TOO_COMPLEX: 'REJECTED_TOO_COMPLEX',
  REJECTED_TOO_MANY_PAGES: 'REJECTED_TOO_MANY_PAGES',
  OCR_REQUIRED: 'OCR_REQUIRED',
} as const;

export type DocumentFileIdentificationStatus =
  (typeof DOCUMENT_FILE_IDENTIFICATION_STATUSES)[keyof typeof DOCUMENT_FILE_IDENTIFICATION_STATUSES];

export interface DocumentFilePreprocessLimits {
  timeoutMs: number;
  maxPdfPages: number;
  maxImagePixels: number;
  maxDecompressedBytes: number;
  maxPdfObjects: number;
  maxPdfStreams: number;
}

export interface DocumentPdfProbeResult {
  pageCount: number;
  objectCount: number;
  streamCount: number;
  estimatedDecompressedBytes: number;
  passwordProtected: boolean;
  corrupt: boolean;
  corruptReason?: string;
}

export interface DocumentImageProbeResult {
  width: number;
  height: number;
  pixelCount: number;
  rotationDegrees: 0 | 90 | 180 | 270;
  corrupt: boolean;
  corruptReason?: string;
}
