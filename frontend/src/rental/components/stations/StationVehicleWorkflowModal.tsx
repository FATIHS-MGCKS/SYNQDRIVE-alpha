import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  type Station,
  type StationVehicleWorkflowPreviewResult,
  type StationVehicleWorkflowType,
  type StationVehicleWorkflowVehicleRow,
} from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { useStationsV2Permissions } from '../../hooks/useStationsV2Permissions';
import {
  buildWorkflowPreviewRequest,
  formatWorkflowStationRef,
  isVersionConflictError,
  positionRowsFromPreview,
  previewHasRentedWarning,
  workflowDefaultTargetStationId,
  workflowNeedsTargetStation,
  workflowRestrictHomeFleet,
} from '../../lib/station-vehicle-workflow.utils';
import { useStationModalA11y } from '../../lib/stations-modal-a11y';

type WorkflowStep = 'select' | 'configure' | 'preview';

interface StationVehicleWorkflowModalProps {
  station: Station;
  workflow: StationVehicleWorkflowType;
  onClose: () => void;
  onSaved?: () => void;
}

export function StationVehicleWorkflowModal({
  station,
  workflow,
  onClose,
  onSaved,
}: StationVehicleWorkflowModalProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();
  const { forStation } = useStationsV2Permissions();
  const caps = forStation(station);

  const canRun = useMemo(() => {
    switch (workflow) {
      case 'change_home':
      case 'remove_home':
        return caps.canManageHomeFleet;
      case 'correct_current':
      case 'check_in':
        return caps.canManageCurrentLocation;
      case 'plan_transfer':
        return caps.canManageTransfers;
      default:
        return false;
    }
  }, [caps, workflow]);

  const [step, setStep] = useState<WorkflowStep>('select');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [vehicles, setVehicles] = useState<StationVehicleWorkflowVehicleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedVehicle, setSelectedVehicle] = useState<StationVehicleWorkflowVehicleRow | null>(null);
  const [targetStationId, setTargetStationId] = useState(
    workflowDefaultTargetStationId(workflow, station.id) ?? '',
  );
  const [destinationStations, setDestinationStations] = useState<Station[]>([]);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<StationVehicleWorkflowPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.stations.lookupVehicleWorkflowVehicles(orgId, {
        contextStationId: station.id,
        search: search.trim() || undefined,
        page,
        pageSize: 25,
        homeAtContextOnly: workflowRestrictHomeFleet(workflow),
      });
      setVehicles(result.vehicles);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch (e) {
      setError((e as Error).message || t('stations.workflow.errorLoad'));
    } finally {
      setLoading(false);
    }
  }, [orgId, page, search, station.id, t, workflow]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    if (!orgId || !workflowNeedsTargetStation(workflow)) return;
    void api.stations.list(orgId, { selectableOnly: true }).then(setDestinationStations).catch(() => {
      setDestinationStations([]);
    });
  }, [orgId, workflow]);

  const selectableDestinations = useMemo(
    () =>
      destinationStations.filter((entry) => {
        if (entry.status === 'ARCHIVED') return false;
        if (workflow === 'plan_transfer') return entry.id !== station.id;
        return true;
      }),
    [destinationStations, station.id, workflow],
  );

  const runPreview = async (vehicle: StationVehicleWorkflowVehicleRow) => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setConflict(false);
    try {
      const result = await api.stations.previewVehicleWorkflow(
        orgId,
        buildWorkflowPreviewRequest({
          workflow,
          vehicle,
          contextStationId: station.id,
          targetStationId: workflowNeedsTargetStation(workflow) ? targetStationId : undefined,
          reason,
        }),
      );
      setPreview(result);
      setStep('preview');
    } catch (e) {
      setError((e as Error).message || t('stations.workflow.errorPreview'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVehicle = (vehicle: StationVehicleWorkflowVehicleRow) => {
    setSelectedVehicle(vehicle);
    setConflict(false);
    if (workflowNeedsTargetStation(workflow) && workflow !== 'change_home' && !targetStationId) {
      setStep('configure');
      return;
    }
    void runPreview(vehicle);
  };

  const handleConfirm = async () => {
    if (
      (workflow === 'correct_current' || workflow === 'check_in') &&
      !reason.trim()
    ) {
      setError(t('stations.workflow.reasonRequired'));
      return;
    }

    if (!orgId || !selectedVehicle || !preview || !canRun) return;
    setSaving(true);
    setError(null);
    setConflict(false);
    try {
      if (workflow === 'change_home' || workflow === 'remove_home') {
        await api.stations.changeHomeStation(orgId, {
          vehicleId: selectedVehicle.id,
          newHomeStationId: workflow === 'remove_home' ? null : targetStationId || station.id,
          expectedVersion: preview.concurrency.stationPositionVersion,
          reason: reason.trim() || `StationVehicleWorkflow:${workflow}`,
        });
      } else if (workflow === 'correct_current' || workflow === 'check_in') {
        await api.stations.correctVehicleCurrentStation(orgId, {
          vehicleId: selectedVehicle.id,
          currentStationId: workflow === 'check_in' ? station.id : targetStationId,
          source: 'MANUAL',
          reason: reason.trim() || `StationVehicleWorkflow:${workflow}`,
          expectedVersion: preview.concurrency.stationPositionVersion,
        });
      } else if (workflow === 'plan_transfer') {
        await api.stations.planVehicleStationTransfer(orgId, {
          vehicleId: selectedVehicle.id,
          fromStationId: station.id,
          toStationId: targetStationId,
          reason: reason.trim() || `StationVehicleWorkflow:${workflow}`,
        });
      }

      toast.success(t('stations.workflow.saved'));
      onSaved?.();
      onClose();
    } catch (e) {
      if (isVersionConflictError(e)) {
        setConflict(true);
        setError(t('stations.workflow.versionConflict'));
      } else {
        setError((e as Error).message || t('stations.workflow.errorSave'));
      }
    } finally {
      setSaving(false);
    }
  };

  const unassignedLabel = t('stations.workflow.unassigned');

  return (
    <WorkflowModalShell
      onClose={onClose}
      disabled={saving}
      titleId={`workflow-modal-title-${workflow}`}
      closeLabel={t('common.close')}
    >
      <div className="flex items-start justify-between gap-3 p-4 border-b border-border/60">
        <div className="min-w-0">
          <h2 id={`workflow-modal-title-${workflow}`} className="text-sm font-semibold">{t(`stations.workflow.${workflow}.title`)}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate" title={station.name}>{station.name}</p>
        </div>
        <button type="button" onClick={onClose} disabled={saving} className="p-1.5 rounded-lg hover:bg-muted/60" aria-label={t('common.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 min-h-[220px]">
        {step !== 'select' && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
            onClick={() => {
              if (step === 'preview') {
                setStep(workflowNeedsTargetStation(workflow) && workflow !== 'change_home' ? 'configure' : 'select');
                setPreview(null);
              } else {
                setStep('select');
              }
            }}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {t('common.back')}
          </button>
        )}

        {error && (
          <div
            className={`mb-3 rounded-xl border px-3 py-2 text-xs ${
              conflict
                ? 'border-[color:var(--status-critical)]/40 bg-[color:var(--status-critical)]/[0.05]'
                : 'border-[color:var(--status-watch)]/40'
            }`}
          >
            <WorkflowErrorContent
              message={error}
              onRetry={conflict ? () => void loadVehicles() : undefined}
              retryLabel={t('stations.workflow.reloadVehicle')}
            />
          </div>
        )}

        {step === 'select' && (
          <VehiclePicker
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            loading={loading}
            vehicles={vehicles}
            onSelect={handleSelectVehicle}
            emptyLabel={t('stations.workflow.emptyVehicles')}
            searchPlaceholder={t('stations.workflow.searchVehicles')}
            unassignedLabel={unassignedLabel}
            t={t}
          />
        )}

        {step === 'configure' && selectedVehicle && (
          <ConfigureStep
            workflow={workflow}
            targetStationId={targetStationId}
            onTargetStationIdChange={setTargetStationId}
            destinations={selectableDestinations}
            reason={reason}
            onReasonChange={setReason}
            contextStationName={station.name}
            t={t}
          />
        )}

        {step === 'preview' && preview && (
          <PreviewStep
            preview={preview}
            unassignedLabel={unassignedLabel}
            reason={reason}
            onReasonChange={setReason}
            requiresReason={workflow === 'correct_current' || workflow === 'check_in'}
            t={t}
          />
        )}

        {step === 'configure' && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={loading || !targetStationId}
              onClick={() => selectedVehicle && void runPreview(selectedVehicle)}
              className="sq-3d-btn sq-3d-btn--primary px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('stations.workflow.preview')}
            </button>
          </div>
        )}
      </div>

      {step === 'select' && (
        <div className="p-4 border-t border-border/60 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {t('stations.workflow.pagination')}: {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="p-1.5 rounded-lg border border-border disabled:opacity-40"
              aria-label={t('stations.detail.fleetPrevPage')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2 tabular-nums">
              {page}/{totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="p-1.5 rounded-lg border border-border disabled:opacity-40"
              aria-label={t('stations.detail.fleetNextPage')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <WorkflowModalFooter>
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-2 rounded-xl text-xs font-semibold border border-border">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving || !preview.allowed || !canRun || ((workflow === 'correct_current' || workflow === 'check_in') && !reason.trim())}
            className="sq-3d-btn sq-3d-btn--primary px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('stations.workflow.confirm')}
          </button>
        </WorkflowModalFooter>
      )}
    </WorkflowModalShell>
  );
}

function WorkflowModalShell({
  children,
  onClose,
  disabled,
  titleId,
  closeLabel,
}: {
  children: ReactNode;
  onClose: () => void;
  disabled?: boolean;
  titleId: string;
  closeLabel: string;
}) {
  const dialogRef = useStationModalA11y({ open: true, onClose, disabled });

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={() => !disabled && onClose()}
        aria-label={closeLabel}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full sm:max-w-xl max-h-[90vh] surface-premium rounded-t-2xl sm:rounded-2xl border border-border shadow-xl flex flex-col animate-fade-up"
      >
        {children}
      </div>
    </div>
  );
}

function WorkflowModalFooter({ children }: { children: ReactNode }) {
  return <div className="p-4 border-t border-border/60 flex justify-end gap-2">{children}</div>;
}

function WorkflowErrorContent({
  message,
  onRetry,
  retryLabel,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-semibold underline">
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function VehiclePicker({
  search,
  onSearchChange,
  loading,
  vehicles,
  onSelect,
  emptyLabel,
  searchPlaceholder,
  unassignedLabel,
  t,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
  vehicles: StationVehicleWorkflowVehicleRow[];
  onSelect: (vehicle: StationVehicleWorkflowVehicleRow) => void;
  emptyLabel: string;
  searchPlaceholder: string;
  unassignedLabel: string;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-3">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={t('stations.a11y.searchWorkflowVehicles')}
        className="w-full px-3 py-2 rounded-lg border border-border surface-premium text-sm"
      />
      {loading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : vehicles.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              <button
                type="button"
                onClick={() => onSelect(vehicle)}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-muted/40"
              >
                <span className="text-sm font-semibold font-mono">{vehicle.licensePlate || '—'}</span>
                <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                  {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                  {' · '}
                  {t('stations.workflow.position.home')}: {formatWorkflowStationRef(vehicle.homeStation, unassignedLabel)}
                  {' · '}
                  {t('stations.workflow.position.current')}: {formatWorkflowStationRef(vehicle.currentStation, unassignedLabel)}
                </p>
                {vehicle.isRented && (
                  <span className="inline-flex mt-1 text-[10px] font-semibold text-[color:var(--status-watch)]">
                    {t('stations.workflow.rentedWarning')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfigureStep({
  workflow,
  targetStationId,
  onTargetStationIdChange,
  destinations,
  reason,
  onReasonChange,
  contextStationName,
  t,
}: {
  workflow: StationVehicleWorkflowType;
  targetStationId: string;
  onTargetStationIdChange: (value: string) => void;
  destinations: Station[];
  reason: string;
  onReasonChange: (value: string) => void;
  contextStationName: string;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t(`stations.workflow.${workflow}.description`)}</p>
      {workflow === 'change_home' ? (
        <p className="text-xs">
          <span className="text-muted-foreground">{t('stations.workflow.targetStation')}: </span>
          <span className="font-semibold">{contextStationName}</span>
        </p>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs font-semibold">{t('stations.workflow.targetStation')}</span>
          <select
            value={targetStationId}
            onChange={(e) => onTargetStationIdChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border surface-premium text-sm"
          >
            <option value="">{t('stations.workflow.selectStation')}</option>
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
                {destination.code ? ` (${destination.code})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-semibold">{t('stations.workflow.reason')}</span>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border surface-premium text-sm"
          placeholder={t('stations.workflow.reasonPlaceholder')}
        />
      </label>
    </div>
  );
}

function PreviewStep({
  preview,
  unassignedLabel,
  reason,
  onReasonChange,
  requiresReason,
  t,
}: {
  preview: StationVehicleWorkflowPreviewResult;
  unassignedLabel: string;
  reason: string;
  onReasonChange: (value: string) => void;
  requiresReason: boolean;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 p-3 space-y-2">
        <p className="text-sm font-semibold font-mono">{preview.licensePlate || '—'}</p>
        {preview.vehicleLabel && <p className="text-xs text-muted-foreground">{preview.vehicleLabel}</p>}
      </div>

      <div className="rounded-xl border border-border/70 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">{t('stations.workflow.preview.axis')}</th>
              <th className="text-left px-3 py-2 font-semibold">{t('stations.workflow.preview.from')}</th>
              <th className="text-left px-3 py-2 font-semibold">{t('stations.workflow.preview.to')}</th>
            </tr>
          </thead>
          <tbody>
            {positionRowsFromPreview(preview).map((row) => (
              <tr key={row.key} className="border-t border-border/50">
                <td className="px-3 py-2 font-semibold">{t(`stations.workflow.position.${row.key}`)}</td>
                <td className="px-3 py-2">{formatWorkflowStationRef(row.from, unassignedLabel)}</td>
                <td className="px-3 py-2">{formatWorkflowStationRef(row.to, unassignedLabel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      {requiresReason && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold">{t('stations.workflow.reason')}</span>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border surface-premium text-sm"
            placeholder={t('stations.workflow.reasonPlaceholder')}
          />
        </label>
      )}

      {previewHasRentedWarning(preview) && (
        <WorkflowWarning message={t('stations.workflow.rentedWarning')} />
      )}

      {preview.blockingReasons.length > 0 && <IssueList issues={preview.blockingReasons} tone="critical" />}
      {preview.warnings.length > 0 && <IssueList issues={preview.warnings} tone="watch" />}
    </div>
  );
}

function WorkflowWarning({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-xs text-[color:var(--status-watch)]">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function IssueList({
  issues,
  tone,
}: {
  issues: Array<{ code: string; message: string }>;
  tone: 'critical' | 'watch';
}) {
  return (
    <ul
      className={`text-xs space-y-1 ${
        tone === 'critical' ? 'text-[color:var(--status-critical)]' : 'text-[color:var(--status-watch)]'
      }`}
    >
      {issues.map((issue) => (
        <li key={`${issue.code}-${issue.message}`}>• {issue.message}</li>
      ))}
    </ul>
  );
}
