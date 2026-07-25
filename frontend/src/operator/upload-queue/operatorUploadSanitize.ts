const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export function sanitizeOperatorUploadClientFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? 'upload';
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 120) || 'upload.bin';
}

export function validateOperatorUploadClientFile(file: { size: number; type: string }): string | null {
  if (file.size <= 0) return 'Datei ist leer';
  if (file.size > MAX_BYTES) return 'Datei ist zu groß (max. 8 MB)';
  const mime = file.type.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) return 'Dateityp nicht erlaubt';
  return null;
}

export function redactOperatorUploadErrorMessage(message: string): string {
  return message.replace(/organizations\/[^\s]+/gi, 'organizations/[redacted]');
}
