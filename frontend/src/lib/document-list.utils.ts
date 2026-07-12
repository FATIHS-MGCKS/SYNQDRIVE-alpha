/** Keep the newest non-VOID document per documentType (e.g. concurrent bundle generation). */
export function dedupeDocumentsByType<
  T extends { id: string; documentType: string; status: string; createdAt?: string },
>(docs: T[]): T[] {
  const byType = new Map<string, T>();
  for (const doc of docs) {
    if (doc.status === 'VOID') continue;
    const prev = byType.get(doc.documentType);
    if (!prev) {
      byType.set(doc.documentType, doc);
      continue;
    }
    const prevTs = prev.createdAt ? Date.parse(prev.createdAt) : 0;
    const docTs = doc.createdAt ? Date.parse(doc.createdAt) : 0;
    if (docTs >= prevTs) byType.set(doc.documentType, doc);
  }
  return Array.from(byType.values());
}
