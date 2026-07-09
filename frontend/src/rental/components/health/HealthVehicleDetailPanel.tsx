import { SupportContextButton } from '../../../components/support/SupportContextButton';
import {
  AlertCircle,
  Battery,
  Bell,
  CircleDot,
  Disc,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  HealthStatusChip,
  SkeletonCard,
  StatusChip,
  normalizeHealthState,
} from '../../../components/patterns';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { getShortModel } from '../../data/vehicles';
import { useHealthVehicleDetailData } from '../../hooks/useHealthVehicleDetailData';
import {
  HEALTH_DETAIL_TABS,
  affectedModuleCount,
  buildRecommendedActions,
  buildStatusExplanation,
  dataTrustSummary,
  overallStateLabel,
  rentalGate,
  type HealthDetailTab,
} from '../../lib/health-detail-utils';
import { buildModuleChips, formatRelativeTime } from '../../lib/fleet-health-control-center';
import { RENTAL_HEALTH_MODULE_LABELS } from '../../rental-health-ui';
import { buildBokraftComplianceDisplay, buildNextServiceDisplay, buildTuvComplianceDisplay } from '../../lib/service-info-display';
import { segmentFromHealthState } from '../../lib/health-segment-display';
import { DetailSection, HealthModuleCard } from './HealthModuleCard';
import { HealthServiceActions } from './HealthServiceActions';
import { SegmentedHealthIndicator } from './SegmentedHealthIndicator';
import type { HealthActionModule } from '../../lib/health-task-bridge.utils';

export interface HealthVehicleDetailPanelProps {
  vehicle: VehicleData;
  health: VehicleHealthResponse | undefined;
  healthLoading?: boolean;
  initialTab?: HealthDetailTab;
  onClose: () => void;
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
  className?: string;
}

function ModuleServiceFooter({
  vehicleId,
  module,
  rentalModule,
  contextLines,
  dtcCodes,
  complianceSignals,
  onOpenServiceCenter,
  onOpenExistingTask,
  compact,
}: {
  vehicleId: string;
  module: HealthActionModule;
  rentalModule?: import('../../../lib/api').RentalHealthModule;
  contextLines?: string[];
  dtcCodes?: string[];
  complianceSignals?: import('../../../lib/api').ComplianceTaskSignal[] | null;
  onOpenServiceCenter?: () => void;
  onOpenExistingTask?: (taskId: string) => void;
  compact?: boolean;
}) {
  return (
    <HealthServiceActions
      vehicleId={vehicleId}
      healthModule={module}
      rentalModule={rentalModule}
      contextLines={contextLines}
      dtcCodes={dtcCodes}
      complianceSignals={complianceSignals}
      onOpenServiceCenter={onOpenServiceCenter}
      onOpenExistingTask={onOpenExistingTask}
      compact={compact}
      className="pt-1"
    />
  );
}

