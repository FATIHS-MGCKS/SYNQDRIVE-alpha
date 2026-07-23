import { createHash } from 'crypto';

export function fingerprintResourceReference(reference: string): string {
  return createHash('sha256').update(reference.trim()).digest('hex').slice(0, 16);
}

export function dedupeIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}
