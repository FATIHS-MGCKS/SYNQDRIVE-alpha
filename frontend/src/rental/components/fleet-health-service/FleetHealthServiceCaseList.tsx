import { useMemo, useState, type ReactNode } from 'react';
import type { ApiServiceCase, Vendor } from '../../../lib/api';
import { DataTable, EmptyState, ErrorState, StatusChip } from '../../../components/patterns';
import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import { useFleetVehicles } from '../../FleetContext';
import { fhs } from './fleet-health-service-shell';
import {
  buildFleetHealthServiceCaseListRows,
  countServiceCasesForFilter,
  FLEET_HEALTH_SERVICE_CASE_FILTER_LABELS,
  FLEET_HEALTH_SERVICE_CASE_FILTER_ORDER,
  type FleetHealthServiceCaseFilter,
  type FleetHealthServiceCaseListRow,
} from './fleet-health-service-case-list';

interface FleetHealthServiceCaseListProps {
  serviceCases: ApiServiceCase[];
  vendors: Vendor[];
  dataReady: boolean;
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
}

function CaseFilterBar({
  activeFilter,
  onFilterChange,
  serviceCases,
}: {
  activeFilter: FleetHealthServiceCaseFilter;
  onFilterChange: (filter: FleetHealthServiceCaseFilter) => void;
  serviceCases: ApiServiceCase[];
}) {
  return (
    <div className={chromeTabBarClass('p-1')} role="tablist" aria-label="Servicefall-Filter">
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {FLEET_HEALTH_SERVICE_CASE_FILTER_ORDER.map((filter) => {
          const isActive = activeFilter === filter;
          const count = countServiceCasesForFilter(serviceCases, filter);
          return (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onFilterChange(filter)}
              className={chromeTabTriggerClass(isActive, 'min-w-[7rem]')}
            >
              <span className="truncate">{FLEET_HEALTH_SERVICE_CASE_FILTER_LABELS[filter]}</span>
              <span className="ml-1 text-[10px] tabular-nums text-muted-foreground">({count})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CaseMobileCard({ row }: { row: FleetHealthServiceCaseListRow }) {
  return (
    <div
      className={`${fhs.interactiveRow} flex-col items-stretch gap-2`}
      data-testid={`fhs-case-card-${row.serviceCase.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-foreground">{row.licensePlate}</p>
          <p className={fhs.meta}>{row.vehicleName}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <StatusChip tone="neutral">{row.statusLabel}</StatusChip>
          {row.blocksRental ? <StatusChip tone="critical">Mietblockade</StatusChip> : null}
        </div>
      </div>

      <div>
        <p className={fhs.rowTitle}>{row.titleLine}</p>
        <p className={fhs.rowBody}>{row.categoryLabel}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">Priorität</dt>
          <dd className="font-medium text-foreground">{row.priorityLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Partner</dt>
          <dd className="font-medium text-foreground">{row.vendorName ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Werkstatttermin</dt>
          <dd className="font-medium text-foreground">{row.scheduledAtLabel ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Erw. Fertigstellung</dt>
          <dd className="font-medium text-foreground">{row.expectedReadyAtLabel ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Offene Tasks</dt>
          <dd className="font-medium tabular-nums text-foreground">{row.openTasksCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kostenstatus</dt>
          <dd className="font-medium text-foreground">
            {row.costStatusLabel}
            {row.costStatusDetail ? (
              <span className="block text-[10px] font-normal text-muted-foreground">
                {row.costStatusDetail}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <p className={fhs.meta}>Aktualisiert {row.updatedAtLabel}</p>
    </div>
  );
}

export function FleetHealthServiceCaseList({
  serviceCases,
  vendors,
  dataReady,
  loading,
  error,
  onReload,
}: FleetHealthServiceCaseListProps) {
  const { fleetVehicles } = useFleetVehicles();
  const [activeFilter, setActiveFilter] = useState<FleetHealthServiceCaseFilter>('open');

  const vehicleById = useMemo(
    () => new Map(fleetVehicles.map((vehicle) => [vehicle.id, vehicle])),
    [fleetVehicles],
  );
  const vendorById = useMemo(
    () => new Map(vendors.map((vendor) => [vendor.id, vendor])),
    [vendors],
  );

  const rows = useMemo(
    () =>
      buildFleetHealthServiceCaseListRows({
        serviceCases,
        vehicleById,
        vendorById,
        filter: activeFilter,
      }),
    [serviceCases, vehicleById, vendorById, activeFilter],
  );

  const columns = useMemo(
    () =>
      [
        {
          key: 'vehicle',
          header: 'Fahrzeug',
          cell: (row: FleetHealthServiceCaseListRow) => (
            <div className="min-w-[8.5rem]">
              <p className="font-semibold text-foreground">{row.licensePlate}</p>
              <p className="text-[11px] text-muted-foreground">{row.vehicleName}</p>
            </div>
          ),
        },
        {
          key: 'title',
          header: 'Titel / Kategorie',
          cell: (row: FleetHealthServiceCaseListRow) => (
            <div className="min-w-[10rem]">
              <p className="font-medium text-foreground">{row.titleLine}</p>
              <p className="text-[11px] text-muted-foreground">{row.categoryLabel}</p>
            </div>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (row: FleetHealthServiceCaseListRow) => (
            <StatusChip tone="neutral">{row.statusLabel}</StatusChip>
          ),
        },
        {
          key: 'priority',
          header: 'Priorität',
          cell: (row: FleetHealthServiceCaseListRow) => row.priorityLabel,
        },
        {
          key: 'vendor',
          header: 'Partner',
          cell: (row: FleetHealthServiceCaseListRow) => row.vendorName ?? '—',
        },
        {
          key: 'scheduled',
          header: 'Werkstatttermin',
          cell: (row: FleetHealthServiceCaseListRow) => row.scheduledAtLabel ?? '—',
        },
        {
          key: 'expected',
          header: 'Erw. Fertigstellung',
          cell: (row: FleetHealthServiceCaseListRow) => row.expectedReadyAtLabel ?? '—',
        },
        {
          key: 'tasks',
          header: 'Offene Tasks',
          align: 'right' as const,
          numeric: true,
          cell: (row: FleetHealthServiceCaseListRow) => row.openTasksCount,
        },
        {
          key: 'cost',
          header: 'Kostenstatus',
          cell: (row: FleetHealthServiceCaseListRow) => (
            <div className="min-w-[7rem]">
              <p className="font-medium text-foreground">{row.costStatusLabel}</p>
              {row.costStatusDetail ? (
                <p className="text-[10px] text-muted-foreground">{row.costStatusDetail}</p>
              ) : null}
            </div>
          ),
        },
        {
          key: 'rental',
          header: 'Mietblockade',
          cell: (row: FleetHealthServiceCaseListRow) =>
            row.blocksRental ? (
              <StatusChip tone="critical">Ja</StatusChip>
            ) : (
              <span className="text-muted-foreground">Nein</span>
            ),
        },
        {
          key: 'updated',
          header: 'Letzte Aktualisierung',
          cell: (row: FleetHealthServiceCaseListRow) => row.updatedAtLabel,
        },
      ] satisfies Array<{
        key: string;
        header: string;
        cell: (row: FleetHealthServiceCaseListRow) => ReactNode;
        align?: 'left' | 'right' | 'center';
        numeric?: boolean;
      }>,
    [],
  );

  if (error && !loading) {
    return (
      <ErrorState
        compact
        title="Servicefälle konnten nicht geladen werden."
        description={error}
        onRetry={onReload}
        retryLabel="Erneut laden"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className={fhs.filterBar}>
        <CaseFilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          serviceCases={serviceCases}
        />
      </div>

      <div className="hidden md:block">
        <DataTable
          dense
          loading={loading && rows.length === 0}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.serviceCase.id}
          getRowClassName={(row) =>
            row.blocksRental ? 'bg-[color:var(--status-critical)]/[0.03]' : undefined
          }
          empty={
            <EmptyState
              compact
              title={
                dataReady
                  ? 'Keine Servicefälle in diesem Filter'
                  : 'Servicefälle noch nicht geladen'
              }
              description={
                dataReady
                  ? 'Passen Sie den Filter an oder legen Sie einen neuen Servicefall an.'
                  : 'Die Servicefall-Liste wird geladen, sobald die Quelle bereit ist.'
              }
            />
          }
        />
      </div>

      <div className="space-y-2 md:hidden">
        {loading && rows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground animate-pulse p-4">
            Servicefälle werden geladen…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title={
              dataReady ? 'Keine Servicefälle in diesem Filter' : 'Servicefälle noch nicht geladen'
            }
            description={
              dataReady
                ? 'Passen Sie den Filter an oder legen Sie einen neuen Servicefall an.'
                : 'Die Servicefall-Liste wird geladen, sobald die Quelle bereit ist.'
            }
          />
        ) : (
          rows.map((row) => <CaseMobileCard key={row.serviceCase.id} row={row} />)
        )}
      </div>
    </div>
  );
}
