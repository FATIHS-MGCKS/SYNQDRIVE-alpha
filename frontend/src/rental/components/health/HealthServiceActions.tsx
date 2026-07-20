import { ClipboardList, ExternalLink, FolderKanban, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import {
  api,
  type ApiServiceCase,
  type ApiTask,
  type ComplianceTaskSignal,
  type RentalHealthModule,
  type Vendor,
} from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { ComplianceTaskActions } from '../ComplianceTaskActions';
import { ServiceCaseCreateModal } from '../service-center/ServiceCaseCreateModal';
import { ServiceTaskCreateModal } from '../service-center/ServiceTaskCreateModal';
import { FleetHealthServiceCaseDetailDrawer } from '../fleet-health-service/FleetHealthServiceCaseDetailDrawer';
import { resolveServiceCasePermissions } from '../fleet-health-service/fleet-health-service-case-permissions';
import {
  buildHealthServiceCasePrefill,
  buildHealthSourceFindingId,
  findDuplicateHealthServiceCase,
  HEALTH_SERVICE_CASE_WORKFLOW_HINT_DE,
  type HealthServiceCasePrefill,
} from '../../lib/health-service-case-bridge.utils';
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
  /** Stable finding code, e.g. `rental-brakes` or `oem-tire_pressure_warning`. */
  findingCode?: string | null;
  findingTitle?: string | null;
  contextLines?: string[];
  dtcCodes?: string[];
  dueDate?: string | null;
  complianceSignals?: ComplianceTaskSignal[] | null;
  blocksRental?: boolean;
  blockingReasons?: string[];
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
  onOpenExistingServiceCase?: (serviceCaseId: string) => void;
  compact?: boolean;
  className?: string;
}

