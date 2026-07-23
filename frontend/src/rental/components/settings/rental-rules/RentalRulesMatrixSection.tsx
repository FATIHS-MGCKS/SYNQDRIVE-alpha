import { ChevronLeft, ChevronRight, Eye, MoreHorizontal, Pencil, Users } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { cn } from '../../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { fhs } from '../../fleet-health-service/fleet-health-service-shell';
import { META_TEXT_CLASS, ROW_BODY_CLASS, ROW_TITLE_CLASS } from '../../dashboard/dashboardShell';
import {
  CATEGORY_STATUS_TONES,
  labelCategoryStatus,
} from './rental-rules-category-lifecycle.utils';
import type { RentalVehicleCategoryDto } from './rental-rules.types';
import {
  formatBool,
  formatDeposit,
  formatLicenseHolding,
  labelPolicy,
} from './rental-rules.utils';
import { isCategoryRulesIncomplete } from './rental-rules-matrix.utils';
import { useRentalRulesMatrix } from './useRentalRulesMatrix';

interface RentalRulesMatrixSectionProps {
  categories: RentalVehicleCategoryDto[];
  canEdit: boolean;
  canAssign: boolean;
  onEdit: (category: RentalVehicleCategoryDto) => void;
  onAssign: (category: RentalVehicleCategoryDto) => void;
  onPreview: (category: RentalVehicleCategoryDto) => void;
}

function SortButton({
  label,
  active,
  order,
  onClick,
}: {
  label: string;
  active: boolean;
  order: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-left font-medium text-foreground hover:text-[var(--brand)]"
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active ? <span className="text-[10px] text-muted-foreground">{order === 'asc' ? '↑' : '↓'}</span> : null}
    </button>
  );
}

