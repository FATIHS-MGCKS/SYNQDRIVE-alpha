import { useMemo, useState } from 'react';

import { PageHeader } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { InvoiceDetail } from './InvoiceDetail';
import { InvoiceExtractionUpload } from './InvoiceExtractionUpload';
import { InvoiceFilters } from './InvoiceFilters';
import { InvoiceKpiGrid } from './InvoiceKpiGrid';
import { InvoiceList } from './InvoiceList';
import { useInvoiceDetail } from './hooks/useInvoiceDetail';
import { useInvoices } from './hooks/useInvoices';
import type { Invoice, InvoiceListItem } from './invoiceTypes';
import { getInvoiceThemeClasses } from './invoiceTheme';
import type { InvoiceRelationNavigation } from './InvoiceRelations';

export type InvoicePageView = 'list' | 'create' | 'upload' | 'detail';

interface InvoicesPageProps {
  isDarkMode: boolean;
  navigation?: InvoiceRelationNavigation;
}

export function InvoicesPage({ isDarkMode, navigation }: InvoicesPageProps) {
  const { orgId } = useRentalOrg();
  const theme = useMemo(() => getInvoiceThemeClasses(isDarkMode), [isDarkMode]);

  const invoicesState = useInvoices(orgId);
  const { openDetail } = useInvoiceDetail(orgId || '');

  const [view, setView] = useState<InvoicePageView>('list');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const handleOpenDetail = (item: InvoiceListItem) => {
    void openDetail(item, (full) => {
      setSelectedInvoice(full);
      setView('detail');
    });
  };

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

  if (view === 'upload') {
    return (
      <InvoiceExtractionUpload
        isDarkMode={isDarkMode}
        orgId={orgId || ''}
        vehicles={invoicesState.lookup.vehicles}
        onClose={() => setView('list')}
        onCreated={(inv) => {
          setView('detail');
          setSelectedInvoice(inv);
          void invoicesState.reload();
        }}
        card={theme.card}
        tp={theme.tp}
        ts={theme.ts}
      />
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      <PageHeader
        title="Rechnungen"
        className="mb-4 flex-row items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-4"
        actions={(
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            <Button type="button" variant="ai" size="sm" onClick={() => { void invoicesState.loadLookup(); setView('upload'); }}>
              <Icon name="sparkles" className="size-3.5" />
              KI-Upload
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => { void invoicesState.loadLookup(); setView('create'); }}>
              <Icon name="plus" className="size-3.5" />
              <span className="hidden min-[420px]:inline">Rechnung erstellen</span>
              <span className="min-[420px]:hidden">Neu</span>
            </Button>
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
