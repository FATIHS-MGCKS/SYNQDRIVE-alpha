import { useState } from 'react';

import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations/en';
import { Icon } from '../ui/Icon';
import type { InvoiceDocumentsPanel, InvoiceDocumentVersion, InvoiceDeliveryHistoryItem } from './invoiceDocumentTypes';
import { formatDateTime, olderVersions } from './invoiceDocuments.mapper';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN, type InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceDocumentsProps extends InvoiceThemeClasses {
  panel: InvoiceDocumentsPanel | null;
  loading: boolean;
  generating: boolean;
  sendingEmail: boolean;
  retryingEmailId: string | null;
  onPreview: (documentId: string) => void;
  onDownload: (documentId: string) => void;
  onPreviewIncoming?: () => void;
  onGenerate: (regenerate?: boolean) => void;
  onSendEmail: () => void;
  onRetryGeneration: () => void;
  onRetryDelivery: (emailId: string) => void;
}

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function MetaRow({ label, value, tp, ts }: { label: string; value: string; tp: string; ts: string }) {
  return (
    <div className="min-w-0">
      <dt className={`text-[10px] font-semibold uppercase tracking-wider ${ts}`}>{label}</dt>
      <dd className={`mt-0.5 text-xs font-medium ${tp} break-words`}>{value}</dd>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  reason,
  loading,
  onClick,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
  reason?: string | null;
  loading?: boolean;
  onClick?: () => void;
}) {
  const blocked = Boolean(disabled || loading || !onClick);
  return (
    <div className="flex min-w-0 flex-col">
      <button
        type="button"
        disabled={blocked}
        title={blocked && reason ? reason : undefined}
        aria-disabled={blocked}
        onClick={onClick}
        className={blocked ? INVOICE_DISABLED_BTN : INVOICE_ACTION_BTN}
      >
        {loading ? (
          <Icon name="loader-2" className="h-3 w-3 animate-spin" />
        ) : (
          <Icon name={icon} className="h-3 w-3" />
        )}
        {label}
      </button>
      {blocked && reason ? (
        <span className="mt-1 text-[10px] leading-snug text-muted-foreground" role="note">
          {reason}
        </span>
      ) : null}
    </div>
  );
}

function deliveryTone(status: string): StatusTone {
  if (status === 'SENT' || status === 'DELIVERED') return 'success';
  if (status === 'FAILED' || status === 'BOUNCED') return 'critical';
  if (status === 'PENDING' || status === 'QUEUED') return 'watch';
  if (status === 'SENDING') return 'info';
  return 'neutral';
}

function documentStatusTone(status: string): StatusTone {
  if (status === 'GENERATED' || status === 'SENT') return 'success';
  if (status === 'FAILED') return 'critical';
  if (status === 'DRAFT') return 'watch';
  return 'neutral';
}

