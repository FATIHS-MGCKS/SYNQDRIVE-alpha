import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { DetailDrawer, StatusChip, Timeline, type TimelineItem } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import {
  api,
  type LegalDocumentDto,
  type LegalDocumentEventDto,
  type LegalDocumentUsageResponseDto,
} from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatLegalDocumentBytes,
  formatLegalDocumentDate,
  formatLegalDocumentStatus,
  legalDocumentTypeTitle,
  legalDocumentVariantLabel,
} from '../../lib/legal-documents-overview';
import type { LegalDocumentsTranslate } from '../../lib/legal-documents-i18n';
import {
  formatIntegrityStatusLabel,
  formatScanStatusLabel,
  shortenChecksum,
} from '../../lib/legal-document-version-history.utils';
import { formatLifecycleEventLabel } from '../../lib/legal-document-lifecycle.utils';

interface Props {
  orgId: string;
  document: LegalDocumentDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canViewAudit: boolean;
  canViewUsage: boolean;
}

function MetadataRow({
  label,
  labelTitle,
  value,
}: {
  label: string;
  labelTitle?: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b border-border/50 py-2 text-[12px] last:border-0">
      <dt className="text-muted-foreground" title={labelTitle}>
        {label}
      </dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  );
}

function buildLifecycleTimeline(
  document: LegalDocumentDto,
  events: LegalDocumentEventDto[],
  t: LegalDocumentsTranslate,
  locale: string,
) {
  const milestones: { id: string; at: string | null; title: string; actor?: string | null }[] = [
    {
      id: 'uploaded',
      at: document.uploadedAt ?? document.createdAt,
      title: t('legalDocuments.lifecycle.event.UPLOADED'),
      actor: document.uploadedBy?.displayName,
    },
    {
      id: 'review',
      at: document.submittedForReviewAt ?? null,
      title: t('legalDocuments.lifecycle.event.SUBMITTED_FOR_REVIEW_DETAIL'),
      actor: document.submittedForReviewBy?.displayName,
    },
    {
      id: 'approved',
      at: document.approvedAt ?? null,
      title: t('legalDocuments.lifecycle.event.APPROVED'),
      actor: document.approvedBy?.displayName,
    },
    {
      id: 'activated',
      at: document.activatedAt ?? document.activeFrom ?? null,
      title: t('legalDocuments.lifecycle.event.ACTIVATED'),
      actor: document.activatedBy?.displayName,
    },
  ];

  const items: TimelineItem[] = milestones
    .filter((m) => m.at)
    .map((m) => ({
      id: m.id,
      tone: 'neutral' as const,
      title: m.title,
      time: formatLegalDocumentDate(m.at, locale),
      description: m.actor ?? undefined,
    }));

  for (const event of events) {
    items.push({
      id: event.id,
      tone:
        event.eventType === 'REVOKED' || event.eventType.includes('FAILED')
          ? ('critical' as const)
          : event.eventType === 'ACTIVATED' || event.eventType === 'APPROVED'
            ? ('success' as const)
            : ('neutral' as const),
      title: formatLifecycleEventLabel(event.eventType, t),
      time: formatLegalDocumentDate(event.createdAt, locale),
      description: event.actorDisplayName ?? event.reason ?? undefined,
    });
  }

  return items;
}

function deliveryStatusSummary(
  usage: LegalDocumentUsageResponseDto | null,
  t: LegalDocumentsTranslate,
): string {
  if (!usage) return t('legalDocuments.common.emDash');
  const entries = Object.entries(usage.summary.deliveryByStatus);
  if (entries.length === 0) return t('legalDocuments.detail.usage.noDelivery');
  return entries.map(([status, count]) => `${status}: ${count}`).join(' · ');
}

