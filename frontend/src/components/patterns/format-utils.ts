/** Shared locale formatters for Master Admin and pattern library consumers. */

export function formatRelativeDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  if (diff < 0) return 'gerade eben';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `vor ${sec} Sek.`;
  if (sec < 3600) return `vor ${Math.floor(sec / 60)} Min.`;
  if (sec < 86400) return `vor ${Math.floor(sec / 3600)} Std.`;
  return `vor ${Math.floor(sec / 86400)} Tg.`;
}

export function formatDateTimeDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
