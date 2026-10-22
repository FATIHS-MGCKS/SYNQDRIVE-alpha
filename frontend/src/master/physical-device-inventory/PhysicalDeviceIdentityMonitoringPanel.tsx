import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import { DataTable, EmptyState, MetricCard, SectionHeader } from '../../components/patterns';
import { MasterErrorState, MasterLoadingState } from '../shell/MasterPageStates';
import { Button } from '../../components/ui/button';
import type {
  PdiIdentityDriftReasonCode,
  PdiIdentityMonitoringDeviceRowDto,
  PdiIdentityMonitoringSnapshotDto,
} from '../../lib/physical-device-inventory.types';
import { cn } from '../../components/ui/utils';

function statusTone(status: PdiIdentityDriftReasonCode): string {
  switch (status) {
    case 'MATCH':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'IDENTITY_UNCONFIRMED':
      return 'text-amber-800 dark:text-amber-200';
    case 'SWAP_SUSPECTED':
    case 'UNKNOWN_DEVICE':
    case 'ASSIGNMENT_MISMATCH':
      return 'text-red-700 dark:text-red-300';
    default:
      return 'text-muted-foreground';
  }
}

function formatTs(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale);
  } catch {
    return iso;
  }
}

export function PhysicalDeviceIdentityMonitoringPanel() {
  const { t, locale } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [snapshot, setSnapshot] = useState<PdiIdentityMonitoringSnapshotDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.admin.physicalDeviceInventory.identityMonitoringLiveSnapshot();
      setSnapshot(data);
    } catch {
      setError(true);
      toast.error(t('master.physicalDeviceInventory.monitoring.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(
    () => [
      {
        key: 'vehicle',
        header: t('master.physicalDeviceInventory.monitoring.col.vehicle'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) => row.vehicleLabel,
      },
      {
        key: 'plate',
        header: t('master.physicalDeviceInventory.monitoring.col.plate'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) => row.licensePlate ?? '—',
      },
      {
        key: 'token',
        header: t('master.physicalDeviceInventory.monitoring.col.token'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) => row.dimoTokenId ?? '—',
      },
      {
        key: 'expected',
        header: t('master.physicalDeviceInventory.monitoring.col.expected'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) => row.expectedSerialMasked,
      },
      {
        key: 'observed',
        header: t('master.physicalDeviceInventory.monitoring.col.observed'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) => row.observedSerialMasked ?? '—',
      },
      {
        key: 'mirror',
        header: t('master.physicalDeviceInventory.monitoring.col.mirrorSync'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) =>
          formatTs(row.mirrorSyncedAt, locale),
      },
      {
        key: 'status',
        header: t('master.physicalDeviceInventory.monitoring.col.status'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) => (
          <span className={cn('font-medium', statusTone(row.identityStatus))}>
            {t(`master.physicalDeviceInventory.monitoring.status.${row.identityStatus}`)}
          </span>
        ),
      },
      {
        key: 'details',
        header: t('master.physicalDeviceInventory.monitoring.col.details'),
        cell: (row: PdiIdentityMonitoringDeviceRowDto) =>
          row.detailCodes.length > 0 ? row.detailCodes.join(', ') : '—',
      },
    ],
    [t, locale],
  );

  if (loading && !snapshot) {
    return <MasterLoadingState variant="table" />;
  }

  if (error && !snapshot) {
    return (
      <MasterErrorState
        title={t('master.physicalDeviceInventory.monitoring.loadError')}
        onRetry={() => void load()}
      />
    );
  }

  if (!snapshot) {
    return <EmptyState title={t('master.physicalDeviceInventory.monitoring.empty')} />;
  }

  const staleRows = snapshot.devices.filter((d) => d.evidenceStale);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-3xl">
          {t('master.physicalDeviceInventory.monitoring.description')}
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {t('master.physicalDeviceInventory.refresh')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label={t('master.physicalDeviceInventory.monitoring.metric.registered')}
          value={snapshot.inventoryRegisteredCount}
        />
        <MetricCard
          label={t('master.physicalDeviceInventory.monitoring.metric.installed')}
          value={snapshot.inventoryInstalledCount}
        />
        <MetricCard
          label={t('master.physicalDeviceInventory.monitoring.metric.match')}
          value={snapshot.summary.matchCount}
        />
        <MetricCard
          label={t('master.physicalDeviceInventory.monitoring.metric.drift')}
          value={snapshot.summary.driftCount}
        />
        <MetricCard
          label={t('master.physicalDeviceInventory.monitoring.metric.unconfirmed')}
          value={snapshot.summary.unconfirmedCount}
        />
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span>
          {t('master.physicalDeviceInventory.monitoring.lastDimoSync')}:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatTs(snapshot.lastSuccessfulDimoVehicleSyncAt, locale)}
          </span>
        </span>
        <span>
          {t('master.physicalDeviceInventory.monitoring.evaluatedAt')}:{' '}
          <span className="font-medium text-foreground tabular-nums">
            {formatTs(snapshot.evaluatedAt, locale)}
          </span>
        </span>
        <span className="text-xs">{snapshot.note}</span>
      </div>

      {staleRows.length > 0 ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100"
          role="status"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t('master.physicalDeviceInventory.monitoring.staleWarning')}</span>
        </div>
      ) : null}

      <SectionHeader title={t('master.physicalDeviceInventory.monitoring.tableTitle')} />

      {snapshot.devices.length === 0 ? (
        <EmptyState title={t('master.physicalDeviceInventory.monitoring.empty')} />
      ) : (
        <DataTable
          columns={columns}
          rows={snapshot.devices}
          getRowKey={(row) => row.physicalDeviceId}
        />
      )}
    </div>
  );
}
