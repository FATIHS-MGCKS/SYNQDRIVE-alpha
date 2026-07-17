import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { InvoiceDetail } from './InvoiceDetail';
import { InvoiceFilters } from './InvoiceFilters';
import { InvoiceKpiGrid } from './InvoiceKpiGrid';
import { InvoiceList } from './InvoiceList';
import { useInvoiceDetail } from './hooks/useInvoiceDetail';
import { useInvoices } from './hooks/useInvoices';
import type { Invoice, InvoiceListItem } from './invoiceTypes';
import { getInvoiceThemeClasses } from './invoiceTheme';
import type { InvoiceRelationNavigation } from './InvoiceRelations';
import { DocumentIntakeLaunchAiButton } from '../documents/DocumentIntakeLaunchButton';

export type InvoicePageView = 'list' | 'create' | 'detail';

interface InvoicesPageProps {
  isDarkMode: boolean;
  navigation?: InvoiceRelationNavigation;
  initialInvoiceId?: string | null;
  onConsumeInitialInvoiceId?: () => void;
}

export function InvoicesPage({
  isDarkMode,
  navigation,
  initialInvoiceId,
  onConsumeInitialInvoiceId,
}: InvoicesPageProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const { t } = useLanguage();
  const canWriteInvoices = hasPermission('invoices', 'write');
  const theme = useMemo(() => getInvoiceThemeClasses(isDarkMode), [isDarkMode]);

  const invoicesState = useInvoices(orgId);
  const { openDetail } = useInvoiceDetail(orgId || '');

  const [view, setView] = useState<InvoicePageView>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [openingDetail, setOpeningDetail] = useState(false);

  const handleOpenDetail = (item: InvoiceListItem) => {
    setOpeningDetail(true);
    void openDetail(item, (full) => {
      setSelectedInvoice(full);
      setView('detail');
      setOpeningDetail(false);
    }).finally(() => setOpeningDetail(false));
  };

  useEffect(() => {
    if (!orgId || !initialInvoiceId) return;
    setOpeningDetail(true);
    void (async () => {
      try {
        const full = await api.invoices.get(orgId, initialInvoiceId);
        setSelectedInvoice(full);
        setView('detail');
      } catch {
        toast.error('Rechnung konnte nicht geöffnet werden.');
      } finally {
        setOpeningDetail(false);
        onConsumeInitialInvoiceId?.();
      }
    })();
  }, [initialInvoiceId, onConsumeInitialInvoiceId, orgId]);

  if (openingDetail) {
    return (
      <div className="max-w-[1600px] mx-auto py-16 text-center text-sm text-muted-foreground">
        Rechnung wird geladen…
      </div>
    );
  }

  if (view === 'detail' && selectedInvoice) {
    return (
      <InvoiceDetail
        {...theme}
        invoice={selectedInvoice}
        orgId={orgId || ''}
        navigation={navigation}
        onBack={() => {
          setView('list');
          setSelectedInvoice(null);
          void invoicesState.reload();
        }}
        onUpdate={setSelectedInvoice}
      />
    );
  }

  if (view === 'create') {
    return (
      <CreateInvoiceDialog
        {...theme}
        orgId={orgId || ''}
        lookup={invoicesState.lookup}
        onClose={() => setView('list')}
        onCreated={(inv) => {
          setView('detail');
          setSelectedInvoice(inv);
          void invoicesState.reload();
        }}
      />
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        title={t('nav.customerInvoices')}
        className="mb-4 flex-row items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-4"
        actions={(
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {canWriteInvoices ? (
              <>
                <DocumentIntakeLaunchAiButton
                  label="KI-Upload"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 surface-premium px-3 py-2 text-[10px] font-semibold"
                  request={{
                    optionalContextType: 'INVOICE',
                    sourceSurface: 'invoices_page',
                    returnView: 'invoices',
                    documentTab: 'upload',
                  }}
                />
                <Button type="button" variant="primary" size="sm" onClick={() => { void invoicesState.loadLookup(); setView('create'); }}>
                  <Icon name="plus" className="size-3.5" />
                  <span className="hidden min-[420px]:inline">Rechnung erstellen</span>
                  <span className="min-[420px]:hidden">Neu</span>
                </Button>
              </>
            ) : null}
          </div>
        )}
      />

      <InvoiceKpiGrid
        stats={invoicesState.stats}
        totalInvoices={invoicesState.stats?.total ?? invoicesState.listTotal}
        filteredCount={invoicesState.listTotal}
        directionCount={invoicesState.directionCount}
        unpaidCount={invoicesState.unpaidCount}
        overdueCount={invoicesState.overdueCount}
        hasActiveFilters={invoicesState.hasActiveFilters}
        directionFilter={invoicesState.directionFilter}
        statusFilter={invoicesState.statusFilter}
        onClearFilters={invoicesState.clearFilters}
        onDirectionFilter={invoicesState.setDirectionFilter}
        onStatusFilter={invoicesState.setStatusFilter}
      />

      <InvoiceFilters
        {...theme}
        filters={invoicesState.filters}
        onPatchFilters={invoicesState.patchFilters}
        searchTerm={invoicesState.searchTerm}
        onSearchTermChange={invoicesState.setSearchTerm}
        stations={invoicesState.stations}
        filteredCount={invoicesState.listTotal}
        totalCount={invoicesState.stats?.total ?? invoicesState.listTotal}
        statusCount={invoicesState.statusCount}
        directionCount={invoicesState.directionCount}
        stationLabel={invoicesState.stationLabel}
        hasActiveFilters={invoicesState.hasActiveFilters}
        onClearFilters={invoicesState.clearFilters}
      />

      <InvoiceList
        items={invoicesState.items}
        loading={invoicesState.loading}
        error={invoicesState.error}
        hasActiveFilters={invoicesState.hasActiveFilters}
        searchTerm={invoicesState.searchTerm}
        meta={invoicesState.meta}
        onSelect={handleOpenDetail}
        onRetry={() => void invoicesState.reload()}
        onPageChange={invoicesState.setPage}
        onClearFilters={invoicesState.clearFilters}
      />
    </div>
  );
}
