const UNSAFE_FILENAME_CHARS = /[^a-zA-Z0-9._-]+/g;

export function sanitizeDownloadFileName(originalName: string | null | undefined): string {
  const base = (originalName ?? 'document').split(/[/\\]/).pop() ?? 'document';
  const sanitized = base.replace(UNSAFE_FILENAME_CHARS, '_').replace(/_+/g, '_').slice(0, 120);
  return sanitized || 'document';
}

export function buildContentDisposition(fileName: string, inline = true): string {
  const disposition = inline ? 'inline' : 'attachment';
  return `${disposition}; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
