import { createHash } from 'crypto';
import { sanitizeDocumentFileName } from '@modules/documents/storage/document-storage-key.util';
import {
  COMMUNICATION_ATTACHMENT_ALLOWED_DOCUMENT_MIMES,
  COMMUNICATION_ATTACHMENT_ALLOWED_IMAGE_MIMES,
  COMMUNICATION_ATTACHMENT_MAX_DOCUMENT_BYTES,
  COMMUNICATION_ATTACHMENT_MAX_IMAGE_BYTES,
} from './communication-attachment.constants';
import { CommunicationAttachmentError } from './communication-attachment.errors';

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

export type CommunicationAttachmentMediaKind = 'IMAGE' | 'DOCUMENT';

export function sanitizeAttachmentFileName(originalName: string): string {
  const stripped = String(originalName || 'attachment')
    .replace(/[\0\r\n<>"']/g, '')
    .replace(/[/\\]/g, '_')
    .trim()
    .slice(0, 120);
  const base = stripped || 'attachment';
  return sanitizeDocumentFileName(base);
}

export function detectMediaKindFromMime(mimeType: string): CommunicationAttachmentMediaKind | null {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (COMMUNICATION_ATTACHMENT_ALLOWED_IMAGE_MIMES.has(normalized)) return 'IMAGE';
  if (COMMUNICATION_ATTACHMENT_ALLOWED_DOCUMENT_MIMES.has(normalized)) return 'DOCUMENT';
  return null;
}

function matchesMagic(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

export function assertBufferMatchesMime(buffer: Buffer, mimeType: string): void {
  const normalized = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (buffer.length === 0) {
    throw CommunicationAttachmentError.emptyFile();
  }

  switch (normalized) {
    case 'image/jpeg':
      if (!matchesMagic(buffer, JPEG_MAGIC)) {
        throw CommunicationAttachmentError.mimeMismatch();
      }
      break;
    case 'image/png':
      if (!matchesMagic(buffer, PNG_MAGIC)) {
        throw CommunicationAttachmentError.mimeMismatch();
      }
      break;
    case 'image/webp':
      if (!buffer.subarray(0, 4).equals(Buffer.from('RIFF')) || !buffer.subarray(8, 12).equals(Buffer.from('WEBP'))) {
        throw CommunicationAttachmentError.mimeMismatch();
      }
      break;
    case 'application/pdf':
      if (!matchesMagic(buffer, PDF_MAGIC)) {
        throw CommunicationAttachmentError.mimeMismatch();
      }
      break;
    default:
      throw CommunicationAttachmentError.unsupportedType();
  }
}

export function assertAttachmentSize(mediaKind: CommunicationAttachmentMediaKind, sizeBytes: number): void {
  const max =
    mediaKind === 'IMAGE'
      ? COMMUNICATION_ATTACHMENT_MAX_IMAGE_BYTES
      : COMMUNICATION_ATTACHMENT_MAX_DOCUMENT_BYTES;
  if (sizeBytes <= 0) {
    throw CommunicationAttachmentError.emptyFile();
  }
  if (sizeBytes > max) {
    throw CommunicationAttachmentError.fileTooLarge(max);
  }
}

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
