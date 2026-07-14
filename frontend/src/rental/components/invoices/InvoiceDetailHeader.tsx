import { useMemo } from 'react';

import { StatusChip } from '../../../components/patterns';
import { INVOICE_TYPE_MAP } from './invoiceConstants';
import { invoiceStatusTone } from './invoiceDetailStatus.util';
import type { InvoiceDetailDto } from './invoiceDetailTypes';
import { primaryActionsGridClass, resolveInvoiceHeaderLayoutMode } from './invoiceDetailHeader.layout';
import { HeaderActionButton } from './InvoiceHeaderActionButton';
import { InvoiceHeaderMoreMenu } from './InvoiceHeaderMoreMenu';
import type { InvoiceThemeClasses } from './invoiceTheme';
import { RecordPaymentDialog } from './RecordPaymentDialog';

export interface InvoiceDetailHeaderProps extends InvoiceThemeClasses {
  detail: InvoiceDetailDto;
  viewportWidth?: number;
  loadingSendDoc?: boolean;
  generatingPdf?: boolean;
  regeneratingPdf?: boolean;
  markingSent?: boolean;
  showPaymentForm?: boolean;
  paymentAmount?: string;
  paymentMethod?: string;
  paymentReference?: string;
  recordingPayment?: boolean;
  onViewPdf?: () => void;
  onGeneratePdf?: () => void;
  onSendEmail?: () => void;
  onIssue?: () => void;
  onRegeneratePdf?: () => void;
  onMarkSentExternally?: () => void;
  onRecordPayment?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onCopyInternalId?: () => void;
  onPaymentAmountChange?: (value: string) => void;
  onPaymentMethodChange?: (value: string) => void;
  onPaymentReferenceChange?: (value: string) => void;
  onCancelPaymentForm?: () => void;
  onSubmitPayment?: () => void;
}

function AmountCell({ label, value, emphasize }: { label: string; value: string; emphasize?: 'watch' | 'success' }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-semibold tabular-nums tracking-tight ${
          emphasize === 'watch'
            ? 'text-[color:var(--status-watch)]'
            : emphasize === 'success'
              ? 'text-[color:var(--status-positive)]'
              : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function InvoiceDetailHeader({
  detail,
  viewportWidth = 390,
  loadingSendDoc,
  generatingPdf,
  regeneratingPdf,
  markingSent,
  showPaymentForm,
  paymentAmount = '',
  paymentMethod = 'BANK_TRANSFER',
  paymentReference = '',
  recordingPayment,
  onViewPdf,
  onGeneratePdf,
  onSendEmail,
  onIssue,
  onRegeneratePdf,
  onMarkSentExternally,
  onRecordPayment,
  onEdit,
  onCancel,
  onCopyInternalId,
  onPaymentAmountChange,
  onPaymentMethodChange,
  onPaymentReferenceChange,
  onCancelPaymentForm,
  onSubmitPayment,
  card,
  tp,
  ts,
  inputCls,
  isDarkMode,
}: InvoiceDetailHeaderProps) {
  const layoutMode = useMemo(() => resolveInvoiceHeaderLayoutMode(viewportWidth), [viewportWidth]);
  const typeMeta = INVOICE_TYPE_MAP[detail.core.type] || INVOICE_TYPE_MAP.OUTGOING_MANUAL;
  const TypeIcon = typeMeta.icon;
  const statusTone = invoiceStatusTone(detail.core.status);

  const showViewPdf = detail.document.hasPdf && detail.primary.viewPdf.allowed;

  const primaryGrid = primaryActionsGridClass(layoutMode);

  return (
    <div className={`${card} p-4 sm:p-5 space-y-4`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-brand tabular-nums">{detail.core.invoiceNumberDisplay}</span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${typeMeta.color}`}>
              <TypeIcon className="h-3 w-3 shrink-0" aria-hidden />
              {detail.core.typeLabel}
            </span>
            <StatusChip tone={statusTone} dot>
              {detail.core.statusLabel}
            </StatusChip>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <AmountCell label="Gesamtbetrag" value={detail.amounts.totalFormatted} />
            <AmountCell label="Bezahlt" value={detail.amounts.paidFormatted} emphasize="success" />
            <AmountCell
              label="Offen"
              value={detail.amounts.outstandingFormatted}
              emphasize={detail.amounts.outstandingCents > 0 ? 'watch' : undefined}
            />
            <AmountCell label="Fälligkeit" value={detail.amounts.dueDateFormatted} />
          </div>

          <p className={`text-[11px] ${ts}`}>
            Rechnungsdatum:{' '}
            <span className={`font-medium tabular-nums ${tp}`}>{detail.amounts.invoiceDateFormatted}</span>
          </p>
        </div>

        <div className={layoutMode === 'desktop' ? 'w-auto' : 'w-full'}>
          <div className={primaryGrid}>
            {showViewPdf ? (
              <HeaderActionButton
                label="PDF ansehen"
                icon="file-text"
                disabled={!detail.primary.viewPdf.allowed}
                reason={detail.primary.viewPdf.reason}
                onClick={onViewPdf}
                variant="primary"
                className={layoutMode === 'compact' ? 'col-span-2' : undefined}
              />
            ) : (
              <HeaderActionButton
                label="PDF erzeugen"
                icon="file-check"
                disabled={!detail.primary.generatePdf.allowed}
                reason={detail.primary.generatePdf.reason}
                loading={generatingPdf}
                onClick={onGeneratePdf}
                variant="primary"
                className={layoutMode === 'compact' ? 'col-span-2' : undefined}
              />
            )}
            <HeaderActionButton
              label="Per E-Mail senden"
              icon="mail"
              disabled={!detail.primary.sendEmail.allowed}
              reason={detail.primary.sendEmail.reason}
              loading={loadingSendDoc}
              onClick={onSendEmail}
            />
            <InvoiceHeaderMoreMenu
              actions={detail.actions}
              onIssue={onIssue}
              onRegeneratePdf={onRegeneratePdf}
              onMarkSentExternally={onMarkSentExternally}
              onRecordPayment={onRecordPayment}
              onEdit={onEdit}
              onCancel={onCancel}
              onCopyInternalId={onCopyInternalId}
              regenerating={regeneratingPdf}
              markingSent={markingSent}
            />
          </div>
        </div>
      </div>

      <RecordPaymentDialog
        open={Boolean(showPaymentForm)}
        paymentAmount={paymentAmount}
        paymentMethod={paymentMethod}
        paymentReference={paymentReference}
        recordingPayment={Boolean(recordingPayment)}
        onPaymentAmountChange={onPaymentAmountChange ?? (() => undefined)}
        onPaymentMethodChange={onPaymentMethodChange ?? (() => undefined)}
        onPaymentReferenceChange={onPaymentReferenceChange ?? (() => undefined)}
        onCancel={onCancelPaymentForm ?? (() => undefined)}
        onSubmit={onSubmitPayment ?? (() => undefined)}
        isDarkMode={isDarkMode}
        tp={tp}
        ts={ts}
        card={card}
        inputCls={inputCls}
      />
    </div>
  );
}
