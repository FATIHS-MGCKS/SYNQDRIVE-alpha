import { Download } from 'lucide-react';
import {
  DataCard,
  DataTable,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import type { LegalDocumentVersionRow } from '../../lib/legal-documents-overview';
import {
  formatLegalDocumentBytes,
  formatLegalDocumentDate,
  formatLegalDocumentStatus,
} from '../../lib/legal-documents-overview';

interface Props {
  orgId: string;
  rows: LegalDocumentVersionRow[];
  loading?: boolean;
}

function statusTone(status: string) {
  if (status === 'ACTIVE') return 'success' as const;
  if (status === 'DRAFT' || status === 'IN_REVIEW') return 'watch' as const;
  if (status === 'REVOKED' || status === 'ARCHIVED') return 'neutral' as const;
  return 'info' as const;
}

export function LegalDocumentVersionHistorySection({ orgId, rows, loading }: Props) {
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
        description="Alle hinterlegten Versionen mit Status, Gültigkeit und Verwendung"
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
          rowActions={(row) => (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Herunterladen"
              onClick={() => void api.legalDocuments.open(orgId, row.id)}
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        />
      </DataCard>
    </div>
  );
}
