import { Download, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import {
  DataCard,
  DataTable,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api, type LegalDocumentDto } from '../../../lib/api';
import type { LegalDocumentVersionRow } from '../../lib/legal-documents-overview';
import {
  formatLegalDocumentBytes,
  formatLegalDocumentDate,
  formatLegalDocumentStatus,
} from '../../lib/legal-documents-overview';
import type { LegalDocumentLifecycleDialogState } from '../../lib/legal-document-lifecycle.types';
import type { LegalDocumentLifecyclePermissions, LegalDocumentWorkflowSettings } from '../../lib/legal-document-lifecycle.types';
import { getLifecycleActionsForDocument } from '../../lib/legal-document-lifecycle.utils';
import { getStoredUser } from '../../../lib/auth';

interface Props {
  orgId: string;
  rows: LegalDocumentVersionRow[];
  documents: LegalDocumentDto[];
  loading?: boolean;
  permissions: LegalDocumentLifecyclePermissions;
  settings: LegalDocumentWorkflowSettings;
  onOpenAction: (state: LegalDocumentLifecycleDialogState) => void;
}

function statusTone(status: string) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'DRAFT' || status === 'IN_REVIEW') return 'watch' as const;
  if (status === 'REVOKED' || status === 'ARCHIVED') return 'neutral' as const;
  return 'info' as const;
}

export function LegalDocumentVersionHistorySection({
  orgId,
  rows,
  documents,
  loading,
  permissions,
  settings,
  onOpenAction,
}: Props) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const currentUserId = getStoredUser()?.id ?? null;

  const columns: DataTableColumn<LegalDocumentVersionRow>[] = [
    {
      key: 'category',
      header: 'Kategorie',
      cell: (row) => <span className="font-medium text-foreground">{row.categoryTitle}</span>,
      className: 'min-w-[10rem]',
    },
    {
      key: 'version',
      header: 'Version',
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-foreground">v{row.versionLabel}</div>
          <div className="truncate text-[11px] text-muted-foreground">{row.fileName}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusChip tone={statusTone(row.status)}>{formatLegalDocumentStatus(row.status)}</StatusChip>
      ),
    },
    {
      key: 'scope',
      header: 'Sprache',
      cell: (row) => (
        <span className="text-[12px] text-foreground">
          {row.language.toUpperCase()}
          {row.jurisdiction ? ` · ${row.jurisdiction}` : ''}
        </span>
      ),
    },
    {
      key: 'health',
      header: 'Scan / Integrität',
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground">
          <div>{row.scanStatus ?? '—'}</div>
          <div>{row.integrityStatus ?? '—'}</div>
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'Verwendung',
      cell: (row) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {row.snapshotCount > 0 ? `${row.snapshotCount} Snapshots` : '—'}
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Zeitraum',
      cell: (row) => (
        <div className="text-[11px] text-muted-foreground">
          <div>Aktiv: {formatLegalDocumentDate(row.activatedAt)}</div>
          <div>Erstellt: {formatLegalDocumentDate(row.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'size',
      header: 'Größe',
      cell: (row) => (
        <span className="text-[12px] text-muted-foreground">{formatLegalDocumentBytes(row.fileSize)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Versionshistorie"
        description="Alle Versionen mit Status, Gültigkeit und Lifecycle-Aktionen"
        as="label"
      />
      <DataCard flush>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          dense
          card={false}
          empty="Noch keine Versionen hinterlegt"
          getRowKey={(row) => row.id}
          rowActions={(row) => {
            const document = documents.find((d) => d.id === row.id);
            if (!document) {
              return (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Herunterladen"
                  onClick={() => void api.legalDocuments.open(orgId, row.id)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              );
            }

            const actions = getLifecycleActionsForDocument(
              document,
              documents,
              permissions,
              settings,
              currentUserId,
            );

            return (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Herunterladen"
                  onClick={() => void api.legalDocuments.open(orgId, row.id)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {actions.length > 0 ? (
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
                            className="block w-full rounded-md px-3 py-2 text-left text-[12px] text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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
      </DataCard>
    </div>
  );
}
