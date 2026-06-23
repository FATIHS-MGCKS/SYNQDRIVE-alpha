interface BillingPublishModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  effectiveFrom: string | null | undefined;
  hasMissingPrices: boolean;
  onConfirm: (allowUnpriced: boolean) => void;
  loading?: boolean;
}

export function BillingPublishModal({
  open,
  onOpenChange,
  effectiveFrom,
  hasMissingPrices,
  onConfirm,
  loading,
}: BillingPublishModalProps) {
  if (!open) return null;

  const dateLabel = effectiveFrom
    ? new Date(effectiveFrom).toLocaleDateString('de-DE')
    : 'sofort';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="sq-card rounded-2xl p-5 w-full max-w-md shadow-[var(--shadow-2)] space-y-4">
        <h3 className="text-[15px] font-semibold">Preisversion veröffentlichen</h3>
        <p className="text-xs text-muted-foreground">
          Diese Preisversion gilt ab {dateLabel}. Historische Rechnungen bleiben unverändert.
        </p>
        {hasMissingPrices && (
          <p className="text-xs sq-tone-warning rounded-lg px-3 py-2">
            Einige Staffeln haben noch keinen Preis. Du kannst trotzdem mit „Unpriced erlauben“
            veröffentlichen.
          </p>
        )}
        <div className="flex flex-col sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-3 py-2 rounded-xl text-xs border border-border/70"
          >
            Abbrechen
          </button>
          {hasMissingPrices && (
            <button
              type="button"
              disabled={loading}
              onClick={() => onConfirm(true)}
              className="px-3 py-2 rounded-xl text-xs border border-border/70 font-semibold"
            >
              Mit Unpriced veröffentlichen
            </button>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => onConfirm(false)}
            className="px-3 py-2 rounded-xl text-xs bg-[var(--brand)] text-white font-semibold"
          >
            Veröffentlichen
          </button>
        </div>
      </div>
    </div>
  );
}
