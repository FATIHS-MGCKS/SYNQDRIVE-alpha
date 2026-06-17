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
import { DetailSection, HealthModuleCard } from './HealthModuleCard';

export interface HealthVehicleDetailPanelProps {
  vehicle: VehicleData;
  health: VehicleHealthResponse | undefined;
  healthLoading?: boolean;
  initialTab?: HealthDetailTab;
  onClose: () => void;
  className?: string;
}

export function HealthVehicleDetailPanel({
  vehicle,
  health,
  healthLoading,
  initialTab = 'overview',
  onClose,
  className,
}: HealthVehicleDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<HealthDetailTab>(initialTab);
  const { data, loading, aiLoading, triggerAiAnalysis } = useHealthVehicleDetailData(
    vehicle.id,
    activeTab,
  );

  useEffect(() => {
    setActiveTab(initialTab);
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
                  className="sq-press sq-card rounded-xl px-3 py-2.5 text-left flex items-center justify-between gap-2"
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

          <DetailSection title="Recommended actions">
            <ul className="space-y-1.5">
              {actions.map((action) => (
                <li key={action} className="text-[12px] text-foreground flex gap-2">
                  <span className="text-muted-foreground">·</span>
                  {action}
                </li>
              ))}
            </ul>
          </DetailSection>

          <DetailSection title="Data trust">
            <div className="grid grid-cols-2 gap-2">
              <div className="sq-card rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Fresh</div>
                <div className="text-lg font-semibold tabular-nums">{trust.fresh}</div>
              </div>
              <div className="sq-card rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">Stale</div>
                <div className="text-lg font-semibold tabular-nums">{trust.stale}</div>
              </div>
              <div className="sq-card rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground">No tracking</div>
                <div className="text-lg font-semibold tabular-nums">{trust.noTracking}</div>
              </div>
              <div className="sq-card rounded-lg px-3 py-2">
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
      return (
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
          ]}
          percent={showPct ? pct : null}
          percentLabel={s?.displayMode === 'ESTIMATED' ? 'Estimated tread life' : 'Tread life'}
          showPercent={showPct}
        />
      );
    }

    if (activeTab === 'brakes') {
      const b = data.brakeSummary;
      const cond = b?.overallCondition ?? 'UNKNOWN';
      const minKm = b?.estimatedFrontRemainingKmMin;
      const showPct =
        minKm != null &&
        b?.stateClass === 'MEASURED' &&
        cond !== 'UNKNOWN';
      const pct =
        showPct && b?.estimatedReplacementDueInKm
          ? Math.min(100, Math.max(0, (minKm / b.estimatedReplacementDueInKm) * 100))
          : null;
      return (
        <HealthModuleCard
          title="Brakes"
          icon={Disc}
          rentalModule={health?.modules.brakes}
          keyValues={[
            { label: 'Condition', value: cond },
            { label: 'Evidence', value: b?.stateClass ?? '—' },
            {
              label: 'Est. remaining (front)',
              value:
                minKm != null
                  ? `~${Math.round(minKm / 1000)}k km`
                  : b?.estimatedReplacementDueInKm != null
                    ? `~${Math.round(b.estimatedReplacementDueInKm / 1000)}k km projected`
                    : '—',
            },
            { label: 'Open alerts', value: String(b?.openAlerts?.length ?? 0) },
          ]}
          percent={pct}
          percentLabel="Remaining wear (estimated)"
          showPercent={pct != null}
        />
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
      return (
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
            { label: 'Condition', value: bat?.lv?.condition ?? bat?.condition ?? '—' },
          ]}
          percent={displayPct}
          percentLabel={isEstimated ? 'Estimated SOH' : 'SOH'}
          showPercent={displayPct != null && !calibrating}
        />
      );
    }

    if (activeTab === 'dtc') {
      const active = data.dtcActive;
      const mod = health?.modules.error_codes;
      return (
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
              {active.slice(0, 8).map((code: any, i) => (
                <li key={i} className="rounded-md bg-muted/50 px-2 py-1 font-mono">
                  {code.code ?? code.dtcCode ?? JSON.stringify(code).slice(0, 80)}
                </li>
              ))}
            </ul>
          )}
        </HealthModuleCard>
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
        </div>
      );
    }

    if (activeTab === 'complaints') {
      const mod = health?.modules.complaints;
      return (
        <HealthModuleCard
          title="Complaints"
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
              <div key={key} className="sq-card rounded-xl px-3 py-2.5 text-[12px]">
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
                  <span className="text-muted-foreground">Stale</span>
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
    trust,
  ]);

  return (
    <div className={`flex h-full min-h-0 flex-col bg-card ${className ?? ''}`}>
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
                className="sq-press mt-2 rounded-lg border border-border/70 bg-card px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
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
