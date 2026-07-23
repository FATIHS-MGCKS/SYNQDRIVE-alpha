import { BadRequestException } from '@nestjs/common';
import {
  HANDOVER_SIGNATURE_ALLOWED_MIME_TYPES,
  HANDOVER_SIGNATURE_MAX_BYTES,
} from './booking-handover-signature.constants';

export interface ParsedSignatureDataUrl {
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

export function parseAndValidateSignatureDataUrl(
  dataUrl: string,
): ParsedSignatureDataUrl {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new BadRequestException('Signature data URL is required');
  }

  const trimmed = dataUrl.trim();
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/s.exec(trimmed);
  if (!match) {
    throw new BadRequestException(
      'Signature must be a base64 data URL (data:image/png;base64,...)',
    );
  }

  const mimeType = match[1].toLowerCase();
  if (!HANDOVER_SIGNATURE_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new BadRequestException(
      `Unsupported signature MIME type "${mimeType}". Allowed: ${[...HANDOVER_SIGNATURE_ALLOWED_MIME_TYPES].join(', ')}`,
    );
  }

  const base64 = match[2].replace(/\s/g, '');
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw new BadRequestException('Signature base64 payload is invalid');
  }

  if (buffer.length === 0) {
    throw new BadRequestException('Signature image is empty');
  }

  if (buffer.length > HANDOVER_SIGNATURE_MAX_BYTES) {
    throw new BadRequestException(
      `Signature image too large (${(buffer.length / 1024).toFixed(0)} KiB). Max ${(
        HANDOVER_SIGNATURE_MAX_BYTES / 1024
      ).toFixed(0)} KiB.`,
    );
  }

  return {
    mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
    buffer,
    sizeBytes: buffer.length,
  };
}

export function signatureDataUrlPresent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
