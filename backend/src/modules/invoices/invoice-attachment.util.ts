/** Stored in `OrgInvoice.imageUrl` for private document-storage attachments. */
export const INVOICE_ATTACHMENT_PRIVATE_PREFIX = 'private:';

export const INVOICE_ATTACHMENT_DOCUMENT_TYPE = 'INVOICE_ATTACHMENT';

export function isPrivateInvoiceAttachmentRef(
  imageUrl: string | null | undefined,
): imageUrl is string {
  return Boolean(imageUrl?.startsWith(INVOICE_ATTACHMENT_PRIVATE_PREFIX));
}

export function toPrivateInvoiceAttachmentRef(objectKey: string): string {
  return `${INVOICE_ATTACHMENT_PRIVATE_PREFIX}${objectKey}`;
}

export function parsePrivateInvoiceAttachmentKey(imageUrl: string): string {
  if (!isPrivateInvoiceAttachmentRef(imageUrl)) {
    throw new Error('Not a private invoice attachment reference');
  }
  return imageUrl.slice(INVOICE_ATTACHMENT_PRIVATE_PREFIX.length);
}

export function isLegacyLocalUploadUrl(imageUrl: string): boolean {
  return imageUrl.startsWith('/uploads/');
}
