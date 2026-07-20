import { ClipboardList, ExternalLink, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, type ApiTask, type ComplianceTaskSignal, type RentalHealthModule, type Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { ComplianceTaskActions } from '../ComplianceTaskActions';
import { ServiceTaskCreateModal } from '../service-center/ServiceTaskCreateModal';
import {
  buildHealthTaskPrefill,
  complianceSignalsForModule,
  findDuplicateHealthTask,
  healthModuleNeedsAction,
  type HealthActionModule,
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

  const prefillBase = useMemo(
    () =>
      buildHealthTaskPrefill({
        module: healthModule,
        organizationId: orgId ?? '',
        vehicleId,
        rentalModule,
        contextLines,
        dtcCodes,
        dueDate,
        vendors,
        blocksRental,
      }),
    [healthModule, orgId, vehicleId, rentalModule, contextLines, dtcCodes, dueDate, vendors, blocksRental],
  );

  const duplicateResult = useMemo(
    () =>
      findDuplicateHealthTask(openTasks, {
        organizationId: orgId ?? '',
        vehicleId,
        module: healthModule,
        sourceFindingId: prefillBase.metadata.sourceFindingId,
      }),
    [openTasks, orgId, vehicleId, healthModule, prefillBase.metadata.sourceFindingId],
  );

  const exactDuplicate =
    duplicateResult.matchKind === 'exact' ? duplicateResult.task : null;
  const relatedHintTask =
    duplicateResult.matchKind === 'legacy'
      ? duplicateResult.task
      : duplicateResult.possiblyRelatedTask;

  const complianceForModule = useMemo(() => {
    if (healthModule === 'service_compliance') {
      return complianceSignalsForModule(complianceSignals, ['tuv', 'bokraft', 'service', 'inspection']);
    }
    return [];
  }, [complianceSignals, healthModule]);

  const showActions =
    healthModuleNeedsAction(rentalModule) ||
    Boolean(exactDuplicate) ||
    Boolean(relatedHintTask) ||
    complianceForModule.length > 0;
  if (!showActions && !loading) return null;

  const openCreate = () => {
    setPrefill(prefillBase);
    setCreateOpen(true);
  };

  const btnClass =
    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-colors';

  return (
    <div className={`space-y-2 ${className}`}>
      {!compact && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Service-Aktionen
        </p>
      )}

      {exactDuplicate && (
        <div className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch-soft)] px-3 py-2 space-y-2">
          <p className="text-[11px] text-foreground">
            Offene Service-Aufgabe existiert bereits: <span className="font-semibold">{exactDuplicate.title}</span>
          </p>
          {onOpenExistingTask && (
            <button
              type="button"
              onClick={() => onOpenExistingTask(exactDuplicate.id)}
              className={`${btnClass} border-[color:var(--brand)]/25 surface-premium hover:bg-muted/40`}
            >
              <ExternalLink className="w-3 h-3" />
              Bestehende Aufgabe öffnen
            </button>
          )}
        </div>
      )}

      {relatedHintTask && !exactDuplicate && (
        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Möglicherweise zugehörige Aufgabe
            {duplicateResult.matchKind === 'legacy' ? ' (Legacy, ohne Finding-ID)' : ''}:
            {' '}
            <span className="font-semibold text-foreground">{relatedHintTask.title}</span>
          </p>
          {onOpenExistingTask && (
            <button
              type="button"
              onClick={() => onOpenExistingTask(relatedHintTask.id)}
              className={`${btnClass} border-border/60 hover:bg-muted/40`}
            >
              <ExternalLink className="w-3 h-3" />
              Aufgabe öffnen
            </button>
          )}
        </div>
      )}

      {complianceForModule.length > 0 && (
        <ComplianceTaskActions vehicleId={vehicleId} signals={complianceForModule} compact={compact} />
      )}

      {healthModuleNeedsAction(rentalModule) && (
        <div className="flex flex-wrap gap-1.5">
          {!exactDuplicate && (
            <button
              type="button"
              onClick={openCreate}
              className={`${btnClass} border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]`}
            >
              <ClipboardList className="w-3 h-3" />
              Service-Aufgabe anlegen
            </button>
          )}
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
          {rentalModule?.state && (
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
