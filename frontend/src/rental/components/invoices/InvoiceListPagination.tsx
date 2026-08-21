import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { invoiceListPaginationLabel } from '../../lib/invoice-list-i18n';
import type { InvoiceListMeta } from './invoiceTypes';

interface InvoiceListPaginationProps {
  meta: InvoiceListMeta | null;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function InvoiceListPagination({ meta, onPageChange, disabled }: InvoiceListPaginationProps) {
  const { locale, t } = useLanguage();

  if (!meta || meta.totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{invoiceListPaginationLabel(locale, meta)}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={disabled || meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          {t('invoices.list.pagination.back')}
        </Button>
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {t('invoices.list.pagination.page', { page: meta.page, totalPages: meta.totalPages })}
        </span>
        <Button
          type="button"
          variant="neutral"
          size="sm"
          disabled={disabled || meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          {t('invoices.list.pagination.next')}
        </Button>
      </div>
    </div>
  );
}