export function HealthServiceActions({
  vehicleId,
  healthModule,
  rentalModule,
  findingCode,
  findingTitle,
  contextLines,
  dtcCodes,
  dueDate,
  complianceSignals,
  blocksRental,
  blockingReasons,
  onOpenServiceCenter,
  onOpenExistingTask,
  onOpenExistingServiceCase,
  compact = false,
  className = '',
}: HealthServiceActionsProps) {
  const { orgId, hasPermission, userRole } = useRentalOrg();
  const [openTasks, setOpenTasks] = useState<ApiTask[]>([]);
  const [openCases, setOpenCases] = useState<ApiServiceCase[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [caseCreateOpen, setCaseCreateOpen] = useState(false);
  const [caseDetailOpen, setCaseDetailOpen] = useState(false);
  const [caseDetailId, setCaseDetailId] = useState<string | null>(null);
  const [taskPrefill, setTaskPrefill] = useState<HealthTaskPrefill | null>(null);
  const [casePrefill, setCasePrefill] = useState<HealthServiceCasePrefill | null>(null);

  const casePermissions = useMemo(
    () => resolveServiceCasePermissions({ membershipRole: userRole, hasPermission }),
    [userRole, hasPermission],
  );
  const canCreateTask = hasPermission('tasks', 'write') || userRole === 'ORG_ADMIN';
  const canCreateCase = casePermissions.canUpdate;

  useEffect(() => {
    if (!orgId || !vehicleId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.tasks.forVehicle(orgId, vehicleId).catch(() => []),
      api.serviceCases.forVehicle(orgId, vehicleId).catch(() => []),
      api.vendors.list(orgId).catch(() => []),
    ])
      .then(([tasks, cases, vendorList]) => {
        if (cancelled) return;
        setOpenTasks(Array.isArray(tasks) ? tasks : []);
        setOpenCases(Array.isArray(cases) ? cases : []);
        setVendors(Array.isArray(vendorList) ? vendorList : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId]);

  const taskPrefillBase = useMemo(
    () =>
      buildHealthTaskPrefill({
        module: healthModule,
        vehicleId,
        rentalModule,
        contextLines,
        dtcCodes,
        dueDate,
        vendors,
        blocksRental,
      }),
    [healthModule, vehicleId, rentalModule, contextLines, dtcCodes, dueDate, vendors, blocksRental],
  );

  const casePrefillBase = useMemo(
    () =>
      buildHealthServiceCasePrefill({
        module: healthModule,
        vehicleId,
        rentalModule,
        findingCode,
        findingTitle,
        contextLines,
        dtcCodes,
        vendors,
        blocksRental,
        blockingReasons,
      }),
    [
      healthModule,
      vehicleId,
      rentalModule,
      findingCode,
      findingTitle,
      contextLines,
      dtcCodes,
      vendors,
      blocksRental,
      blockingReasons,
    ],
  );

  const sourceFindingId = useMemo(
    () =>
      buildHealthSourceFindingId({
        vehicleId,
        healthModule,
        findingCode,
      }),
    [vehicleId, healthModule, findingCode],
  );

  const duplicateTask = useMemo(
    () => findDuplicateHealthTask(openTasks, vehicleId, healthModule, taskPrefillBase.type),
    [openTasks, vehicleId, healthModule, taskPrefillBase.type],
  );

  const duplicateCase = useMemo(
    () =>
      findDuplicateHealthServiceCase(
        openCases,
        vehicleId,
        healthModule,
        sourceFindingId,
        findingCode,
      ),
    [openCases, vehicleId, healthModule, sourceFindingId, findingCode],
  );

  const complianceForModule = useMemo(() => {
    if (healthModule === 'service_compliance') {
      return complianceSignalsForModule(complianceSignals, ['tuv', 'bokraft', 'service', 'inspection']);
    }
    return [];
  }, [complianceSignals, healthModule]);

  const showActions =
    healthModuleNeedsAction(rentalModule) ||
    Boolean(duplicateTask) ||
    Boolean(duplicateCase) ||
    complianceForModule.length > 0;
  if (!showActions && !loading) return null;

  const openTaskCreate = () => {
    setTaskPrefill(taskPrefillBase);
    setTaskCreateOpen(true);
  };

  const openCaseCreate = () => {
    setCasePrefill(casePrefillBase);
    setCaseCreateOpen(true);
  };

  const openCaseDetail = (serviceCaseId: string) => {
    if (onOpenExistingServiceCase) {
      onOpenExistingServiceCase(serviceCaseId);
      return;
    }
    setCaseDetailId(serviceCaseId);
    setCaseDetailOpen(true);
  };

  const reloadSources = () => {
    if (!orgId) return;
    Promise.all([
      api.tasks.forVehicle(orgId, vehicleId).catch(() => []),
      api.serviceCases.forVehicle(orgId, vehicleId).catch(() => []),
    ]).then(([tasks, cases]) => {
      setOpenTasks(Array.isArray(tasks) ? tasks : []);
      setOpenCases(Array.isArray(cases) ? cases : []);
    });
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

      {!compact && healthModuleNeedsAction(rentalModule) && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {HEALTH_SERVICE_CASE_WORKFLOW_HINT_DE}
        </p>
      )}

      {duplicateCase && (
        <div className="rounded-xl border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch-soft)] px-3 py-2 space-y-2">
          <p className="text-[11px] text-foreground">
            Passender Servicefall existiert bereits:{' '}
            <span className="font-semibold">{duplicateCase.title}</span>
          </p>
          <button
            type="button"
            onClick={() => openCaseDetail(duplicateCase.id)}
            className={`${btnClass} border-[color:var(--brand)]/25 surface-premium hover:bg-muted/40`}
          >
            <ExternalLink className="w-3 h-3" />
            Servicefall öffnen
          </button>
        </div>
      )}

      {duplicateTask && (
        <div className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2 space-y-2">
          <p className="text-[11px] text-foreground">
            Offene Service-Aufgabe existiert bereits:{' '}
            <span className="font-semibold">{duplicateTask.title}</span>
          </p>
          {onOpenExistingTask && (
            <button
              type="button"
              onClick={() => onOpenExistingTask(duplicateTask.id)}
              className={`${btnClass} border-[color:var(--brand)]/25 surface-premium hover:bg-muted/40`}
            >
              <ExternalLink className="w-3 h-3" />
              Bestehende Aufgabe öffnen
            </button>
          )}
        </div>
      )}

      {complianceForModule.length > 0 && (
        <ComplianceTaskActions vehicleId={vehicleId} signals={complianceForModule} compact={compact} />
      )}

      {healthModuleNeedsAction(rentalModule) && (canCreateCase || canCreateTask) && (
        <div className="flex flex-wrap gap-1.5">
          {canCreateCase && !duplicateCase && (
            <button
              type="button"
              onClick={openCaseCreate}
              className={`${btnClass} border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]`}
            >
              <FolderKanban className="w-3 h-3" />
              Servicefall erstellen
            </button>
          )}
          {canCreateTask && !duplicateTask && (
            <button
              type="button"
              onClick={openTaskCreate}
              className={`${btnClass} border-border/60 hover:bg-muted/40`}
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

      {canCreateTask && (
        <ServiceTaskCreateModal
          open={taskCreateOpen}
          onOpenChange={setTaskCreateOpen}
          vendors={vendors}
          defaultVehicleId={vehicleId}
          defaultVendorId={taskPrefill?.vendorId ?? null}
          healthPrefill={taskPrefill}
          onCreated={() => reloadSources()}
        />
      )}

      {canCreateCase && (
        <ServiceCaseCreateModal
          open={caseCreateOpen}
          onOpenChange={setCaseCreateOpen}
          vendors={vendors}
          lockedVehicleId={vehicleId}
          healthPrefill={casePrefill}
          onCreated={(created) => {
            reloadSources();
            openCaseDetail(created.id);
          }}
        />
      )}

      {!onOpenExistingServiceCase && casePermissions.canRead && (
        <FleetHealthServiceCaseDetailDrawer
          open={caseDetailOpen}
          onOpenChange={setCaseDetailOpen}
          serviceCaseId={caseDetailId}
          vendors={vendors}
          onOpenTask={onOpenExistingTask}
          onCaseChanged={reloadSources}
        />
      )}
    </div>
  );
}
