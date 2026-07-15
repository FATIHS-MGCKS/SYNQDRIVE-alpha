import type { MasterContractPreviewDto } from '../../types/master-contract.types';
import { formatMoneyCents } from './admin-billing.utils';

interface MasterContractPreviewPanelProps {
  preview: MasterContractPreviewDto | null;
}

export function MasterContractPreviewPanel({ preview }: MasterContractPreviewPanelProps) {
  if (!preview) return null;

  return (
    <div
      className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3"
      data-testid="master-contract-preview-panel"
    >
      <div>
        <h4 className="text-[12px] font-semibold text-foreground">Kosten-Vorschau</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Vorher/Nachher — Änderung wird erst nach Bestätigung übernommen.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 bg-background/70 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Aktuell</p>
          <p className="text-sm font-semibold mt-2 tabular-nums">
            {formatMoneyCents(preview.current.amountAfterDiscountCents)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {preview.current.quantity} Fahrzeuge · {preview.current.priceVersionLabel ?? '—'}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--brand)]/30 bg-[var(--brand-soft)]/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Geplant</p>
          <p className="text-sm font-semibold mt-2 tabular-nums">
            {formatMoneyCents(preview.proposed.amountAfterDiscountCents)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {preview.proposed.quantity} Fahrzeuge · Version {preview.proposed.priceVersionId?.slice(0, 8) ?? '—'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        <span>Anteilig: {formatMoneyCents(preview.proration.proratedSubtotalCents)}</span>
        <span>Wirksam ab: {new Date(preview.effectiveAt).toLocaleDateString('de-DE')}</span>
      </div>

      {preview.warnings.length > 0 ? (
        <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-1">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
