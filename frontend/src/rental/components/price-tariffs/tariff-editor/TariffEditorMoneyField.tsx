import { grossMajorFromNetCents, netPreviewFromGrossInput } from '../../../pricing/tariff-live-draft-compare';
import { cn } from '../../../../components/ui/utils';

interface TariffEditorMoneyFieldProps {
  label: string;
  netCents: number;
  taxRate: number;
  currency: string | null;
  onNetCentsChange: (cents: number) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  inputClassName: string;
  grossPreviewLabel: string;
}

export function TariffEditorMoneyField({
  label,
  netCents,
  taxRate,
  currency,
  onNetCentsChange,
  error,
  hint,
  required,
  inputClassName,
  grossPreviewLabel,
}: TariffEditorMoneyFieldProps) {
  const grossMajor = grossMajorFromNetCents(netCents, taxRate);

  return (
    <label className="block text-xs">
      <span className="font-semibold text-muted-foreground">
        {label}
        {required ? ' *' : ''}
        {currency ? ` (${currency})` : ''}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={Number.isFinite(grossMajor) ? grossMajor.toFixed(2) : '0.00'}
        onChange={(e) => onNetCentsChange(netPreviewFromGrossInput(parseFloat(e.target.value || '0'), taxRate))}
        className={cn(inputClassName, 'mt-1 tabular-nums', error && 'border-[color:var(--status-critical)]')}
        aria-invalid={Boolean(error)}
      />
      <p className="mt-1 text-[10px] text-muted-foreground">
        {grossPreviewLabel}: {currency && netCents > 0 ? `${(netCents / 100).toFixed(2)} ${currency} net` : '—'}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
      {error ? <p className="mt-1 text-[10px] text-[color:var(--status-critical)]">{error}</p> : null}
    </label>
  );
}

interface TariffEditorDepositFieldProps {
  label: string;
  cents: number;
  currency: string | null;
  onCentsChange: (cents: number) => void;
  error?: string;
  hint?: string;
  inputClassName: string;
}

export function TariffEditorDepositField({
  label,
  cents,
  currency,
  onCentsChange,
  error,
  hint,
  inputClassName,
}: TariffEditorDepositFieldProps) {
  return (
    <label className="block text-xs">
      <span className="font-semibold text-muted-foreground">
        {label}
        {currency ? ` (${currency})` : ''}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={(cents / 100).toFixed(2)}
        onChange={(e) => onCentsChange(Math.round(parseFloat(e.target.value || '0') * 100))}
        className={cn(inputClassName, 'mt-1 tabular-nums', error && 'border-[color:var(--status-critical)]')}
        aria-invalid={Boolean(error)}
      />
      {hint ? <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p> : null}
      {error ? <p className="mt-1 text-[10px] text-[color:var(--status-critical)]">{error}</p> : null}
    </label>
  );
}
