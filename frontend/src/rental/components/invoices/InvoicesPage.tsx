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
import type { Invoice } from './invoiceTypes';
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

  const handleOpenDetail = (inv: Invoice) => {
    void openDetail(inv, (full) => {
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
            <Button type="button" variant="ai" size="sm" onClick={() => setView('upload')}>
              <Icon name="sparkles" className="size-3.5" />
              KI-Upload
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => setView('create')}>
              <Icon name="plus" className="size-3.5" />
              <span className="hidden min-[420px]:inline">Rechnung erstellen</span>
              <span className="min-[420px]:hidden">Neu</span>
            </Button>
          </div>
        )}
      />

      <InvoiceKpiGrid
        stats={invoicesState.stats}
        totalInvoices={invoicesState.invoices.length}
        filteredCount={invoicesState.filtered.length}
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
        searchTerm={invoicesState.searchTerm}
        onSearchTermChange={invoicesState.setSearchTerm}
        statusFilter={invoicesState.statusFilter}
        onStatusFilterChange={invoicesState.setStatusFilter}
        directionFilter={invoicesState.directionFilter}
        onDirectionFilterChange={invoicesState.setDirectionFilter}
        isDirectionOpen={invoicesState.isDirectionOpen}
        onDirectionOpenChange={invoicesState.setIsDirectionOpen}
        isStatusOpen={invoicesState.isStatusOpen}
        onStatusOpenChange={invoicesState.setIsStatusOpen}
        filteredCount={invoicesState.filtered.length}
        totalCount={invoicesState.invoices.length}
        statusCount={invoicesState.statusCount}
        directionCount={invoicesState.directionCount}
        activeDirectionLabel={invoicesState.activeDirectionLabel}
        activeStatusLabel={invoicesState.activeStatusLabel}
        hasActiveFilters={invoicesState.hasActiveFilters}
        onClearFilters={invoicesState.clearFilters}
      />

      <InvoiceList
        invoices={invoicesState.filtered}
        loading={invoicesState.loading}
        searchTerm={invoicesState.searchTerm}
        statusFilter={invoicesState.statusFilter}
        isDarkMode={isDarkMode}
        tp={theme.tp}
        ts={theme.ts}
        onSelect={handleOpenDetail}
      />
    </div>
  );
}