function ActiveDocumentCard({
  doc,
  panel,
  generating,
  sendingEmail,
  onPreview,
  onDownload,
  onGenerate,
  onSendEmail,
  tp,
  ts,
  t,
  locale,
}: {
  doc: InvoiceDocumentVersion;
  panel: InvoiceDocumentsPanel;
  generating: boolean;
  sendingEmail: boolean;
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  onGenerate: (regenerate?: boolean) => void;
  onSendEmail: () => void;
  tp: string;
  ts: string;
  t: Translate;
  locale: string;
}) {
  const caps = panel.capabilities;
  const emptyValue = t('invoices.list.emptyValue');
  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold ${tp}`}>{doc.fileName}</span>
        {doc.isActive ? (
          <StatusChip tone="success" dot>
            {t('invoices.documents.activeVersion')}
          </StatusChip>
        ) : null}
        <StatusChip tone={documentStatusTone(doc.status)} dot>
          {doc.statusLabel}
        </StatusChip>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <MetaRow label={t('invoices.documents.meta.documentType')} value={doc.documentTypeLabel} tp={tp} ts={ts} />
        <MetaRow label={t('invoices.documents.meta.version')} value={String(doc.version)} tp={tp} ts={ts} />
        <MetaRow
          label={t('invoices.documents.meta.createdAt')}
          value={formatDateTime(doc.createdAt, locale)}
          tp={tp}
          ts={ts}
        />
        <MetaRow
          label={t('invoices.documents.meta.createdBy')}
          value={doc.createdByName ?? emptyValue}
          tp={tp}
          ts={ts}
        />
        {doc.sizeLabel ? (
          <MetaRow label={t('invoices.documents.meta.fileSize')} value={doc.sizeLabel} tp={tp} ts={ts} />
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        <ActionButton
          label={t('invoices.documents.action.preview')}
          icon="eye"
          disabled={!doc.capabilities.preview.allowed}
          reason={doc.capabilities.preview.reason}
          onClick={() => onPreview(doc.id)}
        />
        <ActionButton
          label={t('common.download')}
          icon="download"
          disabled={!doc.capabilities.download.allowed}
          reason={doc.capabilities.download.reason}
          onClick={() => onDownload(doc.id)}
        />
        <ActionButton
          label={t('invoices.documents.action.sendEmail')}
          icon="mail"
          disabled={!caps.sendEmail.allowed}
          reason={caps.sendEmail.reason}
          loading={sendingEmail}
          onClick={onSendEmail}
        />
        <ActionButton
          label={t('invoices.documents.action.regenerate')}
          icon="refresh-cw"
          disabled={!caps.regenerate.allowed}
          reason={caps.regenerate.reason}
          loading={generating}
          onClick={() => onGenerate(true)}
        />
      </div>
    </div>
  );
}

function VersionHistory({
  versions,
  onPreview,
  onDownload,
  tp,
  ts,
  t,
  locale,
}: {
  versions: InvoiceDocumentVersion[];
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  tp: string;
  ts: string;
  t: Translate;
  locale: string;
}) {
  const [open, setOpen] = useState(false);
  if (versions.length === 0) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-left text-xs font-semibold ${tp} hover:bg-muted/30`}
        aria-expanded={open}
      >
        <span>{t('invoices.documents.versionHistory.title', { count: versions.length })}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="h-4 w-4 shrink-0" />
      </button>
      {open ? (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-medium ${tp}`}>
                  {t('invoices.documents.versionHistory.versionLabel', { version: v.version })}
                </span>
                <StatusChip tone={documentStatusTone(v.status)} dot>
                  {v.statusLabel}
                </StatusChip>
              </div>
              <p className={`text-[11px] ${ts}`}>{formatDateTime(v.createdAt, locale)}</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  label={t('invoices.documents.action.preview')}
                  icon="eye"
                  disabled={!v.capabilities.preview.allowed}
                  reason={v.capabilities.preview.reason}
                  onClick={() => onPreview(v.id)}
                />
                <ActionButton
                  label={t('common.download')}
                  icon="download"
                  disabled={!v.capabilities.download.allowed}
                  reason={v.capabilities.download.reason}
                  onClick={() => onDownload(v.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DeliveryHistoryTable({
  items,
  retryingEmailId,
  onRetryDelivery,
  tp,
  ts,
  t,
  locale,
}: {
  items: InvoiceDeliveryHistoryItem[];
  retryingEmailId: string | null;
  onRetryDelivery: (emailId: string) => void;
  tp: string;
  ts: string;
  t: Translate;
  locale: string;
}) {
  const emptyValue = t('invoices.list.emptyValue');
  if (items.length === 0) {
    return <p className={`text-xs ${ts}`}>{t('invoices.documents.delivery.empty')}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((row) => (
        <article
          key={row.id}
          className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold ${tp}`}>{row.recipient}</span>
            <StatusChip tone={deliveryTone(row.status)} dot>
              {row.statusLabel}
            </StatusChip>
          </div>
          <dl className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <MetaRow label={t('invoices.documents.delivery.channel')} value={row.channelLabel} tp={tp} ts={ts} />
            <MetaRow
              label={t('invoices.documents.delivery.documentVersion')}
              value={row.documentVersionLabel}
              tp={tp}
              ts={ts}
            />
            <MetaRow
              label={t('invoices.documents.delivery.dateTime')}
              value={formatDateTime(row.sentAt ?? row.createdAt, locale)}
              tp={tp}
              ts={ts}
            />
            <MetaRow
              label={t('invoices.documents.delivery.triggeredBy')}
              value={row.triggeredByName ?? emptyValue}
              tp={tp}
              ts={ts}
            />
          </dl>
          {row.errorMessage ? (
            <p className="text-xs text-[color:var(--status-critical)]" role="alert">
              {row.errorMessage}
            </p>
          ) : null}
          {row.capabilities.retry.allowed ? (
            <ActionButton
              label={t('invoices.documents.action.resend')}
              icon="refresh-cw"
              loading={retryingEmailId === row.id}
              onClick={() => onRetryDelivery(row.id)}
            />
          ) : row.capabilities.retry.reason ? (
            <p className={`text-[10px] ${ts}`}>{row.capabilities.retry.reason}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function InvoiceDocuments({
  panel,
  loading,
  generating,
  sendingEmail,
  retryingEmailId,
  onPreview,
  onDownload,
  onPreviewIncoming,
  onGenerate,
  onSendEmail,
  onRetryGeneration,
  onRetryDelivery,
  card,
  tp,
  ts,
}: InvoiceDocumentsProps) {
  const { t, locale } = useLanguage();
  const previousVersions = panel ? olderVersions(panel) : [];

  return (
    <div className={`${card} p-5 space-y-4`} data-testid="invoice-documents-section">
      <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>{t('invoices.documents.title')}</h3>

      {loading && !panel ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Icon name="loader-2" className="h-4 w-4 animate-spin" />
          {t('invoices.documents.loading')}
        </div>
      ) : null}

      {panel?.panelState === 'GENERATING' ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3"
          role="status"
          aria-live="polite"
        >
          <Icon name="loader-2" className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand" />
          <div className="space-y-1">
            <p className={`text-xs font-semibold ${tp}`}>{t('invoices.documents.generating.title')}</p>
            <p className={`text-[11px] ${ts}`}>{t('invoices.documents.generating.hint')}</p>
          </div>
        </div>
      ) : null}

      {panel?.panelState === 'FAILED' ? (
        <div className="rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] p-3 space-y-2">
          <p className="text-xs font-semibold text-[color:var(--status-critical)]">
            {t('invoices.documents.failed.title')}
          </p>
          <p className={`text-xs ${tp}`}>
            {panel.generation.errorMessage ?? t('invoices.documents.failed.unknownError')}
          </p>
          {panel.generation.lastAttemptAt ? (
            <p className={`text-[11px] ${ts}`}>
              {t('invoices.documents.failed.lastAttempt')}{' '}
              {formatDateTime(panel.generation.lastAttemptAt, locale)}
            </p>
          ) : null}
          <ActionButton
            label={t('common.retry')}
            icon="refresh-cw"
            disabled={!panel.capabilities.retry.allowed}
            reason={panel.capabilities.retry.reason}
            loading={generating}
            onClick={onRetryGeneration}
          />
        </div>
      ) : null}

      {panel?.panelState === 'EMPTY' ? (
        <div className="space-y-3">
          <p className={`text-xs ${tp}`}>{t('invoices.documents.empty.description')}</p>
          <ActionButton
            label={t('invoices.documents.action.generatePdf')}
            icon="file-check"
            disabled={!panel.capabilities.generate.allowed}
            reason={panel.capabilities.generate.reason}
            loading={generating}
            onClick={() => onGenerate(false)}
          />
        </div>
      ) : null}

      {panel?.panelState === 'ACTIVE' && panel.activeDocument ? (
        <div className="space-y-3">
          <ActiveDocumentCard
            doc={panel.activeDocument}
            panel={panel}
            generating={generating}
            sendingEmail={sendingEmail}
            onPreview={onPreview}
            onDownload={onDownload}
            onGenerate={onGenerate}
            onSendEmail={onSendEmail}
            tp={tp}
            ts={ts}
            t={t}
            locale={locale}
          />
          <VersionHistory
            versions={previousVersions}
            onPreview={onPreview}
            onDownload={onDownload}
            tp={tp}
            ts={ts}
            t={t}
            locale={locale}
          />
        </div>
      ) : null}

      {panel?.panelState === 'ACTIVE' && !panel.activeDocument && panel.hasIncomingAttachment ? (
        <div className="space-y-3">
          <p className={`text-xs ${tp}`}>{t('invoices.documents.incomingAttachment.description')}</p>
          <ActionButton
            label={t('invoices.documents.action.openAttachment')}
            icon="paperclip"
            disabled={!panel.capabilities.preview.allowed}
            reason={panel.capabilities.preview.reason}
            onClick={onPreviewIncoming}
          />
          <ActionButton
            label={t('invoices.documents.action.generatePdf')}
            icon="file-check"
            disabled={!panel.capabilities.generate.allowed}
            reason={panel.capabilities.generate.reason}
            loading={generating}
            onClick={() => onGenerate(false)}
          />
        </div>
      ) : null}

      {panel ? (
        <div className="space-y-2 border-t border-border/50 pt-4">
          <h4 className={`text-[10px] font-bold uppercase tracking-wider ${ts}`}>
            {t('invoices.documents.delivery.title')}
          </h4>
          <DeliveryHistoryTable
            items={panel.deliveryHistory}
            retryingEmailId={retryingEmailId}
            onRetryDelivery={onRetryDelivery}
            tp={tp}
            ts={ts}
            t={t}
            locale={locale}
          />
        </div>
      ) : null}
    </div>
  );
}
