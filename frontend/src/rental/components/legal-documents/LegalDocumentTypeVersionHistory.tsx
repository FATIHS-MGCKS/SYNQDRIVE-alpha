import { ChevronLeft, ChevronRight, Copy, Download, Eye, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  DataCard,
  DataTable,
  EmptyState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { api, type LegalDocumentDto } from '../../../lib/api';
import { getStoredUser } from '../../../lib/auth';
import { useLanguage } from '../../i18n/LanguageContext';
import type { LegalDocumentTypeConfig } from '../../lib/legal-document-types';
import {
  LEGAL_UPLOAD_JURISDICTIONS,
  LEGAL_UPLOAD_LANGUAGES,
} from '../../lib/legal-document-upload-wizard.constants';
import type { LegalDocumentLifecycleDialogState } from '../../lib/legal-document-lifecycle.types';
import type {
  LegalDocumentLifecyclePermissions,
  LegalDocumentWorkflowSettings,
} from '../../lib/legal-document-lifecycle.types';
import { getLifecycleActionsForDocument } from '../../lib/legal-document-lifecycle.utils';
import type { LegalDocumentVersionHistoryItem } from '../../lib/legal-document-version-history.types';
import {
  formatLegalDocumentDate,
  formatLegalDocumentStatus,
} from '../../lib/legal-documents-overview';
import {
  formatIntegrityStatusLabel,
  formatScanStatusLabel,
} from '../../lib/legal-document-version-history.utils';
import { useLegalDocumentVersionHistory } from './useLegalDocumentVersionHistory';

interface Props {
  orgId: string;
  config: LegalDocumentTypeConfig;
  permissions: LegalDocumentLifecyclePermissions;
  settings: LegalDocumentWorkflowSettings;
  onOpenDetail: (document: LegalDocumentDto) => void;
  onOpenAction: (state: LegalDocumentLifecycleDialogState) => void;
  defaultExpanded?: boolean;
}

function statusTone(status: string) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'DRAFT' || status === 'IN_REVIEW') return 'watch' as const;
  if (status === 'REVOKED' || status === 'ARCHIVED') return 'neutral' as const;
  return 'info' as const;
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
      className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
      onClick={onClick}
    >
      {label}
      {active ? <span className="text-[10px] text-muted-foreground">{order === 'asc' ? '↑' : '↓'}</span> : null}
    </button>
  );
}

