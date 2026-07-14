import { useState } from 'react';

import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
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
}) {
  const caps = panel.capabilities;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/15 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold ${tp}`}>{doc.fileName}</span>
        {doc.isActive ? (
          <StatusChip tone="success" dot>
            Aktive Version
          </StatusChip>
        ) : null}
        <StatusChip tone={documentStatusTone(doc.status)} dot>
          {doc.statusLabel}
        </StatusChip>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <MetaRow label="Dokumenttyp" value={doc.documentTypeLabel} tp={tp} ts={ts} />
        <MetaRow label="Version" value={String(doc.version)} tp={tp} ts={ts} />
        <MetaRow label="Erstellt am" value={formatDateTime(doc.createdAt)} tp={tp} ts={ts} />
        <MetaRow label="Ersteller" value={doc.createdByName ?? '—'} tp={tp} ts={ts} />
        {doc.sizeLabel ? <MetaRow label="Dateigröße" value={doc.sizeLabel} tp={tp} ts={ts} /> : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        <ActionButton
          label="Vorschau"
          icon="eye"
          disabled={!doc.capabilities.preview.allowed}
          reason={doc.capabilities.preview.reason}
          onClick={() => onPreview(doc.id)}
        />
        <ActionButton
          label="Download"
          icon="download"
          disabled={!doc.capabilities.download.allowed}
          reason={doc.capabilities.download.reason}
          onClick={() => onDownload(doc.id)}
        />
        <ActionButton
          label="Per E-Mail senden"
          icon="mail"
          disabled={!caps.sendEmail.allowed}
          reason={caps.sendEmail.reason}
          loading={sendingEmail}
          onClick={onSendEmail}
        />
        <ActionButton
          label="Neue Version erzeugen"
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
}: {
  versions: InvoiceDocumentVersion[];
  onPreview: (id: string) => void;
  onDownload: (id: string) => void;
  tp: string;
  ts: string;
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
        <span>Frühere Versionen ({versions.length})</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="h-4 w-4 shrink-0" />
      </button>
      {open ? (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-medium ${tp}`}>Version {v.version}</span>
                <StatusChip tone={documentStatusTone(v.status)} dot>
                  {v.statusLabel}
                </StatusChip>
              </div>
              <p className={`text-[11px] ${ts}`}>{formatDateTime(v.createdAt)}</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  label="Vorschau"
                  icon="eye"
                  disabled={!v.capabilities.preview.allowed}
                  reason={v.capabilities.preview.reason}
                  onClick={() => onPreview(v.id)}
                />
                <ActionButton
                  label="Download"
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
}: {
  items: InvoiceDeliveryHistoryItem[];
  retryingEmailId: string | null;
  onRetryDelivery: (emailId: string) => void;
  tp: string;
  ts: string;
}) {
  if (items.length === 0) {
    return <p className={`text-xs ${ts}`}>Noch keine Versände für diese Rechnung.</p>;
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
            <MetaRow label="Kanal" value={row.channelLabel} tp={tp} ts={ts} />
            <MetaRow label="Dokumentversion" value={row.documentVersionLabel} tp={tp} ts={ts} />
            <MetaRow
              label="Datum/Uhrzeit"
              value={formatDateTime(row.sentAt ?? row.createdAt)}
              tp={tp}
              ts={ts}
            />
            <MetaRow label="Ausgelöst von" value={row.triggeredByName ?? '—'} tp={tp} ts={ts} />
          </dl>
          {row.errorMessage ? (
            <p className="text-xs text-[color:var(--status-critical)]" role="alert">
              {row.errorMessage}
            </p>
          ) : null}
          {row.capabilities.retry.allowed ? (
            <ActionButton
              label="Erneut senden"
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
  const previousVersions = panel ? olderVersions(panel) : [];

  return (
    <div className={`${card} p-5 space-y-4`}>
      <h3 className={`text-xs font-bold ${tp} uppercase tracking-wider`}>Dokumente</h3>

      {loading && !panel ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Icon name="loader-2" className="h-4 w-4 animate-spin" />
          Dokumente werden geladen…
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
            <p className={`text-xs font-semibold ${tp}`}>PDF wird erzeugt…</p>
            <p className={`text-[11px] ${ts}`}>
              Bitte warten — eine erneute Generierung ist derzeit nicht möglich.
            </p>
          </div>
        </div>
      ) : null}

      {panel?.panelState === 'FAILED' ? (
        <div className="rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical-soft)] p-3 space-y-2">
          <p className="text-xs font-semibold text-[color:var(--status-critical)]">
            PDF-Erzeugung fehlgeschlagen
          </p>
          <p className={`text-xs ${tp}`}>{panel.generation.errorMessage ?? 'Unbekannter Fehler'}</p>
          {panel.generation.lastAttemptAt ? (
            <p className={`text-[11px] ${ts}`}>
              Letzter Versuch: {formatDateTime(panel.generation.lastAttemptAt)}
            </p>
          ) : null}
          <ActionButton
            label="Erneut versuchen"
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
          <p className={`text-xs ${tp}`}>Für diese Rechnung wurde noch kein PDF erzeugt.</p>
          <ActionButton
            label="PDF erzeugen"
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
          />
          <VersionHistory
            versions={previousVersions}
            onPreview={onPreview}
            onDownload={onDownload}
            tp={tp}
            ts={ts}
          />
        </div>
      ) : null}

      {panel?.panelState === 'ACTIVE' && !panel.activeDocument && panel.hasIncomingAttachment ? (
        <div className="space-y-3">
          <p className={`text-xs ${tp}`}>Eingangsbeleg als Anhang vorhanden (kein generiertes PDF).</p>
          <ActionButton
            label="Anhang öffnen"
            icon="paperclip"
            disabled={!panel.capabilities.preview.allowed}
            reason={panel.capabilities.preview.reason}
            onClick={onPreviewIncoming}
          />
          <ActionButton
            label="PDF erzeugen"
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
          <h4 className={`text-[10px] font-bold uppercase tracking-wider ${ts}`}>Versandhistorie</h4>
          <DeliveryHistoryTable
            items={panel.deliveryHistory}
            retryingEmailId={retryingEmailId}
            onRetryDelivery={onRetryDelivery}
            tp={tp}
            ts={ts}
          />
        </div>
      ) : null}
    </div>
  );
}
