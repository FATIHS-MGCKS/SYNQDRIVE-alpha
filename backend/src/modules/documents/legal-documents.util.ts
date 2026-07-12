/** PDF detection for org legal document uploads (mobile clients often omit MIME type). */
export function isLegalPdfUpload(file: {
  mimetype?: string | null;
  originalname?: string | null;
}): boolean {
  const mime = (file.mimetype ?? '').trim().toLowerCase();
  if (mime === 'application/pdf' || mime === 'application/x-pdf') return true;
  const name = (file.originalname ?? '').trim().toLowerCase();
  return name.endsWith('.pdf');
}

export function normalizeLegalPdfMimeType(
  mimeType: string | undefined | null,
  fileName: string,
): string {
  if (isLegalPdfUpload({ mimetype: mimeType, originalname: fileName })) {
    return 'application/pdf';
  }
  return (mimeType ?? '').trim().toLowerCase();
}
