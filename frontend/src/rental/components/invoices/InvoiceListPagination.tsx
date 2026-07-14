import { Button } from '../../../components/ui/button';
import { paginationLabel } from './invoiceListState';
import type { InvoiceListMeta } from './invoiceTypes';

interface InvoiceListPaginationProps {
  meta: InvoiceListMeta | null;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function InvoiceListPagination({ meta, onPageChange, disabled }: InvoiceListPaginationProps) {
  if (!meta || meta.totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{paginationLabel(meta)}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={disabled || meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          Zurück
        </Button>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          Seite {meta.page} / {meta.totalPages}
        </span>
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={disabled || meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          Weiter
        </Button>
      </div>
    </div>
  );
}
