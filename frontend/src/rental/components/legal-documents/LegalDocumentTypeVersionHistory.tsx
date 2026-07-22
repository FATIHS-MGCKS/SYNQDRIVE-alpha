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

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Alle Status' },
  { value: 'ACTIVE', label: 'Aktiv' },
  { value: 'DRAFT', label: 'Entwurf' },
  { value: 'IN_REVIEW', label: 'In Prüfung' },
  { value: 'APPROVED', label: 'Freigegeben' },
  { value: 'SCHEDULED', label: 'Geplant' },
  { value: 'SUPERSEDED', label: 'Ersetzt' },
  { value: 'REVOKED', label: 'Zurückgezogen' },
  { value: 'ARCHIVED', label: 'Archiviert' },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const currentUserId = getStoredUser()?.id ?? null;

  const copyChecksum = async () => {
    if (!row.checksum) return;
    try {
      await navigator.clipboard.writeText(row.checksum);
      toast.success('Prüfsumme kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  const actions =
    document != null
      ? getLifecycleActionsForDocument(document, documents, permissions, settings, currentUserId)
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
            <StatusChip tone={statusTone(row.status)}>{formatLegalDocumentStatus(row.status)}</StatusChip>
          </div>
          {row.variantLabel ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{row.variantLabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {document ? (
            <Button type="button" variant="ghost" size="icon" title="Details" onClick={() => onOpenDetail(document)}>
              <Eye className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Herunterladen"
            onClick={() => void api.legalDocuments.open(orgId, row.id)}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">Sprache</dt>
          <dd className="font-medium text-foreground">{row.language.toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Jurisdiktion</dt>
          <dd className="font-medium text-foreground">{row.jurisdiction ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gültigkeit</dt>
          <dd className="text-foreground">
            {formatLegalDocumentDate(row.validFrom)} – {formatLegalDocumentDate(row.validUntil)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Freigabe</dt>
          <dd className="text-foreground">{formatLegalDocumentDate(row.approvedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Aktivierung</dt>
          <dd className="text-foreground">{formatLegalDocumentDate(row.activatedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Verwendungen</dt>
          <dd className="tabular-nums text-foreground">{row.snapshotCount}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Prüfsumme</dt>
          <dd className="flex items-center gap-2 text-foreground">
            <span className="font-mono text-[10px]">{row.checksumShort ?? '—'}</span>
            {row.checksum ? (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void copyChecksum()}>
                <Copy className="h-3 w-3" />
              </button>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Scan</dt>
          <dd>{formatScanStatusLabel(row.scanStatus)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Integrität</dt>
          <dd>{formatIntegrityStatusLabel(row.integrityStatus)}</dd>
        </div>
      </dl>

      {actions.length > 0 && document ? (
        <div className="relative mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <MoreHorizontal className="h-4 w-4" />
            Aktionen
          </Button>
          {menuOpen ? (
            <div className="absolute inset-x-0 z-20 mt-1 rounded-lg border border-border bg-background p-1 shadow-lg">
              {actions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  disabled={item.disabled}
                  title={item.disabledReason}
                  className="block w-full rounded-md px-3 py-2 text-left text-[12px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setMenuOpen(false);
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
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const currentUserId = getStoredUser()?.id ?? null;

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
          label="Version"
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
      header: 'Sprache',
      cell: (row) => <span className="text-[12px]">{row.language.toUpperCase()}</span>,
    },
    {
      key: 'jurisdiction',
      header: 'Jurisdiktion',
      cell: (row) => <span className="text-[12px]">{row.jurisdiction ?? '—'}</span>,
    },
    {
      key: 'status',
      header: (
        <SortButton label="Status" active={sort === 'status'} order={order} onClick={() => applySort('status')} />
      ),
      cell: (row) => (
        <StatusChip tone={statusTone(row.status)}>{formatLegalDocumentStatus(row.status)}</StatusChip>
      ),
    },
    {
      key: 'validity',
      header: 'Gültigkeit',
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
          <div>{formatLegalDocumentDate(row.validFrom)}</div>
          <div>bis {formatLegalDocumentDate(row.validUntil)}</div>
        </div>
      ),
    },
    {
      key: 'approved',
      header: 'Freigabe',
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">{formatLegalDocumentDate(row.approvedAt)}</span>
      ),
    },
    {
      key: 'activated',
      header: (
        <SortButton
          label="Aktivierung"
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
      header: 'Prüfsumme',
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">{row.checksumShort ?? '—'}</span>
          {row.checksum ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Prüfsumme kopieren"
              onClick={async (event) => {
                event.stopPropagation();
                try {
                  await navigator.clipboard.writeText(row.checksum!);
                  toast.success('Prüfsumme kopiert');
                } catch {
                  toast.error('Kopieren fehlgeschlagen');
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
      header: 'Scan / Integrität',
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground">
          <div>{formatScanStatusLabel(row.scanStatus)}</div>
          <div>{formatIntegrityStatusLabel(row.integrityStatus)}</div>
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'Verwendungen',
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
        title={config.title}
        description={config.hint}
        as="label"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? 'Einklappen' : 'Ausklappen'}
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
              <Label className="text-[11px]">Sprache</Label>
              <Select value={filters.language || '__all'} onValueChange={(v) => applyFilters({ language: v === '__all' ? '' : v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Alle Sprachen</SelectItem>
                  {LEGAL_UPLOAD_LANGUAGES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Status</Label>
              <Select value={filters.status || '__all'} onValueChange={(v) => applyFilters({ status: v === '__all' ? '' : v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Jurisdiktion</Label>
              <Select
                value={filters.jurisdiction || '__all'}
                onValueChange={(v) => applyFilters({ jurisdiction: v === '__all' ? '' : v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Alle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Alle Jurisdiktionen</SelectItem>
                  {LEGAL_UPLOAD_JURISDICTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Erstellt ab</Label>
              <Input
                type="date"
                className="h-9"
                value={filters.from}
                onChange={(e) => applyFilters({ from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Erstellt bis</Label>
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
                  Filter zurücksetzen
                </Button>
              </div>
            ) : null}
          </div>

          {error ? (
            <EmptyState title="Versionen konnten nicht geladen werden" description={error} compact />
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
                      ? 'Keine Versionen für die gewählten Filter'
                      : 'Noch keine Versionen für diesen Rechtstexttyp'
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
                          )
                        : [];

                    return (
                      <div className="flex items-center gap-1">
                        {document ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Details"
                            onClick={() => onOpenDetail(document)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          title="Herunterladen"
                          onClick={() => void api.legalDocuments.open(orgId, row.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {actions.length > 0 && document ? (
                          <div className="relative">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              data-testid={`legal-version-actions-${row.id}`}
                              onClick={() => setOpenMenuId((prev) => (prev === row.id ? null : row.id))}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              Aktionen
                            </Button>
                            {openMenuId === row.id ? (
                              <div className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded-lg border border-border bg-background p-1 shadow-lg">
                                {actions.map((item) => (
                                  <button
                                    key={item.action}
                                    type="button"
                                    disabled={item.disabled}
                                    title={item.disabledReason}
                                    className="block w-full rounded-md px-3 py-2 text-left text-[12px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                    data-testid={`legal-lifecycle-action-${item.action}`}
                                    onClick={() => {
                                      setOpenMenuId(null);
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
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
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
                        ? 'Keine Versionen für die gewählten Filter'
                        : 'Noch keine Versionen für diesen Rechtstexttyp'
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
                    {meta.total} Version{meta.total === 1 ? '' : 'en'} · Seite {meta.page} von {meta.totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage(page - 1)}
                      aria-label="Vorherige Seite"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={page >= meta.totalPages || loading}
                      onClick={() => setPage(page + 1)}
                      aria-label="Nächste Seite"
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
