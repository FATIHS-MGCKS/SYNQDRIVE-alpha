import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  operatorEntryAccessAppName,
  operatorEntryAccessLinkCopiedLabel,
  operatorEntryAccessLinkCopyLabel,
  operatorEntryAccessLinkInstructionsAfter,
  operatorEntryAccessLinkInstructionsBefore,
  operatorEntryAccessLinkToastError,
  operatorEntryAccessLinkToastSuccess,
} from '../lib/operator-entry-access-i18n';
import { buildOperatorEntryUrl } from '../lib/operatorRoutes';

interface OperatorLinkCardProps {
  className?: string;
}

/**
 * Shareable operator URL — copy-first (no QR dependency).
 * Deep links: `/operator/vehicles/:id`, `/operator/bookings/:id`, `?vehicleId=` / `?bookingId=`.
 */
export function OperatorLinkCard({ className = '' }: OperatorLinkCardProps) {
  const { locale } = useLanguage();
  const url = useMemo(() => buildOperatorEntryUrl(), []);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(operatorEntryAccessLinkToastSuccess(locale));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(operatorEntryAccessLinkToastError(locale));
    }
  };

  return (
    <div className={`rounded-xl border border-border bg-muted/30 p-4 space-y-3 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {operatorEntryAccessAppName(locale)}
      </p>
      <p className="text-xs text-muted-foreground">
        {operatorEntryAccessLinkInstructionsBefore(locale)}{' '}
        <code className="mx-1 rounded surface-premium px-1">/operator</code>{' '}
        {operatorEntryAccessLinkInstructionsAfter(locale)}
      </p>
      <p className="break-all rounded-lg surface-premium px-3 py-2 font-mono text-xs text-foreground border border-border">
        {url}
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="sq-3d-btn sq-3d-btn--primary inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied
          ? operatorEntryAccessLinkCopiedLabel(locale)
          : operatorEntryAccessLinkCopyLabel(locale)}
      </button>
    </div>
  );
}
