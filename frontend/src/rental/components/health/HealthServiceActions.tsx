import { ClipboardList, ExternalLink, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, type ApiTask, type ComplianceTaskSignal, type RentalHealthModule, type Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { ComplianceTaskActions } from '../ComplianceTaskActions';
import { ServiceTaskCreateModal } from '../service-center/ServiceTaskCreateModal';
import {
  buildModuleFindingTaskCoverage,
  complianceSignalsForModule,
  formatHealthFindingLabel,
  healthModuleNeedsAction,
  type HealthActionModule,
  type HealthFindingTaskState,
  type HealthTaskPrefill,
} from '../../lib/health-task-bridge.utils';

export interface HealthServiceActionsProps {
  vehicleId: string;
  healthModule: HealthActionModule;
  rentalModule?: RentalHealthModule | null;
  contextLines?: string[];
  dtcCodes?: string[];
  dueDate?: string | null;
  complianceSignals?: ComplianceTaskSignal[] | null;
  blocksRental?: boolean;
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
  onNavigateToHealth?: () => void;
  compact?: boolean;
  className?: string;
}

function relatedHintTask(state: HealthFindingTaskState) {
  if (state.duplicate.matchKind === 'legacy') return state.duplicate.task;
  return state.duplicate.possiblyRelatedTask;
}

export function HealthServiceActions({
  vehicleId,
  healthModule,
  rentalModule,
  contextLines,
  dtcCodes,
  dueDate,
  complianceSignals,
  blocksRental,
  onOpenServiceCenter,
  onOpenExistingTask,
  compact = false,
  className = '',
}: HealthServiceActionsProps) {
  const { orgId } = useRentalOrg();
  const [openTasks, setOpenTasks] = useState<ApiTask[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState<HealthTaskPrefill | null>(null);

  useEffect(() => {
    if (!orgId || !vehicleId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.tasks.forVehicle(orgId, vehicleId).catch(() => []),
      api.vendors.list(orgId).catch(() => []),
    ])
      .then(([tasks, vendorList]) => {
        if (cancelled) return;
        setOpenTasks(Array.isArray(tasks) ? tasks : []);
        setVendors(Array.isArray(vendorList) ? vendorList : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId]);

  const coverage = useMemo(
    () =>
      buildModuleFindingTaskCoverage({
        module: healthModule,
        organizationId: orgId ?? '',
        vehicleId,
        rentalModule,
        openTasks,
        contextLines,
        dtcCodes,
        dueDate,
        vendors,
        blocksRental,
      }),
    [
      healthModule,
      orgId,
      vehicleId,
      rentalModule,
      openTasks,
      contextLines,
      dtcCodes,
      dueDate,
      vendors,
      blocksRental,
    ],
  );

  const complianceForModule = useMemo(() => {
    if (healthModule === 'service_compliance') {
      return complianceSignalsForModule(complianceSignals, ['tuv', 'bokraft', 'service', 'inspection']);
    }
    return [];
  }, [complianceSignals, healthModule]);

  const hasFindingRows = coverage.findingStates.length > 0;
  const showActions =
    healthModuleNeedsAction(rentalModule) ||
    hasFindingRows ||
    complianceForModule.length > 0;
  if (!showActions && !loading) return null;

  const openCreate = (nextPrefill: HealthTaskPrefill) => {
    setPrefill(nextPrefill);
    setCreateOpen(true);
  };

  const btnClass =
    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors';

  const multiFinding = coverage.findings.length > 1;

  return (
    <div className={`space-y-2 ${className}`}>
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Service-Aktionen
          </p>
          {coverage.findingCount > 1 && (
            <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
              {coverage.linkedFindingCount}/{coverage.findingCount} mit Aufgabe
            </span>
          )}
        </div>
      )}

      {multiFinding && (
        <p className="text-[10px] text-muted-foreground">
          {coverage.findingCount} parallele Findings — jeweils eigene Aufgabe möglich.
        </p>
      )}

      {coverage.findingStates.map((state) => {
        const key =
          state.finding?.source_finding_id ??
          state.prefill.metadata.sourceFindingId ??
          'legacy-module';
        const exactDuplicate =
          state.duplicate.matchKind === 'exact' ? state.duplicate.task : null;
        const hintTask = !exactDuplicate ? relatedHintTask(state) : null;
        const label = formatHealthFindingLabel(
          state.finding,
          rentalModule?.reason ?? undefined,
        );

        return (
          <div
            key={key}
            className="rounded-xl border border-border/50 bg-muted/10 px-3 py-2 space-y-2"
          >
            {multiFinding && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-foreground truncate">{label}</p>
                <StatusChip
                  tone={state.finding?.severity === 'critical' ? 'critical' : 'watch'}
                >
                  {state.finding?.finding_code ?? 'Legacy'}
                </StatusChip>
              </div>
            )}

            {exactDuplicate && (
              <div className="rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch-soft)] px-2.5 py-2 space-y-2">
                <p className="text-[11px] text-foreground">
                  Offene Aufgabe: <span className="font-semibold">{exactDuplicate.title}</span>
                </p>
                {onOpenExistingTask && (
                  <button
                    type="button"
                    onClick={() => onOpenExistingTask(exactDuplicate.id)}
                    className={`${btnClass} border-[color:var(--brand)]/25 surface-premium hover:bg-muted/40`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Aufgabe öffnen
                  </button>
                )}
              </div>
            )}

            {hintTask && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Möglicherweise zugehörig
                  {state.duplicate.matchKind === 'legacy' ? ' (Legacy)' : ''}:{' '}
                  <span className="font-semibold text-foreground">{hintTask.title}</span>
                </p>
                {onOpenExistingTask && (
                  <button
                    type="button"
                    onClick={() => onOpenExistingTask(hintTask.id)}
                    className={`${btnClass} border-border/60 hover:bg-muted/40`}
                  >
                    <ExternalLink className="w-3 h-3" />
                    Aufgabe öffnen
                  </button>
                )}
              </div>
            )}

            {state.canCreate && healthModuleNeedsAction(rentalModule) && (
              <button
                type="button"
                onClick={() => openCreate(state.prefill)}
                className={`${btnClass} border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]`}
              >
                <ClipboardList className="w-3 h-3" />
                {multiFinding ? 'Aufgabe für dieses Finding' : 'Service-Aufgabe anlegen'}
              </button>
            )}
          </div>
        );
      })}

      {complianceForModule.length > 0 && (
        <ComplianceTaskActions vehicleId={vehicleId} signals={complianceForModule} compact={compact} />
      )}

      {healthModuleNeedsAction(rentalModule) && (
        <div className="flex flex-wrap gap-1.5">
          {onOpenServiceCenter && (
            <button
              type="button"
              onClick={onOpenServiceCenter}
              className={`${btnClass} border-border/60 hover:bg-muted/40`}
            >
              <Wrench className="w-3 h-3" />
              Service Center
            </button>
          )}
          {rentalModule?.state && !multiFinding && (
            <StatusChip tone={rentalModule.state === 'critical' ? 'critical' : 'watch'}>
              Health: {rentalModule.state}
            </StatusChip>
          )}
        </div>
      )}

      <ServiceTaskCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        vendors={vendors}
        defaultVehicleId={vehicleId}
        defaultVendorId={prefill?.vendorId ?? null}
        healthPrefill={prefill}
        onCreated={() => {
          if (!orgId) return;
          api.tasks.forVehicle(orgId, vehicleId).then((rows) => {
            setOpenTasks(Array.isArray(rows) ? rows : []);
          }).catch(() => undefined);
        }}
      />
    </div>
  );
}
