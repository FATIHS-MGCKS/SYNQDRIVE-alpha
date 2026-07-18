import type { PublicDocumentExtractionArchiveItem } from './document-extraction.types';

export interface DocumentArchiveAuditEntry {
  key: string;
  at: string;
  detail?: string | null;
}

export function buildDocumentArchiveAuditTrail(
  item: PublicDocumentExtractionArchiveItem,
): DocumentArchiveAuditEntry[] {
  const entries: DocumentArchiveAuditEntry[] = [
    {
      key: 'uploaded',
      at: item.uploadedAt,
      detail: item.uploader?.displayName ?? null,
    },
  ];

  if (item.updatedAt && item.updatedAt !== item.uploadedAt) {
    entries.push({ key: 'updated', at: item.updatedAt });
  }

  if (item.appliedAt) {
    entries.push({ key: 'applied', at: item.appliedAt });
  }

  const actionDetail = [
    item.actionSummary.summary,
    item.actionSummary.failedCount > 0
      ? `${item.actionSummary.failedCount} failed`
      : null,
    item.actionSummary.succeededCount > 0
      ? `${item.actionSummary.succeededCount} succeeded`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  if (actionDetail) {
    entries.push({
      key: 'actions',
      at: item.appliedAt ?? item.updatedAt,
      detail: actionDetail,
    });
  }

  if (item.followUpSummary.primaryTitle) {
    entries.push({
      key: 'followUp',
      at: item.updatedAt,
      detail: item.followUpSummary.primaryTitle,
    });
  }

  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
