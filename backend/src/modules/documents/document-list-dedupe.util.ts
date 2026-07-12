import { DOCUMENT_STATUS } from './documents.constants';

type DedupeDoc = { id: string; documentType: string; status: string; createdAt: Date };

/** Newest non-VOID row per documentType (guards concurrent bundle generation). */
export function dedupeDocumentsByType<T extends DedupeDoc>(docs: T[]): T[] {
  const byType = new Map<string, T>();
  for (const doc of docs) {
    if (doc.status === DOCUMENT_STATUS.VOID) continue;
    const prev = byType.get(doc.documentType);
    if (!prev || doc.createdAt.getTime() >= prev.createdAt.getTime()) {
      byType.set(doc.documentType, doc);
    }
  }
  return Array.from(byType.values());
}