function VersionHistoryMobileCard({
  row,
  document,
  documents,
  orgId,
  permissions,
  settings,
  onOpenDetail,
  onOpenAction,
}: {
  row: LegalDocumentVersionHistoryItem;
  document: LegalDocumentDto | undefined;
  documents: LegalDocumentDto[];
  orgId: string;
  permissions: LegalDocumentLifecyclePermissions;
  settings: LegalDocumentWorkflowSettings;
  onOpenDetail: (document: LegalDocumentDto) => void;
  onOpenAction: (state: LegalDocumentLifecycleDialogState) => void;
}) {
  const { t } = useLanguage();
  const currentUserId = getStoredUser()?.id ?? null;

  const copyChecksum = async () => {
    if (!row.checksum) return;
    try {
      await navigator.clipboard.writeText(row.checksum);
      toast.success(t('legalDocuments.toast.checksumCopied'));
    } catch {
      toast.error(t('legalDocuments.toast.copyFailed'));
    }
  };

  const actions =
    document != null
      ? getLifecycleActionsForDocument(document, documents, permissions, settings, currentUserId, t)
      : [];

  return (
    <div
      className="rounded-xl border border-border/70 bg-card p-4"
      data-testid={`legal-version-mobile-card-${row.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">v{row.versionLabel}</span>
            <StatusChip tone={statusTone(row.status)}>{formatLegalDocumentStatus(row.status, t)}</StatusChip>
          </div>
          {row.variantLabel ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{row.variantLabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {document ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('legalDocuments.a11y.showDetail', { version: row.versionLabel })}
              onClick={() => onOpenDetail(document)}
            >
              <Eye className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('legalDocuments.a11y.downloadVersion', { version: row.versionLabel })}
            onClick={() => void api.legalDocuments.open(orgId, row.id)}
          >
            <Download className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.language')}</dt>
          <dd className="font-medium text-foreground">{row.language.toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.jurisdiction')}</dt>
          <dd className="font-medium text-foreground">{row.jurisdiction ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.validity')}</dt>
          <dd className="text-foreground">
            {formatLegalDocumentDate(row.validFrom)} – {formatLegalDocumentDate(row.validUntil)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.approved')}</dt>
          <dd className="text-foreground">{formatLegalDocumentDate(row.approvedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.activated')}</dt>
          <dd className="text-foreground">{formatLegalDocumentDate(row.activatedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.usage')}</dt>
          <dd className="tabular-nums text-foreground">{row.snapshotCount}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t('legalDocuments.history.column.checksum')}</dt>
          <dd className="flex items-center gap-2 text-foreground">
            <span className="font-mono text-[10px]">{row.checksumShort ?? '—'}</span>
            {row.checksum ? (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                title={t('legalDocuments.a11y.copyChecksum')}
                onClick={() => void copyChecksum()}
              >
                <Copy className="h-3 w-3" />
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.scan')}</dt>
          <dd>{formatScanStatusLabel(row.scanStatus, t)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.integrity')}</dt>
          <dd>{formatIntegrityStatusLabel(row.integrityStatus, t)}</dd>
        </div>
      </dl>

      {actions.length > 0 && document ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              aria-haspopup="menu"
              aria-label={t('legalDocuments.a11y.lifecycleActions', { version: row.versionLabel })}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
              {t('legalDocuments.history.actions')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-[min(100vw-2rem,16rem)]">
            {actions.map((item) => (
              <DropdownMenuItem
                key={item.action}
                disabled={item.disabled}
                title={item.disabledReason}
                onClick={() => {
                  if (item.disabled) return;
                  onOpenAction({
                    action: item.action,
                    document,
                    activePeer:
                      documents.find(
                        (d) =>
                          d.id !== document.id &&
                          d.documentType === document.documentType &&
                          d.language === document.language &&
                          d.status === 'ACTIVE',
                      ) ?? null,
                  });
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export function LegalDocumentTypeVersionHistory({
  orgId,
  config,
  permissions,
  settings,
  onOpenDetail,
  onOpenAction,
  defaultExpanded = true,
}: Props) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const currentUserId = getStoredUser()?.id ?? null;

  const statusFilterOptions = [
    { value: '', label: t('legalDocuments.history.filter.allStatuses') },
    { value: 'ACTIVE', label: t('legalDocuments.status.ACTIVE') },
    { value: 'DRAFT', label: t('legalDocuments.status.DRAFT') },
    { value: 'IN_REVIEW', label: t('legalDocuments.status.IN_REVIEW') },
    { value: 'APPROVED', label: t('legalDocuments.status.APPROVED') },
    { value: 'SCHEDULED', label: t('legalDocuments.status.SCHEDULED') },
    { value: 'SUPERSEDED', label: t('legalDocuments.status.SUPERSEDED') },
    { value: 'REVOKED', label: t('legalDocuments.status.REVOKED') },
    { value: 'ARCHIVED', label: t('legalDocuments.status.ARCHIVED') },
  ];

  const {
    items,
    documents,
    meta,
    loading,
    error,
    page,
    setPage,
    filters,
    applyFilters,
    sort,
    order,
    applySort,
    pageSize,
  } = useLegalDocumentVersionHistory(orgId, config.key);

  const documentById = new Map(documents.map((doc) => [doc.id, doc]));

  const columns: DataTableColumn<LegalDocumentVersionHistoryItem>[] = [
    {
      key: 'version',
      header: (
        <SortButton
          label={t('legalDocuments.history.column.version')}
          active={sort === 'versionLabel'}
          order={order}
          onClick={() => applySort('versionLabel')}
        />
      ),
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">v{row.versionLabel}</div>
          {row.variantLabel ? (
            <div className="truncate text-[11px] text-muted-foreground">{row.variantLabel}</div>
          ) : null}
        </div>
      ),
      className: 'min-w-[8rem]',
    },
    {
      key: 'language',
      header: t('legalDocuments.history.column.language'),
      cell: (row) => <span className="text-[12px]">{row.language.toUpperCase()}</span>,
    },
    {
      key: 'jurisdiction',
      header: t('legalDocuments.history.column.jurisdiction'),
      cell: (row) => <span className="text-[12px]">{row.jurisdiction ?? '—'}</span>,
    },
    {
      key: 'status',
      header: (
        <SortButton
          label={t('legalDocuments.history.column.status')}
          active={sort === 'status'}
          order={order}
          onClick={() => applySort('status')}
        />
      ),
      cell: (row) => (
        <StatusChip tone={statusTone(row.status)}>{formatLegalDocumentStatus(row.status, t)}</StatusChip>
      ),
    },
    {
      key: 'validity',
      header: t('legalDocuments.history.column.validity'),
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
          <div>{formatLegalDocumentDate(row.validFrom)}</div>
          <div>{t('legalDocuments.history.validUntil', { date: formatLegalDocumentDate(row.validUntil) })}</div>
        </div>
      ),
    },
    {
      key: 'approved',
      header: t('legalDocuments.history.column.approved'),
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">{formatLegalDocumentDate(row.approvedAt)}</span>
      ),
    },
    {
      key: 'activated',
      header: (
        <SortButton
          label={t('legalDocuments.history.column.activated')}
          active={sort === 'activatedAt'}
          order={order}
          onClick={() => applySort('activatedAt')}
        />
      ),
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">{formatLegalDocumentDate(row.activatedAt)}</span>
      ),
    },
    {
      key: 'checksum',
      header: t('legalDocuments.history.column.checksum'),
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">{row.checksumShort ?? '—'}</span>
          {row.checksum ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title={t('legalDocuments.a11y.copyChecksum')}
              onClick={async (event) => {
                event.stopPropagation();
                try {
                  await navigator.clipboard.writeText(row.checksum!);
                  toast.success(t('legalDocuments.toast.checksumCopied'));
                } catch {
                  toast.error(t('legalDocuments.toast.copyFailed'));
                }
              }}
            >
              <Copy className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ),
    },
    {
      key: 'health',
      header: t('legalDocuments.history.column.scanIntegrity'),
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground">
          <div>{formatScanStatusLabel(row.scanStatus, t)}</div>
          <div>{formatIntegrityStatusLabel(row.integrityStatus, t)}</div>
        </div>
      ),
    },
    {
      key: 'usage',
      header: t('legalDocuments.history.column.usage'),
      cell: (row) => <span className="tabular-nums text-[12px]">{row.snapshotCount}</span>,
      numeric: true,
    },
  ];

  const resetFilters = () => {
    applyFilters({ language: '', status: '', jurisdiction: '', from: '', to: '' });
  };

  const hasActiveFilters = Boolean(
    filters.language || filters.status || filters.jurisdiction || filters.from || filters.to,
  );

  return (
    <section
      className="space-y-3"
      data-testid={`legal-version-history-${config.key}`}
      id={`legal-version-history-${config.key}`}
    >
      <SectionHeader
        title={t(config.titleKey)}
        description={t(config.hintKey)}
        as="label"
        actions={
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? t('legalDocuments.history.collapse') : t('legalDocuments.history.expand')}
          </Button>
        }
      />

      {expanded ? (
        <>
          <div
            className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-5"
            data-testid={`legal-version-filters-${config.key}`}
          >
            <div className="space-y-1">
              <Label className="text-[11px]">{t('legalDocuments.history.filter.language')}</Label>
              <Select value={filters.language || '__all'} onValueChange={(v) => applyFilters({ language: v === '__all' ? '' : v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('legalDocuments.history.filter.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{t('legalDocuments.history.filter.allLanguages')}</SelectItem>
                  {LEGAL_UPLOAD_LANGUAGES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t('legalDocuments.history.filter.status')}</Label>
              <Select value={filters.status || '__all'} onValueChange={(v) => applyFilters({ status: v === '__all' ? '' : v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('legalDocuments.history.filter.all')} />
                </SelectTrigger>
                <SelectContent>
                  {statusFilterOptions.map((opt) => (
                    <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t('legalDocuments.history.filter.jurisdiction')}</Label>
              <Select
                value={filters.jurisdiction || '__all'}
                onValueChange={(v) => applyFilters({ jurisdiction: v === '__all' ? '' : v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('legalDocuments.history.filter.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">{t('legalDocuments.history.filter.allJurisdictions')}</SelectItem>
                  {LEGAL_UPLOAD_JURISDICTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t('legalDocuments.history.filter.from')}</Label>
              <Input
                type="date"
                className="h-9"
                value={filters.from}
                onChange={(e) => applyFilters({ from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t('legalDocuments.history.filter.to')}</Label>
              <Input
                type="date"
                className="h-9"
                value={filters.to}
                onChange={(e) => applyFilters({ to: e.target.value })}
              />
            </div>
            {hasActiveFilters ? (
              <div className="flex items-end sm:col-span-2 lg:col-span-5">
                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                  {t('legalDocuments.history.filter.reset')}
                </Button>
              </div>
            ) : null}
          </div>

          {error ? (
            <EmptyState title={t('legalDocuments.history.loadError')} description={error} compact />
          ) : (
            <DataCard flush>
              <div className="hidden md:block">
                <DataTable
                  columns={columns}
                  rows={items}
                  loading={loading}
                  dense
                  card={false}
                  empty={
                    hasActiveFilters
                      ? t('legalDocuments.history.emptyFiltered')
                      : t('legalDocuments.history.empty')
                  }
                  getRowKey={(row) => row.id}
                  onRowClick={(row) => {
                    const doc = documentById.get(row.id);
                    if (doc) onOpenDetail(doc);
                  }}
                  rowActions={(row) => {
                    const document = documentById.get(row.id);
                    const actions =
                      document != null
                        ? getLifecycleActionsForDocument(
                            document,
                            documents,
                            permissions,
                            settings,
                            currentUserId,
                            t,
                          )
                        : [];

                    return (
                      <div className="flex items-center gap-1">
                        {document ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('legalDocuments.a11y.showDetail', { version: row.versionLabel })}
                            onClick={() => onOpenDetail(document)}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t('legalDocuments.a11y.downloadVersion', { version: row.versionLabel })}
                          onClick={() => void api.legalDocuments.open(orgId, row.id)}
                        >
                          <Download className="h-4 w-4" aria-hidden />
                        </Button>
                        {actions.length > 0 && document ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                data-testid={`legal-version-actions-${row.id}`}
                                aria-haspopup="menu"
                                aria-label={t('legalDocuments.a11y.lifecycleActions', { version: row.versionLabel })}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                                {t('legalDocuments.history.actions')}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[12rem]">
                              {actions.map((item) => (
                                <DropdownMenuItem
                                  key={item.action}
                                  disabled={item.disabled}
                                  title={item.disabledReason}
                                  data-testid={`legal-lifecycle-action-${item.action}`}
                                  onClick={() => {
                                    if (item.disabled) return;
                                    onOpenAction({
                                      action: item.action,
                                      document,
                                      activePeer:
                                        documents.find(
                                          (d) =>
                                            d.id !== document.id &&
                                            d.documentType === document.documentType &&
                                            d.language === document.language &&
                                            d.status === 'ACTIVE',
                                        ) ?? null,
                                    });
                                  }}
                                >
                                  {item.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    );
                  }}
                />
              </div>

              <div className="space-y-2.5 p-3 md:hidden" data-testid={`legal-version-mobile-list-${config.key}`}>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/50" />
                  ))
                ) : items.length === 0 ? (
                  <EmptyState
                    title={
                      hasActiveFilters
                        ? t('legalDocuments.history.emptyFiltered')
                        : t('legalDocuments.history.empty')
                    }
                    compact
                  />
                ) : (
                  items.map((row) => (
                    <VersionHistoryMobileCard
                      key={row.id}
                      row={row}
                      document={documentById.get(row.id)}
                      documents={documents}
                      orgId={orgId}
                      permissions={permissions}
                      settings={settings}
                      onOpenDetail={onOpenDetail}
                      onOpenAction={onOpenAction}
                    />
                  ))
                )}
              </div>

              {meta.total > 0 ? (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-[12px] text-muted-foreground"
                  data-testid={`legal-version-pagination-${config.key}`}
                >
                  <span>
                    {meta.total === 1
                      ? t('legalDocuments.history.paginationSingle', {
                          total: meta.total,
                          page: meta.page,
                          totalPages: meta.totalPages,
                        })
                      : t('legalDocuments.history.pagination', {
                          total: meta.total,
                          page: meta.page,
                          totalPages: meta.totalPages,
                        })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage(page - 1)}
                      aria-label={t('legalDocuments.history.prevPage')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={page >= meta.totalPages || loading}
                      onClick={() => setPage(page + 1)}
                      aria-label={t('legalDocuments.history.nextPage')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </DataCard>
          )}
        </>
      ) : null}
    </section>
  );
}
