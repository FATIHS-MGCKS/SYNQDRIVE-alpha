import { extname } from 'node:path';
import { fromBuffer } from 'file-type';
import type { OperatorUploadKind } from '@prisma/client';
import { probeJpegBuffer, probePngBuffer, probeWebpBuffer } from '@modules/document-extraction/document-image-probe.util';
import { probePdfBuffer } from '@modules/document-extraction/document-pdf-probe.util';
import { sanitizeDocumentFileName } from '@modules/documents/storage/document-storage-key.util';
import {
  OPERATOR_UPLOAD_ALLOWED_EXTENSIONS,
  OPERATOR_UPLOAD_ALLOWED_MIME,
  OPERATOR_UPLOAD_ERROR,
  OPERATOR_UPLOAD_KIND_ALLOWED_MIME,
  OPERATOR_UPLOAD_MAX_BYTES,
  OPERATOR_UPLOAD_MAX_DIMENSION,
  OPERATOR_UPLOAD_MAX_PIXELS,
} from './operator-upload.constants';

export interface OperatorUploadSecurityResult {
  ok: boolean;
  code?: string;
  message?: string;
  retryable?: boolean;
  sanitizedFileName?: string;
  detectedMime?: string;
  hardenedBuffer?: Buffer;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

export function sanitizeOperatorUploadFileName(originalName: string | null | undefined, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()] ?? '';
  const sanitized = sanitizeDocumentFileName(originalName || `upload${ext || '.bin'}`);
  if (ext && !sanitized.toLowerCase().endsWith(ext)) {
    return `${sanitized.replace(/\.[a-z0-9]+$/i, '')}${ext}`;
  }
  return sanitized;
}

function extensionAllowed(fileName: string | null | undefined): boolean {
  const ext = extname(String(fileName || '')).toLowerCase();
  if (!ext) return true;
  return OPERATOR_UPLOAD_ALLOWED_EXTENSIONS.has(ext);
}

function assertImageDimensions(
  width: number,
  height: number,
): OperatorUploadSecurityResult | { ok: true } {
  if (width <= 0 || height <= 0) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Invalid image dimensions',
      retryable: false,
    };
  }
  if (width > OPERATOR_UPLOAD_MAX_DIMENSION || height > OPERATOR_UPLOAD_MAX_DIMENSION) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: `Image exceeds ${OPERATOR_UPLOAD_MAX_DIMENSION}px per side`,
      retryable: false,
    };
  }
  const pixels = width * height;
  if (pixels > OPERATOR_UPLOAD_MAX_PIXELS) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Image pixel count exceeds allowed limit',
      retryable: false,
    };
  }
  return { ok: true };
}

export function stripJpegSensitiveMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xd9) {
      parts.push(buffer.subarray(offset));
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) break;
    // Remove APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) — location and PII metadata.
    if (marker === 0xe1 || marker === 0xed) {
      offset += 2 + segmentLength;
      continue;
    }
    parts.push(buffer.subarray(offset, offset + 2 + segmentLength));
    offset += 2 + segmentLength;
  }
  return Buffer.concat(parts);
}

export async function validateAndHardenOperatorUpload(input: {
  buffer: Buffer;
  mimeType: string | null | undefined;
  fileName?: string | null;
  kind: OperatorUploadKind;
}): Promise<OperatorUploadSecurityResult> {
  if (!input.buffer?.length) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Empty upload payload',
      retryable: false,
    };
  }
  if (input.buffer.length > OPERATOR_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: `File exceeds ${OPERATOR_UPLOAD_MAX_BYTES} bytes`,
      retryable: false,
    };
  }

  const mime = (input.mimeType ?? '').toLowerCase();
  if (!mime || !OPERATOR_UPLOAD_ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: `MIME type not allowed: ${mime || 'unknown'}`,
      retryable: false,
    };
  }

  const kindMime = OPERATOR_UPLOAD_KIND_ALLOWED_MIME[input.kind];
  if (kindMime && !kindMime.has(mime)) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: `MIME type not allowed for upload kind ${input.kind}`,
      retryable: false,
    };
  }

  if (!extensionAllowed(input.fileName)) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'File extension not allowed',
      retryable: false,
    };
  }

  const detected = await fromBuffer(input.buffer);
  if (!detected?.mime) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Unable to identify file content',
      retryable: false,
    };
  }

  const detectedMime = detected.mime.toLowerCase();
  if (!OPERATOR_UPLOAD_ALLOWED_MIME.has(detectedMime)) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Detected file type is not allowed',
      retryable: false,
    };
  }

  if (detectedMime !== mime && !(mime === 'image/jpg' && detectedMime === 'image/jpeg')) {
    return {
      ok: false,
      code: OPERATOR_UPLOAD_ERROR.VALIDATION,
      message: 'Declared MIME type does not match file content',
      retryable: false,
    };
  }

  let hardenedBuffer = input.buffer;
  if (detectedMime === 'image/jpeg' || detectedMime === 'image/jpg') {
    const probe = probeJpegBuffer(hardenedBuffer);
    if (probe.corrupt) {
      return {
        ok: false,
        code: OPERATOR_UPLOAD_ERROR.VALIDATION,
        message: 'Corrupt JPEG image',
        retryable: false,
      };
    }
    const dimCheck = assertImageDimensions(probe.width, probe.height);
    if (!dimCheck.ok) return dimCheck;
    hardenedBuffer = stripJpegSensitiveMetadata(hardenedBuffer);
  } else if (detectedMime === 'image/png') {
    const probe = probePngBuffer(hardenedBuffer);
    if (probe.corrupt) {
      return {
        ok: false,
        code: OPERATOR_UPLOAD_ERROR.VALIDATION,
        message: 'Corrupt PNG image',
        retryable: false,
      };
    }
    const dimCheck = assertImageDimensions(probe.width, probe.height);
    if (!dimCheck.ok) return dimCheck;
  } else if (detectedMime === 'image/webp') {
    const probe = probeWebpBuffer(hardenedBuffer);
    if (probe.corrupt) {
      return {
        ok: false,
        code: OPERATOR_UPLOAD_ERROR.VALIDATION,
        message: 'Corrupt WebP image',
        retryable: false,
      };
    }
    const dimCheck = assertImageDimensions(probe.width, probe.height);
    if (!dimCheck.ok) return dimCheck;
  } else if (detectedMime === 'application/pdf') {
    const probe = probePdfBuffer(hardenedBuffer);
    if (probe.corrupt) {
      return {
        ok: false,
        code: OPERATOR_UPLOAD_ERROR.VALIDATION,
        message: 'Corrupt PDF document',
        retryable: false,
      };
    }
  }

  const resolvedMime = detectedMime === 'image/jpg' ? 'image/jpeg' : detectedMime;
  return {
    ok: true,
    sanitizedFileName: sanitizeOperatorUploadFileName(input.fileName, resolvedMime),
    detectedMime: resolvedMime,
    hardenedBuffer,
  };
}