function MatrixMobileCard({
  category,
  canEdit,
  canAssign,
  onEdit,
  onAssign,
  onPreview,
}: {
  category: RentalVehicleCategoryDto;
  canEdit: boolean;
  canAssign: boolean;
  onEdit: () => void;
  onAssign: () => void;
  onPreview: () => void;
}) {
  const { t } = useLanguage();
  const incomplete = isCategoryRulesIncomplete(category);

  return (
    <article className="surface-premium rounded-2xl border border-border/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={ROW_TITLE_CLASS}>{category.name}</p>
          <p className={cn(ROW_BODY_CLASS, 'mt-0.5 tabular-nums')}>
            {t('rentalRules.ui.matrix.vehicleCount', { count: category.vehicleCount ?? 0 })}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <StatusChip tone={CATEGORY_STATUS_TONES[category.status]} dot>
            {labelCategoryStatus(category.status)}
          </StatusChip>
          {category.hasUnpublishedDraft ? (
            <StatusChip tone="watch">{t('rentalRules.ui.matrix.draft')}</StatusChip>
          ) : null}
          {incomplete ? (
            <StatusChip tone="critical">{t('rentalRules.ui.matrix.incomplete')}</StatusChip>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <dt className="text-muted-foreground">{t('rentalRules.ui.matrix.minimumAge')}</dt>
          <dd className="font-medium tabular-nums">{category.minimumAgeYears ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('rentalRules.ui.matrix.licenseHolding')}</dt>
          <dd className="font-medium">
            {formatLicenseHolding(category.minimumLicenseHoldingMonths, category.minimumLicenseHoldingYears, {
              long: true,
            })}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('rentalRules.ui.matrix.deposit')}</dt>
          <dd className="font-medium tabular-nums">
            {formatDeposit(category.depositAmountCents, category.depositCurrency ?? 'EUR')}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('rentalRules.ui.matrix.foreignTravel')}</dt>
          <dd className="font-medium">{labelPolicy(category.foreignTravelPolicy)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1 border-t border-border/50 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={!canEdit}>
          <Pencil className="h-3.5 w-3.5" />
          {t('rentalRules.ui.actions.edit')}
        </Button>
        {canAssign ? (
          <Button type="button" variant="ghost" size="sm" onClick={onAssign}>
            <Users className="h-3.5 w-3.5" />
            {t('rentalRules.ui.actions.assign')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={onPreview}>
          <Eye className="h-3.5 w-3.5" />
          {t('rentalRules.ui.actions.preview')}
        </Button>
      </div>
    </article>
  );
}

export function RentalRulesMatrixSection({
  categories,
  canEdit,
  canAssign,
  onEdit,
  onAssign,
  onPreview,
}: RentalRulesMatrixSectionProps) {
  const { t } = useLanguage();
  const matrix = useRentalRulesMatrix(categories);

  const columns: DataTableColumn<RentalVehicleCategoryDto>[] = [
    {
      key: 'name',
      header: (
        <SortButton
          label={t('rentalRules.ui.matrix.category')}
          active={matrix.sortKey === 'name'}
          order={matrix.sortDir}
          onClick={() => matrix.toggleSort('name')}
        />
      ),
      cell: (row) => (
        <div className="min-w-[140px]">
          <p className="font-medium text-foreground">{row.name}</p>
          {row.hasUnpublishedDraft ? (
            <p className="mt-0.5 text-[11px] text-[color:var(--status-watch)]">
              {t('rentalRules.ui.matrix.draftPending')}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'vehicleCount',
      header: (
        <SortButton
          label={t('rentalRules.ui.matrix.vehicleCountLabel')}
          active={matrix.sortKey === 'vehicleCount'}
          order={matrix.sortDir}
          onClick={() => matrix.toggleSort('vehicleCount')}
        />
      ),
      cell: (row) => <span className="tabular-nums">{row.vehicleCount ?? 0}</span>,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'minimumAgeYears',
      header: (
        <SortButton
          label={t('rentalRules.ui.matrix.minimumAge')}
          active={matrix.sortKey === 'minimumAgeYears'}
          order={matrix.sortDir}
          onClick={() => matrix.toggleSort('minimumAgeYears')}
        />
      ),
      cell: (row) => <span className="tabular-nums">{row.minimumAgeYears ?? '—'}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key: 'license',
      header: t('rentalRules.ui.matrix.licenseHolding'),
      cell: (row) =>
        formatLicenseHolding(row.minimumLicenseHoldingMonths, row.minimumLicenseHoldingYears, {
          long: true,
        }),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'deposit',
      header: (
        <SortButton
          label={t('rentalRules.ui.matrix.deposit')}
          active={matrix.sortKey === 'depositAmountCents'}
          order={matrix.sortDir}
          onClick={() => matrix.toggleSort('depositAmountCents')}
        />
      ),
      cell: (row) => (
        <span className="tabular-nums">
          {formatDeposit(row.depositAmountCents, row.depositCurrency ?? 'EUR')}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'creditCard',
      header: t('rentalRules.ui.matrix.creditCard'),
      cell: (row) => formatBool(row.creditCardRequired),
      className: 'hidden xl:table-cell',
    },
    {
      key: 'foreignTravel',
      header: t('rentalRules.ui.matrix.foreignTravel'),
      cell: (row) => labelPolicy(row.foreignTravelPolicy),
      className: 'hidden xl:table-cell',
    },
    {
      key: 'additionalDriver',
      header: t('rentalRules.ui.matrix.additionalDriver'),
      cell: (row) => labelPolicy(row.additionalDriverPolicy),
      className: 'hidden 2xl:table-cell',
    },
    {
      key: 'status',
      header: (
        <SortButton
          label={t('rentalRules.ui.matrix.status')}
          active={matrix.sortKey === 'status'}
          order={matrix.sortDir}
          onClick={() => matrix.toggleSort('status')}
        />
      ),
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusChip tone={CATEGORY_STATUS_TONES[row.status]} dot>
            {labelCategoryStatus(row.status)}
          </StatusChip>
          {isCategoryRulesIncomplete(row) ? (
            <StatusChip tone="critical">{t('rentalRules.ui.matrix.incomplete')}</StatusChip>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">{t('rentalRules.ui.actions.openMenu')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(row)} disabled={!canEdit}>
              {t('rentalRules.ui.actions.edit')}
            </DropdownMenuItem>
            {canAssign ? (
              <DropdownMenuItem onClick={() => onAssign(row)}>
                {t('rentalRules.ui.actions.assign')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={() => onPreview(row)}>
              {t('rentalRules.ui.actions.preview')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-12',
    },
  ];

  return (
    <section className="space-y-3">
      <SectionHeader
        title={t('rentalRules.ui.sections.categories')}
        description={t('rentalRules.ui.matrix.description')}
      />

      <div className={fhs.filterBar}>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <label className="relative block">
            <span className="sr-only">{t('rentalRules.ui.matrix.search')}</span>
            <input
              value={matrix.search}
              onChange={(event) => {
                matrix.setSearch(event.target.value);
                matrix.setPage(1);
              }}
              placeholder={t('rentalRules.ui.matrix.searchPlaceholder')}
              className="w-full rounded-xl border border-border/60 bg-background/50 py-2 pl-3 pr-3 text-xs outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </label>
          <select
            value={matrix.status}
            onChange={(event) => {
              matrix.setStatus(event.target.value as typeof matrix.status);
              matrix.setPage(1);
            }}
            className="rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs outline-none focus:border-[color:var(--brand)]"
            aria-label={t('rentalRules.ui.matrix.statusFilter')}
          >
            <option value="ALL">{t('rentalRules.ui.matrix.statusAll')}</option>
            <option value="ACTIVE">{labelCategoryStatus('ACTIVE')}</option>
            <option value="DRAFT">{labelCategoryStatus('DRAFT')}</option>
            <option value="INACTIVE">{labelCategoryStatus('INACTIVE')}</option>
            <option value="ARCHIVED">{labelCategoryStatus('ARCHIVED')}</option>
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 text-xs">
            <input
              type="checkbox"
              checked={matrix.incompleteOnly}
              onChange={(event) => {
                matrix.setIncompleteOnly(event.target.checked);
                matrix.setPage(1);
              }}
            />
            {t('rentalRules.ui.matrix.incompleteOnly')}
          </label>
          {matrix.filtersActive ? (
            <Button type="button" variant="ghost" size="sm" onClick={matrix.clearFilters}>
              {t('rentalRules.ui.matrix.clearFilters')}
            </Button>
          ) : null}
        </div>
        <p className={cn(META_TEXT_CLASS, 'mt-2 tabular-nums')}>
          {t('rentalRules.ui.matrix.resultCount', { count: matrix.filteredCount })}
        </p>
      </div>

      {matrix.rows.length === 0 ? (
        <EmptyState
          compact
          title={t('rentalRules.ui.matrix.emptyTitle')}
          description={
            matrix.filtersActive
              ? t('rentalRules.ui.matrix.emptyFiltered')
              : t('rentalRules.ui.matrix.emptyDefault')
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              rows={matrix.rows}
              getRowKey={(row) => row.id}
              card
            />
          </div>
          <div className="space-y-2 md:hidden" role="list">
            {matrix.rows.map((category) => (
              <MatrixMobileCard
                key={category.id}
                category={category}
                canEdit={canEdit}
                canAssign={canAssign}
                onEdit={() => onEdit(category)}
                onAssign={() => onAssign(category)}
                onPreview={() => onPreview(category)}
              />
            ))}
          </div>

          {matrix.pageCount > 1 ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/30 px-3 py-2">
              <p className={META_TEXT_CLASS}>
                {t('rentalRules.ui.matrix.page', {
                  page: matrix.currentPage,
                  pageCount: matrix.pageCount,
                })}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={matrix.currentPage <= 1}
                  onClick={() => matrix.setPage(matrix.currentPage - 1)}
                  aria-label={t('rentalRules.ui.matrix.prevPage')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={matrix.currentPage >= matrix.pageCount}
                  onClick={() => matrix.setPage(matrix.currentPage + 1)}
                  aria-label={t('rentalRules.ui.matrix.nextPage')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
