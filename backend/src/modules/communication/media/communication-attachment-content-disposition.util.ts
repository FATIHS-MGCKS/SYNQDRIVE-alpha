import { sanitizeAttachmentFileName } from './communication-attachment-validation';

export function buildCommunicationAttachmentContentDisposition(
  fileName: string,
  inline: boolean,
): string {
  const safeName = sanitizeAttachmentFileName(fileName);
  const encoded = encodeURIComponent(safeName);
  const disposition = inline ? 'inline' : 'attachment';
  return `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}`;
}