export function LegalDocumentVersionDetailDrawer({
  orgId,
  document,
  open,
  onOpenChange,
  canViewAudit,
  canViewUsage,
}: Props) {
  const { t, locale } = useLanguage();
  const [detail, setDetail] = useState<LegalDocumentDto | null>(null);
  const [events, setEvents] = useState<LegalDocumentEventDto[]>([]);
  const [usage, setUsage] = useState<LegalDocumentUsageResponseDto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const docId = document?.id ?? null;

  const revokePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open || !orgId || !docId) {
      setDetail(null);
      setEvents([]);
      setUsage(null);
      revokePreview();
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const [full, eventResult, usageResult] = await Promise.all([
          api.legalDocuments.get(orgId, docId),
          canViewAudit ? api.legalDocuments.listDocumentEvents(orgId, docId, { limit: 50 }) : Promise.resolve(null),
          canViewUsage ? api.legalDocuments.getUsage(orgId, docId, { limit: 10 }) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setDetail(full);
        setEvents(eventResult?.data ?? []);
        setUsage(usageResult);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : t('legalDocuments.detail.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orgId, docId, canViewAudit, canViewUsage, revokePreview, t]);

  useEffect(() => {
    if (!open || !orgId || !docId) {
      revokePreview();
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    void (async () => {
      try {
        const blob = await api.legalDocuments.fetchPreviewBlob(orgId, docId);
        if (cancelled) return;
        revokePreview();
        setPreviewUrl(URL.createObjectURL(blob));
      } catch {
        if (!cancelled) revokePreview();
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokePreview();
    };
  }, [open, orgId, docId, revokePreview]);

  const timelineItems = useMemo(
    () => (detail ? buildLifecycleTimeline(detail, events, t, locale) : []),
    [detail, events, t, locale],
  );

  const copyChecksum = async () => {
    if (!detail?.checksum) return;
    try {
      await navigator.clipboard.writeText(detail.checksum);
      toast.success(t('legalDocuments.toast.checksumCopied'));
    } catch {
      toast.error(t('legalDocuments.toast.copyFailed'));
    }
  };

  const statusTone =
    detail?.status === 'ACTIVE'
      ? 'success'
      : detail?.status === 'DRAFT' || detail?.status === 'IN_REVIEW'
        ? 'watch'
        : 'neutral';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-2xl"
      eyebrow={
        detail
          ? legalDocumentTypeTitle(detail.documentType, detail.legacyDocumentType, t)
          : t('legalDocuments.detail.eyebrow')
      }
      title={
        detail
          ? t('legalDocuments.detail.title', { version: detail.versionLabel })
          : t('legalDocuments.wizard.field.version')
      }
      description={detail?.title}
      status={
        detail ? (
          <StatusChip tone={statusTone}>{formatLegalDocumentStatus(detail.status, t)}</StatusChip>
        ) : null
      }
      footer={
        detail ? (
          <Button
            type="button"
            variant="primary"
            className="w-full sm:w-auto"
            onClick={() => void api.legalDocuments.open(orgId, detail.id)}
          >
            <Download className="h-4 w-4" />
            {t('legalDocuments.detail.download')}
          </Button>
        ) : null
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('legalDocuments.detail.loading')}
        </div>
      ) : detail ? (
        <div className="space-y-6 p-5" data-testid="legal-version-detail-drawer">
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-foreground">
              {t('legalDocuments.detail.metadata')}
            </h3>
            <dl className="rounded-xl border border-border/60 bg-muted/10 px-3">
              <MetadataRow
                label={t('legalDocuments.wizard.field.variant')}
                value={legalDocumentVariantLabel(detail, t) ?? t('legalDocuments.common.emDash')}
              />
              <MetadataRow
                label={t('legalDocuments.wizard.field.language')}
                value={detail.language.toUpperCase()}
              />
              <MetadataRow
                label={t('legalDocuments.wizard.field.jurisdiction')}
                value={detail.jurisdiction ?? t('legalDocuments.common.emDash')}
              />
              <MetadataRow
                label={t('legalDocuments.history.column.validity')}
                value={`${formatLegalDocumentDate(detail.validFrom, locale)} – ${formatLegalDocumentDate(detail.validUntil, locale)}`}
              />
              <MetadataRow
                label={t('legalDocuments.wizard.field.file')}
                value={`${detail.fileName} (${formatLegalDocumentBytes(detail.sizeBytes ?? detail.fileSize)})`}
              />
              <MetadataRow
                label={t('legalDocuments.detail.pages')}
                value={detail.pageCount ?? t('legalDocuments.common.emDash')}
              />
              <MetadataRow
                label={t('legalDocuments.wizard.field.scan')}
                labelTitle={t('legalDocuments.tooltip.scan')}
                value={formatScanStatusLabel(detail.scanStatus, t)}
              />
              <MetadataRow
                label={t('legalDocuments.wizard.field.integrity')}
                labelTitle={t('legalDocuments.tooltip.integrity')}
                value={formatIntegrityStatusLabel(detail.integrityStatus, t)}
              />
              <MetadataRow
                label={t('legalDocuments.wizard.field.checksum')}
                labelTitle={t('legalDocuments.tooltip.checksum')}
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {shortenChecksum(detail.checksum) ?? t('legalDocuments.common.emDash')}
                    </span>
                    {detail.checksum ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        title={t('legalDocuments.a11y.copyChecksum')}
                        onClick={() => void copyChecksum()}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </span>
                }
              />
              {detail.changeSummary ? (
                <MetadataRow label={t('legalDocuments.detail.changes')} value={detail.changeSummary} />
              ) : null}
              {detail.legalOwnerName ? (
                <MetadataRow label={t('legalDocuments.detail.responsible')} value={detail.legalOwnerName} />
              ) : null}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-foreground">
              {t('legalDocuments.detail.lifecycle')}
            </h3>
            {timelineItems.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">{t('legalDocuments.detail.noLifecycle')}</p>
            ) : (
              <Timeline items={timelineItems} />
            )}
          </section>

          {canViewAudit && events.length > 0 ? (
            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-foreground">
                {t('legalDocuments.detail.auditEvents')}
              </h3>
              <ul className="space-y-2 text-[12px]">
                {events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-border/60 px-3 py-2">
                    <div className="font-medium">{formatLifecycleEventLabel(event.eventType, t)}</div>
                    <div className="text-muted-foreground">
                      {formatLegalDocumentDate(event.createdAt, locale)}
                      {event.actorDisplayName ? ` · ${event.actorDisplayName}` : ''}
                    </div>
                    {event.reason ? <p className="mt-1 text-foreground">{event.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canViewUsage ? (
            <section data-testid="legal-version-usage-section">
              <h3 className="mb-2 text-[13px] font-semibold text-foreground">
                {t('legalDocuments.detail.usage')}
              </h3>
              {usage ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      {
                        label: t('legalDocuments.detail.usage.snapshots'),
                        labelTitle: t('legalDocuments.tooltip.snapshot'),
                        value: usage.summary.snapshotCount,
                      },
                      {
                        label: t('legalDocuments.detail.usage.bookings'),
                        value: usage.summary.bookingCount,
                      },
                      {
                        label: t('legalDocuments.detail.usage.contracts'),
                        value: usage.summary.contractCount,
                      },
                      {
                        label: t('legalDocuments.detail.usage.deliveryEvidence'),
                        value: usage.summary.deliveryEvidenceCount,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg border border-border/60 bg-muted/10 p-2 text-center"
                      >
                        <div className="text-lg font-semibold tabular-nums">{item.value}</div>
                        <div className="text-[10px] text-muted-foreground" title={item.labelTitle}>
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('legalDocuments.detail.usage.deliveryStatus', {
                      summary: deliveryStatusSummary(usage, t),
                    })}
                  </p>
                  {usage.references.data.length > 0 ? (
                    <ul className="space-y-1.5 text-[12px]">
                      {usage.references.data.map((ref) => (
                        <li key={ref.generatedDocumentId} className="rounded-md border border-border/50 px-2 py-1.5">
                          {ref.contractNumber
                            ? t('legalDocuments.detail.usage.contractRef', { number: ref.contractNumber })
                            : (ref.bookingLabel ?? t('legalDocuments.detail.usage.generatedDoc'))}
                          {ref.generatedAt ? ` · ${formatLegalDocumentDate(ref.generatedAt, locale)}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      {t('legalDocuments.detail.usage.noReferences')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  {t('legalDocuments.detail.usage.unavailable')}
                </p>
              )}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-foreground">
              {t('legalDocuments.detail.preview')}
            </h3>
            <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
              {previewLoading ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('legalDocuments.detail.previewLoading')}
                </div>
              ) : previewUrl ? (
                <iframe
                  title={t('legalDocuments.a11y.pdfPreview')}
                  src={previewUrl}
                  className="h-[min(70vh,32rem)] w-full bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)] motion-reduce:transition-none"
                  data-testid="legal-version-pdf-preview"
                  tabIndex={0}
                />
              ) : (
                <p className="p-6 text-center text-[12px] text-muted-foreground">
                  {t('legalDocuments.detail.previewUnavailable')}
                </p>
              )}
            </div>
          </section>
        </div>
      ) : (
        <p className="p-5 text-[12px] text-muted-foreground">{t('legalDocuments.detail.noneSelected')}</p>
      )}
    </DetailDrawer>
  );
}
