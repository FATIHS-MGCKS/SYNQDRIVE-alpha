import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { SectionHeader, StatusChip } from '../../../components/patterns';
import { api } from '../../../lib/api';
import type { LegalDocumentCategoryOverview } from '../../lib/legal-documents-overview';
import { formatLegalDocumentStatus } from '../../lib/legal-documents-overview';

interface Props {
  orgId: string;
  categories: LegalDocumentCategoryOverview[];
  canUpload: boolean;
  canPublish: boolean;
  onChanged: () => Promise<void>;
}

/**
 * Activate / archive actions for draft and approved versions.
 * Upload is handled by `LegalDocumentUploadWizardDialog` on the tab header.
 */
export function LegalDocumentsLegacyMutations({
  orgId,
  categories,
  canUpload,
  canPublish,
  onChanged,
}: Props) {
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const handleActivate = async (id: string) => {
    setActivatingId(id);
    try {
      await api.legalDocuments.activate(orgId, id);
      toast.success('Version aktiviert.');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen');
    } finally {
      setActivatingId(null);
    }
  };

  const handleArchive = async (id: string) => {
    setArchivingId(id);
    try {
      await api.legalDocuments.archive(orgId, id);
      toast.success('Entwurf archiviert.');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archivierung fehlgeschlagen');
    } finally {
      setArchivingId(null);
    }
  };

  if (!canUpload && !canPublish) return null;

  const hasPendingVersions = categories.some((category) =>
    category.versions.some(
      (v) => v.status === 'DRAFT' || v.status === 'APPROVED' || v.status === 'IN_REVIEW',
    ),
  );

  if (!hasPendingVersions) return null;

  return (
    <div className="space-y-4 border-t border-border/60 pt-5">
      <SectionHeader
        title="Freigabe & Archiv"
        description="Entwürfe aktivieren oder archivieren — neue Versionen über „Neue Version“ hochladen."
        as="label"
      />

      <div className="space-y-4">
        {categories.map((category) => {
          const pending = category.versions.filter(
            (v) => v.status === 'DRAFT' || v.status === 'APPROVED' || v.status === 'IN_REVIEW',
          );
          if (pending.length === 0) return null;

          return (
            <div key={category.config.key} className="surface-premium rounded-xl border border-border/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{category.config.title}</h3>
                <StatusChip tone={category.statusTone}>{category.statusLabel}</StatusChip>
              </div>

              <div className="space-y-1.5">
                {pending.slice(0, 5).map((v) => (
                  <div
                    key={v.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">v{v.versionLabel}</span>
                        <StatusChip tone="neutral">{formatLegalDocumentStatus(v.status)}</StatusChip>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{v.fileName}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {canPublish && v.status !== 'ACTIVE' ? (
                        <Button
                          type="button"
                          variant="success"
                          size="sm"
                          disabled={activatingId === v.id}
                          onClick={() => void handleActivate(v.id)}
                        >
                          Aktivieren
                        </Button>
                      ) : null}
                      {canUpload && v.status === 'DRAFT' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={archivingId === v.id}
                          onClick={() => void handleArchive(v.id)}
                        >
                          Archivieren
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
