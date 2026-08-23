/** WhatsApp Cloud API aligned limits — use lowest safe applicable cap. */
export const COMMUNICATION_ATTACHMENT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const COMMUNICATION_ATTACHMENT_MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;

export const COMMUNICATION_ATTACHMENT_ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const COMMUNICATION_ATTACHMENT_ALLOWED_DOCUMENT_MIMES = new Set([
  'application/pdf',
]);

export const COMMUNICATION_ATTACHMENT_STORAGE_DOCUMENT_TYPE = 'COMMUNICATION_MEDIA';
