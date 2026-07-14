import { Icon } from '../ui/Icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import type { InvoiceActionGate, InvoiceActionMatrix } from './invoiceDetailTypes';

export interface InvoiceHeaderMoreMenuProps {
  actions: InvoiceActionMatrix;
  onIssue?: () => void;
  onRegeneratePdf?: () => void;
  onMarkSentExternally?: () => void;
  onRecordPayment?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  regenerating?: boolean;
  markingSent?: boolean;
}

function MoreItem({
  label,
  gate,
  onClick,
  destructive,
  loading,
}: {
  label: string;
  gate: InvoiceActionGate;
  onClick?: () => void;
  destructive?: boolean;
  loading?: boolean;
}) {
  const disabled = !gate.allowed || !onClick || loading;
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={onClick}
      className={destructive ? 'text-[color:var(--status-critical)] focus:text-[color:var(--status-critical)]' : undefined}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium">{loading ? `${label}…` : label}</span>
        {disabled && gate.reason ? (
          <span className="text-[10px] text-muted-foreground leading-snug">{gate.reason}</span>
        ) : null}
      </div>
    </DropdownMenuItem>
  );
}

export function InvoiceHeaderMoreMenu({
  actions,
  onIssue,
  onRegeneratePdf,
  onMarkSentExternally,
  onRecordPayment,
  onEdit,
  onCancel,
  regenerating,
  markingSent,
}: InvoiceHeaderMoreMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="sq-press inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border surface-premium px-3 py-2 text-xs font-semibold hover:bg-muted"
        >
          <Icon name="more-horizontal" className="h-3.5 w-3.5" />
          <span>Mehr</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {actions.issue.allowed && (
          <MoreItem label="Ausstellen" gate={actions.issue} onClick={onIssue} />
        )}
        <MoreItem
          label="PDF neu erzeugen"
          gate={actions.regenerate_pdf}
          onClick={onRegeneratePdf}
          loading={regenerating}
        />
        <MoreItem
          label="Externen Versand erfassen"
          gate={actions.mark_sent_externally}
          onClick={onMarkSentExternally}
          loading={markingSent}
        />
        <MoreItem label="Zahlung erfassen" gate={actions.record_payment} onClick={onRecordPayment} />
        <MoreItem label="Bearbeiten" gate={actions.edit} onClick={onEdit} />
        <DropdownMenuSeparator />
        <MoreItem label="Stornieren" gate={actions.cancel} onClick={onCancel} destructive />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