export function HealthVehicleDetailPanel({
  vehicle,
  health,
  healthLoading,
  initialTab = 'overview',
  onClose,
  onOpenServiceCenter,
  onOpenExistingTask,
  className,
}: HealthVehicleDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<HealthDetailTab>(initialTab);
  const { data, loading, aiLoading, triggerAiAnalysis } = useHealthVehicleDetailData(
    vehicle.id,
    activeTab,
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setActiveTab(initialTab);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicle.id, initialTab]);

  const gate = rentalGate(health);
  const explanation = buildStatusExplanation(health);
  const affected = affectedModuleCount(health);
  const actions = buildRecommendedActions(health);
  const trust = dataTrustSummary(health);
  const moduleChips = buildModuleChips(health);

  const vehicleTitle = [vehicle.make, getShortModel(vehicle.model), vehicle.year]
    .filter(Boolean)
    .join(' ');

  const overallChipState = !health
    ? 'unknown'
    : health.overall_state === 'n_a'
      ? 'no_data'
      : normalizeHealthState(health.overall_state);

  const tabContent = useMemo(() => {
    if (activeTab === 'overview') {
      return (
        <div className="space-y-4">
          <DetailSection title="Module status">
            <div className="grid grid-cols-1 gap-2">
              {moduleChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setActiveTab(
                    chip.key === 'error_codes'
                      ? 'dtc'
                      : chip.key === 'service_compliance'
                        ? 'service'
                        : chip.key === 'vehicle_alerts'
                          ? 'oem_alerts'
                          : (chip.key as HealthDetailTab),
                  )}
                  className="sq-press surface-premium rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-foreground">{chip.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{chip.detail}</div>
                  </div>
                  <HealthStatusChip
                    state={
                      chip.state === 'n_a'
                        ? 'no_data'
                        : normalizeHealthState(chip.state)
                    }
                    dot
                  />
                </button>
              ))}
            </div>
          </DetailSection>

          {health && health.blocking_reasons.length > 0 && (
            <DetailSection title="Blocking reasons">
              <ul className="space-y-1.5">
                {health.blocking_reasons.map((reason) => (
                  <li
                    key={reason}
                    className="flex items-start gap-2 rounded-lg sq-tone-critical px-2.5 py-2 text-[11px]"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {reason}
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}

          <DetailSection title="Empfohlene Maßnahmen">
            <ul className="space-y-1.5 mb-3">
              {actions.map((action) => (
                <li key={action} className="text-[12px] text-foreground flex gap-2">
                  <span className="text-muted-foreground">·</span>
                  {action}
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              {(['tires', 'brakes', 'battery', 'error_codes', 'service_compliance'] as const).map((key) => {
                const mod = health?.modules[key];
                if (!mod || (mod.state !== 'critical' && mod.state !== 'warning')) return null;
                return (
                  <ModuleServiceFooter
                    key={key}
                    vehicleId={vehicle.id}
                    module={key}
                    rentalModule={mod}
                    onOpenServiceCenter={onOpenServiceCenter}
                    onOpenExistingTask={onOpenExistingTask}
                    compact
                  />
                );
              })}
            </div>
          </DetailSection>

          <DetailSection title="Data trust">
            <div className="grid grid-cols-2 gap-2">
              <div className="surface-premium rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Fresh</div>
                <div className="text-lg font-semibold tabular-nums">{trust.fresh}</div>
              </div>
              <div className="surface-premium rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Delayed data</div>
                <div className="text-lg font-semibold tabular-nums">{trust.stale}</div>
              </div>
              <div className="surface-premium rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">No tracking</div>
                <div className="text-lg font-semibold tabular-nums">{trust.noTracking}</div>
              </div>
              <div className="surface-premium rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Estimated</div>
                <div className="text-lg font-semibold tabular-nums">{trust.estimated}</div>
              </div>
            </div>
          </DetailSection>
        </div>
      );
    }

    if (loading && activeTab !== 'evidence' && activeTab !== 'complaints' && activeTab !== 'oem_alerts') {
      return <SkeletonCard className="border-0 shadow-none" />;
    }

    if (activeTab === 'tires') {
      const s = data.tiresSummary;
      const pct = s?.overallPercent;
      const showPct =
        pct != null &&
        Number.isFinite(pct) &&
        (s?.displayMode === 'MEASURED' || s?.displayMode === 'ESTIMATED');
      const tireSegment = segmentFromHealthState(s?.overallStatus ?? health?.modules.tires?.state, showPct ? pct : null);
      return (
        <div className="space-y-3">
        <HealthModuleCard
          title="Tires"
          icon={CircleDot}
          rentalModule={health?.modules.tires}
          keyValues={[
            { label: 'Overall status', value: s?.overallStatus ?? '—' },
            {
              label: 'Lowest tread',
              value: s?.displayTreadMm != null ? `${s.displayTreadMm.toFixed(1)} mm` : '—',
            },
            {
              label: 'Remaining km',
              value:
                s?.overallRemainingKm != null
                  ? `~${Math.round(s.overallRemainingKm).toLocaleString('de-DE')} km`
                  : '—',
            },
            {
              label: 'Last measured',
              value: s?.lastMeasurementAt
                ? new Date(s.lastMeasurementAt).toLocaleDateString('de-DE')
                : '—',
            },
            ...(showPct
              ? [{ label: s?.displayMode === 'ESTIMATED' ? 'Estimated tread life' : 'Tread life', value: `${Math.round(pct ?? 0)}%` }]
              : []),
          ]}
          indicator={(
            <SegmentedHealthIndicator
              level={tireSegment.level}
              tone={tireSegment.tone}
              label={tireSegment.label}
              ariaLabel={`Tires: ${tireSegment.label}`}
            />
          )}
          percent={showPct ? pct : null}
          percentLabel={s?.displayMode === 'ESTIMATED' ? 'Estimated tread life' : 'Tread life'}
          showPercent={showPct}
        />
        <ModuleServiceFooter
          vehicleId={vehicle.id}
          module="tires"
          rentalModule={health?.modules.tires}
          contextLines={[
            s?.displayTreadMm != null ? `Profiltiefe: ${s.displayTreadMm.toFixed(1)} mm` : '',
          ].filter(Boolean)}
          onOpenServiceCenter={onOpenServiceCenter}
          onOpenExistingTask={onOpenExistingTask}
        />
        </div>
      );
    }

    if (activeTab === 'brakes') {
      const b = data.brakeSummary;
      const cond = b?.overallCondition ?? 'UNKNOWN';
      const frontMin =
        b?.frontAxle?.estimatedRemainingKmMin ?? b?.estimatedFrontRemainingKmMin;
      const frontRange =
        frontMin != null ? `~${Math.round(frontMin / 1000)}k km` : '—';
      const brakeSegment = segmentFromHealthState(cond);
      return (
        <div className="space-y-3">
        <HealthModuleCard
          title="Brakes"
          icon={Disc}
          rentalModule={health?.modules.brakes}
          keyValues={[
            { label: 'Condition', value: cond },
            { label: 'Data basis', value: b?.dataBasis ?? '—' },
            { label: 'Confidence', value: b?.confidenceLevel ?? '—' },
            { label: 'Front remaining', value: frontRange },
            { label: 'Open alerts', value: String(b?.openAlerts?.length ?? 0) },
          ]}
          indicator={(
            <SegmentedHealthIndicator
              level={brakeSegment.level}
              tone={brakeSegment.tone}
              label={brakeSegment.label}
              ariaLabel={`Brakes: ${brakeSegment.label}`}
            />
          )}
        />
        <ModuleServiceFooter
          vehicleId={vehicle.id}
          module="brakes"
          rentalModule={health?.modules.brakes}
          contextLines={[`Zustand: ${cond}`]}
          onOpenServiceCenter={onOpenServiceCenter}
          onOpenExistingTask={onOpenExistingTask}
        />
        </div>
      );
    }

    if (activeTab === 'battery') {
      const bat = data.battery;
      const pub = bat?.lv?.publicationState ?? bat?.currentState?.publicationState;
      const calibrating = pub === 'INITIAL_CALIBRATION';
      const soh =
        bat?.lv?.healthPercent ??
        bat?.currentState?.publishedSohPct ??
        bat?.currentState?.sohPercent ??
        null;
      const est = bat?.lv?.estimatedHealthPercent ?? bat?.currentState?.estimatedSohPct ?? null;
      const isEstimated = est != null && soh == null;
      const displayPct = calibrating ? null : (soh ?? est);
      const batteryCondition = bat?.lv?.condition ?? bat?.condition ?? null;
      const lvEstimatedStatus =
        bat?.lv?.estimatedHealth?.status ??
        (batteryCondition === 'good'
          ? 'GOOD'
          : batteryCondition === 'watch'
            ? 'WATCH'
            : batteryCondition === 'attention'
              ? 'WARNING'
              : 'UNKNOWN');
      const batterySegment = segmentFromHealthState(
        lvEstimatedStatus,
        displayPct,
        bat?.lv?.estimatedHealth?.bars ?? null,
      );
      return (
        <div className="space-y-3">
        <HealthModuleCard
          title="Battery"
          icon={Battery}
          rentalModule={health?.modules.battery}
          keyValues={[
            {
              label: 'Voltage',
              value:
                bat?.lv?.telemetry?.voltageV != null
                  ? `${bat.lv.telemetry.voltageV.toFixed(1)} V`
                  : bat?.currentState?.voltageV != null
                    ? `${bat.currentState.voltageV.toFixed(1)} V`
                    : '—',
            },
            {
              label: 'Resting voltage',
              value:
                bat?.lv?.restingVoltage?.valueV != null
                  ? `${bat.lv.restingVoltage.valueV.toFixed(2)} V`
                  : '—',
            },
            {
              label: 'SOH / health',
              value: calibrating
                ? 'Calibrating'
                : soh != null
                  ? `${Math.round(soh)}%`
                  : est != null
                    ? `~${Math.round(est)}% estimated`
                    : 'No tracking',
            },
            { label: 'Condition', value: batteryCondition ?? '—' },
          ]}
          indicator={(
            <SegmentedHealthIndicator
              level={batterySegment.level}
              tone={batterySegment.tone}
              label={batterySegment.label}
              ariaLabel={`Battery: ${batterySegment.label}`}
            />
          )}
          percent={displayPct}
          percentLabel={isEstimated ? 'Estimated SOH' : 'SOH'}
          showPercent={displayPct != null && !calibrating}
        />
        <ModuleServiceFooter
          vehicleId={vehicle.id}
          module="battery"
          rentalModule={health?.modules.battery}
          onOpenServiceCenter={onOpenServiceCenter}
          onOpenExistingTask={onOpenExistingTask}
        />
        </div>
      );
    }

    if (activeTab === 'dtc') {
      const active = data.dtcActive;
      const mod = health?.modules.error_codes;
      const codes = active.map((code) => {
        const c = code as { code?: string; dtcCode?: string };
        return String(c.code ?? c.dtcCode ?? '');
      }).filter(Boolean);
      return (
        <div className="space-y-3">
        <HealthModuleCard
          title="Diagnostic trouble codes"
          icon={AlertCircle}
          rentalModule={mod}
          keyValues={[
            { label: 'Active codes', value: String(active.length) },
            { label: 'Historical', value: String(data.dtcAll.length) },
            { label: 'Rental health', value: mod?.reason ?? '—' },
          ]}
        >
          {active.length > 0 && (
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-[11px]">
              {active.slice(0, 8).map((code, i) => {
                const c = code as { code?: string; dtcCode?: string };
                return (
                <li key={i} className="rounded-md bg-muted/50 px-2 py-1 font-mono">
                  {c.code ?? c.dtcCode ?? JSON.stringify(code).slice(0, 80)}
                </li>
              );})}
            </ul>
          )}
        </HealthModuleCard>
        <ModuleServiceFooter
          vehicleId={vehicle.id}
          module="error_codes"
          rentalModule={mod}
          dtcCodes={codes}
          onOpenServiceCenter={onOpenServiceCenter}
          onOpenExistingTask={onOpenExistingTask}
        />
        </div>
      );
    }

    if (activeTab === 'service') {
      const svc = data.service;
      const ns = buildNextServiceDisplay(svc);
      const tuv = buildTuvComplianceDisplay(svc);
      const bok = buildBokraftComplianceDisplay(svc);
      return (
        <div className="space-y-3">
          <HealthModuleCard
            title="Service & compliance"
            icon={Wrench}
            rentalModule={health?.modules.service_compliance}
            keyValues={[
              { label: 'Next service (HM/OEM)', value: ns.badge ?? 'No Tracking' },
              { label: 'Detail', value: ns.primaryLine },
              { label: 'TÜV', value: tuv.label },
              { label: 'BOKraft', value: bok.label },
            ]}
          />
          <ModuleServiceFooter
            vehicleId={vehicle.id}
            module="service_compliance"
            rentalModule={health?.modules.service_compliance}
            complianceSignals={svc?.taskSignals}
            contextLines={[tuv.label, bok.label].filter((l) => l && l !== '—')}
            onOpenServiceCenter={onOpenServiceCenter}
            onOpenExistingTask={onOpenExistingTask}
          />
        </div>
      );
    }

    if (activeTab === 'complaints') {
      const mod = health?.modules.complaints;
      return (
        <HealthModuleCard
          title="Technische Beobachtungen"
          icon={MessageSquare}
          rentalModule={mod}
          keyValues={[{ label: 'Status', value: mod?.reason ?? '—' }]}
        />
      );
    }

    if (activeTab === 'oem_alerts') {
      const mod = health?.modules.vehicle_alerts;
      const countMatch = mod?.reason?.match(/(\d+)/);
      return (
        <HealthModuleCard
          title="OEM alerts"
          icon={Bell}
          rentalModule={mod}
          keyValues={[
            { label: 'Summary', value: mod?.reason ?? '—' },
            { label: 'Count', value: countMatch ? countMatch[1] : '—' },
          ]}
        />
      );
    }

    if (activeTab === 'evidence') {
      if (!health) {
        return (
          <p className="text-[12px] text-muted-foreground">No rental health payload available.</p>
        );
      }
      return (
        <div className="space-y-2">
          {Object.entries(health.modules).map(([key, mod]) => {
            const fresh = formatRelativeTime(mod.last_updated_at);
            return (
              <div key={key} className="surface-premium rounded-xl px-3 py-2.5 text-[12px]">
                <div className="font-semibold text-foreground">
                  {RENTAL_HEALTH_MODULE_LABELS[key] ?? key}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                  <span className="text-muted-foreground">State</span>
                  <span>{mod.state}</span>
                  <span className="text-muted-foreground">Source</span>
                  <span>{mod.source ?? '—'}</span>
                  <span className="text-muted-foreground">Evidence</span>
                  <span>{mod.evidence_type ?? '—'}</span>
                  <span className="text-muted-foreground">Updated</span>
                  <span>{mod.last_updated_at ? fresh : '—'}</span>
                  <span className="text-muted-foreground">Delayed data</span>
                  <span>{mod.data_stale ? 'Yes' : 'No'}</span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  }, [
    activeTab,
    actions,
    data,
    health,
    loading,
    moduleChips,
    onOpenExistingTask,
    onOpenServiceCenter,
    trust,
    vehicle.id,
  ]);

  return (
    <div className={`flex h-full min-h-0 flex-col surface-premium ${className ?? ''}`}>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-foreground">{vehicleTitle}</h2>
            <p className="mt-0.5 font-mono text-[12px] font-bold text-foreground">{vehicle.license}</p>
            <p className="text-[11px] text-muted-foreground">{vehicle.station || 'No station'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sq-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70"
            aria-label="Close detail"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <SupportContextButton
            kind="vehicle-health"
            size="sm"
            contextData={{
              vehicleId: vehicle.id,
              licensePlate: vehicle.license,
              selectedTab: activeTab,
              overallState: health?.overall_state,
              healthStatusSummary: health?.overall_state,
              lastTelemetryAt: health?.generated_at,
            }}
          />
          <HealthStatusChip
            state={overallChipState}
            label={healthLoading && !health ? 'Loading…' : overallStateLabel(health?.overall_state)}
            dot
          />
          <StatusChip tone={gate.tone}>{gate.label}</StatusChip>
          {health?.generated_at && (
            <StatusChip tone="neutral">
              {formatRelativeTime(health.generated_at)}
            </StatusChip>
          )}
        </div>
      </div>

      <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Why this status?
        </h3>
        <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">{explanation}</p>
        {affected > 0 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {affected} module{affected === 1 ? '' : 's'} affected
          </p>
        )}
      </div>

      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="sq-tab-bar flex gap-1 overflow-x-auto p-1">
          {HEALTH_DETAIL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/25'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{tabContent}</div>

      {activeTab === 'overview' && (
        <div className="shrink-0 border-t border-border bg-muted/15 px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sq-tone-ai">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-[12px] font-semibold text-foreground">AI-assisted explanation</h4>
              <p className="text-[10px] text-muted-foreground">
                Explains patterns and suggests checks — does not override rental health status.
              </p>
              {data.aiResult ? (
                <p className="mt-2 text-[11px] text-foreground leading-relaxed">
                  {data.aiResult.overallStatus.shortSummary}
                </p>
              ) : null}
              <button
                type="button"
                disabled={aiLoading}
                onClick={() => void triggerAiAnalysis()}
                className="sq-press mt-2 rounded-lg border border-border/70 surface-premium px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
              >
                {aiLoading ? 'Analyzing…' : data.aiResult ? 'Refresh explanation' : 'Generate explanation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
