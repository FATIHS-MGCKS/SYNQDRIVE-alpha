/**
 * Builds a safe Content-Disposition header for authorized backend downloads.
 * Filenames are encoded; callers must never redirect clients to public object URLs.
 */
export function buildContentDispositionInline(fileName: string): string {
  const safeName = String(fileName || 'document').replace(/[\r\n"]/g, '_');
  const encoded = encodeURIComponent(safeName);
  return `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`;
}
