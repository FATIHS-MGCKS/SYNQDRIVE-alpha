import { useCallback, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { SectionHeader, StatusChip } from '../../../components/patterns';
import { api } from '../../../lib/api';
import { isLegalPdfFile } from '../../lib/legal-documents.utils';
import {
  CONSUMER_INFORMATION_VARIANT,
  LEGAL_DOCUMENT_TYPE,
  type ConsumerInformationVariant,
} from '../../lib/legal-document-types';
import type { LegalDocumentCategoryOverview } from '../../lib/legal-documents-overview';
import { formatLegalDocumentStatus } from '../../lib/legal-documents-overview';

interface UploadState {
  versionLabel: string;
  title: string;
  legalVariant?: ConsumerInformationVariant;
  busy: boolean;
}

interface Props {
  orgId: string;
  categories: LegalDocumentCategoryOverview[];
  canUpload: boolean;
  canPublish: boolean;
  onChanged: () => Promise<void>;
}

/**
 * Existing mutation surface — preserved for Prompt 23 read-only IA rollout.
 * Dialog-based workflows follow in later prompts.
 */
export function LegalDocumentsLegacyMutations({
  orgId,
  categories,
  canUpload,
  canPublish,
  onChanged,
}: Props) {
  const [uploads, setUploads] = useState<Record<string, UploadState>>(() =>
    Object.fromEntries(
      categories.map((c) => [
        c.config.key,
        {
          versionLabel: '',
          title: '',
          legalVariant:
            c.config.key === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION
              ? CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE
              : undefined,
          busy: false,
        },
      ]),
    ),
  );
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const [pendingUploadType, setPendingUploadType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setUpload = (type: string, patch: Partial<UploadState>) =>
    setUploads((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleUpload = useCallback(
    async (type: string, file: File) => {
      const state = uploadsRef.current[type];
      if (!state?.versionLabel.trim()) {
        toast.error('Bitte zuerst eine Versionsbezeichnung eingeben.');
        return;
      }
      if (!isLegalPdfFile(file)) {
        toast.error('Nur PDF-Dateien sind erlaubt.');
        return;
      }
      setUpload(type, { busy: true });
      try {
        await api.legalDocuments.upload(orgId, {
          documentType: type,
          versionLabel: state.versionLabel.trim(),
          title: state.title.trim() || undefined,
          legalVariant:
            type === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ? state.legalVariant : undefined,
          file,
        });
        setUpload(type, { busy: false, versionLabel: '', title: '' });
        toast.success('Dokument hochgeladen.');
        await onChanged();
      } catch (err) {
        setUpload(type, { busy: false });
        toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
      }
    },
    [orgId, onChanged],
  );

  const openFilePicker = (type: string) => {
    const state = uploadsRef.current[type];
    if (!state?.versionLabel.trim()) {
      toast.error('Bitte zuerst eine Versionsbezeichnung eingeben.');
      return;
    }
    setPendingUploadType(type);
    fileInputRef.current?.click();
  };

  const handleActivate = async (id: string) => {
    try {
      await api.legalDocuments.activate(orgId, id);
      toast.success('Version aktiviert.');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aktivierung fehlgeschlagen');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.legalDocuments.archive(orgId, id);
      toast.success('Entwurf archiviert.');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archivierung fehlgeschlagen');
    }
  };

  if (!canUpload && !canPublish) return null;

  return (
    <div className="space-y-4 border-t border-border/60 pt-5">
      <SectionHeader
        title="Schnellaktionen"
        description="Bestehende Upload- und Freigabefunktionen — Dialog-Workflows folgen in späteren Prompts"
        as="label"
      />

      {canUpload ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const type = pendingUploadType;
            const f = e.target.files?.[0];
            e.target.value = '';
            setPendingUploadType(null);
            if (type && f) void handleUpload(type, f);
          }}
        />
      ) : null}

      <div className="space-y-4">
        {categories.map((category) => {
          const up = uploads[category.config.key];
          return (
            <div key={category.config.key} className="surface-premium rounded-xl border border-border/60 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{category.config.title}</h3>
                <StatusChip tone={category.statusTone}>{category.statusLabel}</StatusChip>
              </div>

              {canUpload ? (
                <div className="mb-3 rounded-lg border border-dashed border-border/70 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {category.config.key === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION &&
                    category.config.variants ? (
                      <select
                        value={up?.legalVariant ?? CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE}
                        onChange={(e) =>
                          setUpload(category.config.key, {
                            legalVariant: e.target.value as ConsumerInformationVariant,
                          })
                        }
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                      >
                        {category.config.variants.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      type="text"
                      value={up?.versionLabel ?? ''}
                      onChange={(e) => setUpload(category.config.key, { versionLabel: e.target.value })}
                      placeholder="Version (z. B. 2026-01)"
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    />
                    <input
                      type="text"
                      value={up?.title ?? ''}
                      onChange={(e) => setUpload(category.config.key, { title: e.target.value })}
                      placeholder="Titel (optional)"
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={up?.busy}
                      onClick={() => openFilePicker(category.config.key)}
                    >
                      {up?.busy ? <Loader2 className="animate-spin" /> : <Upload />}
                      PDF hochladen
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                {category.versions
                  .filter((v) => v.status === 'DRAFT' || v.status === 'APPROVED' || v.status === 'IN_REVIEW')
                  .slice(0, 5)
                  .map((v) => (
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
                          <Button type="button" variant="success" size="sm" onClick={() => void handleActivate(v.id)}>
                            Aktivieren
                          </Button>
                        ) : null}
                        {canUpload && v.status === 'DRAFT' ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void handleArchive(v.id)}>
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
