/** Mobile file pickers (especially iOS) often leave `file.type` empty for PDFs. */
export function isLegalPdfFile(file: File): boolean {
  const type = (file.type ?? '').trim().toLowerCase();
  if (type === 'application/pdf' || type === 'application/x-pdf') return true;
  return file.name.trim().toLowerCase().endsWith('.pdf');
}
