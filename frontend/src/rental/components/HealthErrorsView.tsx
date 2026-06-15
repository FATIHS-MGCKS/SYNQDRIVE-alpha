
import { Activity, AlertTriangle, Battery, Calendar, Gauge, ShieldAlert, Snowflake, Sun, Thermometer, Wind, Wrench, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import tellTaleOilIcon from '../../assets/icons/telltale/oil.svg';
import tellTaleCelIcon from '../../assets/icons/telltale/cel.svg';
import tellTaleBrakePadIcon from '../../assets/icons/telltale/brake-pad.svg';
import tellTaleTirePressureIcon from '../../assets/icons/telltale/tire-pressure.svg';
import tellTaleBatteryIcon from '../../assets/icons/telltale/battery.svg';
import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XAxis, YAxis, ResponsiveContainer, Tooltip, Line, LineChart, ReferenceArea } from 'recharts';
import { api, streamAiTireSpecs, type AgentStep, type AiTireSpecsStreamEvent, type HealthSummaryResponse, type TireWearAnalysis, type ServiceInfoStatus, type BatteryHealthSummary, type BatteryHealthDetail, type HvBatteryStatus, type BrakeHealthSummary as BrakeHealthSummaryType, type BrakeHealthDetail, type BrakeAlert, type TripProfile, type TireHealthSummaryResponse, type TireHealthDetailResponse, type TireAlert, type VehicleComplaint, type DtcKnowledgeDto, type BatteryHealthStatus, type BatteryRestingVoltageStatus } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useEffectiveHealth, useFleetVehicles } from '../FleetContext';
import {
  collectRentalHealthReasons,
  dtcFaultCardTone,
  quickCardAccentFromRentalState,
  rentalOverallToVhcStatus,
  rentalStateLabelDe,
  rentalStatePillClasses,
  serviceCardBorderFromRentalState,
} from '../rental-health-ui';
import { BatteryConditionBars, RestingVoltageBadge } from './BatteryConditionBars';
import {
  PageHeader,
  SectionHeader,
  DataCard,
  MetricCard,
  EmptyState,
  SkeletonCard,
  HealthStatusChip,
  StatusChip,
  PriorityBadge,
  StatusDot,
} from '../../components/patterns';
import { MisuseCasesPanel } from './MisuseCasesPanel';

interface HealthErrorsViewProps {
  vehicleId?: string;
  fuelType?: string;
}

function formatEnumLabel(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  return value.replace(/_/g, ' ');
}

function formatMaxDecimals(value: number | null | undefined, maxDecimals = 2, fallback = '—'): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value * 10 ** maxDecimals) / 10 ** maxDecimals;
  return String(rounded);
}

/**
 * Canonical tire status → UI style. Mirrors the backend tire-status taxonomy
 * (GOOD | WATCH | WARNING | CRITICAL | UNKNOWN) so the quick box and detail
 * modal render the same single source of truth, not a re-derived % bucket.
 */
function tireStatusStyle(
  status: string | null | undefined,
): { dot: string; pill: string; label: string } {
  switch (status) {
    case 'GOOD':
      return { dot: 'sq-dot-success', pill: 'sq-chip-success', label: 'Good' };
    case 'WATCH':
      return { dot: 'sq-dot-watch', pill: 'sq-chip-watch', label: 'Watch' };
    case 'WARNING':
      return { dot: 'sq-dot-warning', pill: 'sq-chip-warning', label: 'Warning' };
    case 'CRITICAL':
      return { dot: 'sq-dot-critical', pill: 'sq-chip-critical', label: 'Critical' };
    default:
      return { dot: 'sq-dot-nodata', pill: 'sq-chip-nodata', label: 'Unknown' };
  }
}

/** Canonical brake condition shares the same 5-state model as tires. */
const brakeConditionStyle = tireStatusStyle;

const BRAKE_BASIS_LABEL: Record<string, string> = {
  MEASURED: 'Measured',
  DOCUMENTED: 'Documented',
  SENSOR: 'Sensor',
  ESTIMATED: 'Estimated',
  UNKNOWN: 'Unknown',
};

const BRAKE_CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  UNKNOWN: 'Unknown',
};

/** Render a remaining-life km band honestly — never false precision. */
function formatBrakeKmRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
  if (min != null && max != null) {
    return min === max ? `${fmt(min)} km` : `${fmt(min)}–${fmt(max)} km`;
  }
  const v = (min ?? max) as number;
  return `~${fmt(v)} km`;
}

/** Human "x days ago" for a measurement timestamp; honest about missing data. */
function formatMeasuredAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} mo ago`;
}

export function HealthErrorsView({ vehicleId, fuelType }: HealthErrorsViewProps) {
  const isEv = fuelType === 'Electric' || fuelType === 'PHEV';
  const { orgId, userRole } = useRentalOrg();
  const { health: rentalHealth, loading: rentalHealthLoading } = useEffectiveHealth(vehicleId ?? null);
  const { reloadHealth: reloadRentalHealth } = useFleetVehicles();
  const [showErrorCodes, setShowErrorCodes] = useState(false);
  const [showBattery, setShowBattery] = useState(false);
  const [showService, setShowService] = useState(false);
  const [showBrakes, setShowBrakes] = useState(false);
  const [showTires, setShowTires] = useState(false);
  const [showHvBattery, setShowHvBattery] = useState(false);
  const [showComplaintsModal, setShowComplaintsModal] = useState(false);
  // V4.7.59 — active auto-tasks (source INSIGHT_*) for this vehicle, shown as
  // a hint in the Service Info modal so operators see the materialized task.
  const [serviceAutoTasks, setServiceAutoTasks] = useState<Array<{ id: string; title: string; priority: string; category?: string | null }>>([]);
  const [complaints, setComplaints] = useState<VehicleComplaint[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintForm, setComplaintForm] = useState({ description: '', urgency: 'MEDIUM', region: '' });
  const [submittingComplaint, setSubmittingComplaint] = useState(false);
  const [batteryChartTab, setBatteryChartTab] = useState<'woche' | 'monat'>('woche');
  const [isModalAnimating, setIsModalAnimating] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [expandedErrorIndex, setExpandedErrorIndex] = useState<number | null>(null);
  const [dtcRetrying, setDtcRetrying] = useState<Record<string, boolean>>({});
  const dtcPollCountRef = useRef(0);

  const [healthSummary, setHealthSummary] = useState<HealthSummaryResponse | null>(null);
  const [aiHealthCare, setAiHealthCare] = useState<import('../../lib/api').AiHealthCareResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [dtcList, setDtcList] = useState<any[]>([]);
  const [activeDtcCount, setActiveDtcCount] = useState(0);
  const [activeDtcList, setActiveDtcList] = useState<any[]>([]);
  const [lastDtcChecked, setLastDtcChecked] = useState<string | null>(null);
  const [dtcSummary, setDtcSummary] = useState<any>(null);
  const [dtcDetail, setDtcDetail] = useState<any>(null);
  const [dtcDetailLoading, setDtcDetailLoading] = useState(false);
  const [batteryLatest, setBatteryLatest] = useState<any>(null);
  const [batteryTrend, setBatteryTrend] = useState<any[]>([]);
  const [batterySummary, setBatterySummary] = useState<BatteryHealthSummary | null>(null);
  const [batteryDetail, setBatteryDetail] = useState<BatteryHealthDetail | null>(null);
  const [brakesData, setBrakesData] = useState<any>(null);
  const [brakeHealthSummary, setBrakeHealthSummary] = useState<BrakeHealthSummaryType | null>(null);
  const [brakeHealthDetail, setBrakeHealthDetail] = useState<BrakeHealthDetail | null>(null);
  const [showBrakeEntry, setShowBrakeEntry] = useState(false);
  const [brakeEntryMode, setBrakeEntryMode] = useState<'manual' | 'upload' | null>(null);
  const [brakeForm, setBrakeForm] = useState({ date: '', odometerKm: '', workshopName: '', notes: '', frontPadMm: '', rearPadMm: '', frontRotorWidthMm: '', rearRotorWidthMm: '' });
  const [submittingBrake, setSubmittingBrake] = useState(false);
  const [tripProfile, setTripProfile] = useState<TripProfile | null>(null);
  const [tiresData, setTiresData] = useState<any>(null);
  const [tireWear, setTireWear] = useState<TireWearAnalysis | null>(null);
  const [tireHealth, setTireHealth] = useState<TireHealthSummaryResponse | null>(null);
  const [tireDetail, setTireDetail] = useState<TireHealthDetailResponse | null>(null);
  const [tireDetailLoading, setTireDetailLoading] = useState(false);
  const [showMeasurement, setShowMeasurement] = useState(false);
  const [measurementMode, setMeasurementMode] = useState<'manual' | 'upload' | null>(null);
  const [manualMeasurement, setManualMeasurement] = useState({ fl: '', fr: '', rl: '', rr: '', odometer: '', workshop: '' });
  const [submittingMeasurement, setSubmittingMeasurement] = useState(false);
  const [showRotation, setShowRotation] = useState(false);
  const [rotationTemplate, setRotationTemplate] = useState('front_to_rear');
  const [rotationOdometer, setRotationOdometer] = useState('');
  const [rotationNotes, setRotationNotes] = useState('');
  const [submittingRotation, setSubmittingRotation] = useState(false);
  const [showTireChange, setShowTireChange] = useState(false);
  const [tireChangeScope, setTireChangeScope] = useState<'single' | 'axle' | 'full_set'>('full_set');
  const [tireChangePositions, setTireChangePositions] = useState<string[]>([]);
  const [tireChangeOdometer, setTireChangeOdometer] = useState('');
  const [tireChangeNotes, setTireChangeNotes] = useState('');
  const [submittingTireChange, setSubmittingTireChange] = useState(false);
  const [activatingStoredSetId, setActivatingStoredSetId] = useState<string | null>(null);
  const [storedActivationOdometer, setStoredActivationOdometer] = useState('');
  const [tireModalTab, setTireModalTab] = useState<'overview' | 'history' | 'factors'>('overview');
  const [showEditSetup, setShowEditSetup] = useState(false);
  const [editSetupForm, setEditSetupForm] = useState({ frontDimension: '', rearDimension: '', brandModelFront: '', brandModelRear: '', tireSeason: '', treadFL: '', treadFR: '', treadBL: '', treadBR: '', tireCondition: '' as '' | 'NEW_INSTALLED' | 'ALREADY_MOUNTED', loadIndex: '', speedIndex: '' });
  const [submittingEditSetup, setSubmittingEditSetup] = useState(false);

  // ── AI Tire Spec fetch state ──
  const [aiTireLoading, setAiTireLoading] = useState(false);
  const [aiTireSteps, setAiTireSteps] = useState<AgentStep[]>([]);
  const [aiTireLiveStep, setAiTireLiveStep] = useState('');
  const [aiTireResult, setAiTireResult] = useState<Record<string, unknown> | null>(null);
  const [aiTireError, setAiTireError] = useState('');
  const [aiTireDegraded, setAiTireDegraded] = useState(false);
  const [aiTireCountdown, setAiTireCountdown] = useState(0);
  const [aiTireApplying, setAiTireApplying] = useState(false);
  const aiTireAbortRef = useRef<AbortController | null>(null);
  const aiTireCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [vehicleYear, setVehicleYear] = useState<number | null>(null);

  const [serviceInfo, setServiceInfo] = useState<ServiceInfoStatus | null>(null);
  const [hmTirePressure, setHmTirePressure] = useState<import('../../lib/api').HmTirePressureSignals | null>(null);

  const [hvBatteryStatus, setHvBatteryStatus] = useState<HvBatteryStatus | null>(null);

  useEffect(() => {
    if (!vehicleId) return;
    setHealthLoading(true);
    api.vehicleIntelligence.healthSummary(vehicleId).then(setHealthSummary).catch(() => null).finally(() => setHealthLoading(false));
    api.vehicleIntelligence.aiHealthCare(vehicleId).then(setAiHealthCare).catch(() => null);
    api.vehicleIntelligence.dtc(vehicleId).then(d => setDtcList(Array.isArray(d) ? d : [])).catch(() => []);
    api.vehicleIntelligence.dtcActive(vehicleId).then(d => {
      const list = Array.isArray(d) ? d : [];
      setActiveDtcList(list);
      setActiveDtcCount(list.length);
    }).catch(() => { setActiveDtcList([]); setActiveDtcCount(0); });
    api.vehicleIntelligence.dtcStats(vehicleId).then((s: any) => {
      if (s?.lastChecked) setLastDtcChecked(s.lastChecked);
    }).catch(() => null);
    api.vehicleIntelligence.dtcSummary(vehicleId).then(setDtcSummary).catch(() => null);
    api.vehicleIntelligence.batteryHealthDetail(vehicleId).then((detail) => {
      if (!detail) {
        setBatteryDetail(null);
        setBatterySummary(null);
        setBatteryLatest(null);
        setBatteryTrend([]);
        setHvBatteryStatus(null);
        return;
      }

      setBatteryDetail(detail);
      setBatterySummary(detail);
      setBatteryLatest(detail.currentState ?? null);
      const trendSeed = batteryChartTab === 'monat' ? detail.trend30 : detail.trend7;
      setBatteryTrend(
        Array.isArray(trendSeed)
          ? trendSeed.map((t) => ({
              recordedAt: t.date,
              voltageV: t.voltage,
              sohPercent: t.soh,
            }))
          : [],
      );

      if (detail.support?.hv && isEv) {
        setHvBatteryStatus({
          isEv: true,
          nominalCapacityKwh: detail.hv?.telemetry?.grossCapacityKwh ?? null,
          currentSocPercent: detail.hv?.telemetry?.socPercent ?? null,
          estimatedRangeKm: detail.hv?.telemetry?.rangeKm ?? null,
          sohPercent: detail.hv?.healthPercent ?? null,
          rawSohPercent: detail.hv?.healthPercent ?? null,
          publishedSohPercent: detail.hv?.healthPercent ?? null,
          providerReportedSohPercent: detail.hv?.telemetry?.providerSohPercent ?? null,
          sohMethod: detail.hv?.method ?? 'estimate_unavailable',
          sohSourceType: detail.hv?.evidenceType ?? null,
          publicationState: detail.hv?.publicationState ?? 'INITIAL_CALIBRATION',
          publicationMethod: detail.hv?.method ?? 'estimate_unavailable',
          maturityConfidence: detail.hv?.confidence ?? 'none',
          validEstimateCount: 0,
          sohInterpretation: detail.hv?.interpretation ?? {
            label: 'Unknown',
            color: 'gray',
            description: 'Insufficient data.',
          },
          estimatedCurrentCapacityKwh: null,
          snapshotCount: detail.hv?.snapshotCount ?? 0,
          chargingSessions: detail.detail?.hv?.chargingSessions ?? [],
          recentTrend: detail.detail?.hv?.recentTrend ?? [],
          lastRecordedAt: detail.hv?.freshness?.observedAt ?? null,
          telemetry: {
            temperatureC: detail.hv?.telemetry?.temperatureC ?? null,
            chargingPowerKw: detail.hv?.telemetry?.chargingPowerKw ?? null,
            isCharging: detail.hv?.telemetry?.isCharging ?? null,
            chargingCableConnected: detail.hv?.telemetry?.chargingCableConnected ?? null,
            currentVoltageV: detail.hv?.telemetry?.currentVoltageV ?? null,
            currentEnergyKwh: detail.hv?.telemetry?.currentEnergyKwh ?? null,
            addedEnergyKwh: detail.hv?.telemetry?.addedEnergyKwh ?? null,
          },
          providerSohObservedAt: detail.hv?.freshness?.observedAt ?? null,
          canonical: detail.hv,
          currentTelemetry: detail.currentTelemetry,
        });
      } else {
        setHvBatteryStatus(null);
      }
    }).catch(() => null);
    api.vehicleIntelligence.brakes(vehicleId).then(setBrakesData).catch(() => null);
    api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeHealthSummary).catch(() => null);
    api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null);
    api.vehicleIntelligence.tires(vehicleId).then(setTiresData).catch(() => null);
    api.vehicleIntelligence.tireWearAnalysis(vehicleId).then(setTireWear).catch(() => null);
    api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTireHealth).catch(() => null);
    api.vehicleIntelligence.serviceInfoStatus(vehicleId).then(setServiceInfo).catch(() => null);
    api.vehicleIntelligence.hmVehicleHealth(vehicleId).then(d => {
      if (d?.tirePressure) setHmTirePressure(d.tirePressure);
    }).catch(() => null);
    api.vehicleIntelligence.tripProfile(vehicleId).then(setTripProfile).catch(() => null);
    api.vehicles.get(vehicleId).then((v: any) => {
      if (v?.year) setVehicleYear(v.year);
    }).catch(() => null);
  }, [vehicleId, isEv]);

  useEffect(() => {
    if (!batteryDetail) {
      setBatteryTrend([]);
      return;
    }
    const source = batteryChartTab === 'monat' ? batteryDetail.trend30 : batteryDetail.trend7;
    setBatteryTrend(
      Array.isArray(source)
        ? source.map((t) => ({
            recordedAt: t.date,
            voltageV: t.voltage,
            sohPercent: t.soh,
          }))
        : [],
    );
  }, [batteryDetail, batteryChartTab]);

  useEffect(() => {
    if (!vehicleId || !orgId) {
      setComplaints([]);
      return;
    }
    setComplaintsLoading(true);
    api.vehicles
      .listComplaints(orgId, vehicleId)
      .then(setComplaints)
      .catch(() => setComplaints([]))
      .finally(() => setComplaintsLoading(false));
  }, [vehicleId, orgId]);

  // Load active auto-tasks for this vehicle when the Service modal opens.
  // Filters to system-generated tasks (source INSIGHT_*) that are still open.
  useEffect(() => {
    if (!showService || !vehicleId || !orgId) {
      setServiceAutoTasks([]);
      return;
    }
    let cancelled = false;
    api.tasks
      .list(orgId)
      .then((rows: any[]) => {
        if (cancelled) return;
        const list = (Array.isArray(rows) ? rows : []).filter(
          (t) =>
            t.vehicleId === vehicleId &&
            typeof t.source === 'string' &&
            t.source.startsWith('INSIGHT_') &&
            t.status !== 'DONE' &&
            t.status !== 'CANCELLED',
        );
        setServiceAutoTasks(list);
      })
      .catch(() => { if (!cancelled) setServiceAutoTasks([]); });
    return () => { cancelled = true; };
  }, [showService, vehicleId, orgId]);

  // Reusable DTC detail loader (used for the initial open + silent polling).
  const loadDtcDetail = useCallback(
    (opts?: { silent?: boolean }) => {
      if (!vehicleId) return Promise.resolve();
      if (!opts?.silent) setDtcDetailLoading(true);
      return api.vehicleIntelligence
        .dtcDetail(vehicleId)
        .then(setDtcDetail)
        .catch(() => null)
        .finally(() => {
          if (!opts?.silent) setDtcDetailLoading(false);
        });
    },
    [vehicleId],
  );

  // Load DTC detail lazily when the Error Codes modal opens
  useEffect(() => {
    if (!showErrorCodes || !vehicleId) return;
    dtcPollCountRef.current = 0;
    loadDtcDetail();
  }, [showErrorCodes, vehicleId, loadDtcDetail]);

  // Poll quietly in the background while any active fault's AI knowledge is
  // still being prepared (QUEUED/PROCESSING). Bounded so it never polls forever;
  // the DTC itself is always visible regardless of knowledge state.
  useEffect(() => {
    if (!showErrorCodes || !vehicleId || !dtcDetail) return;
    const faults: any[] = dtcDetail?.currentFaults?.activeFaults ?? [];
    const pending = faults.some(
      (f) =>
        f?.knowledge &&
        (f.knowledge.status === 'QUEUED' || f.knowledge.status === 'PROCESSING'),
    );
    if (!pending || dtcPollCountRef.current >= 40) return;
    const t = setTimeout(() => {
      dtcPollCountRef.current += 1;
      loadDtcDetail({ silent: true });
    }, 6000);
    return () => clearTimeout(t);
  }, [showErrorCodes, vehicleId, dtcDetail, loadDtcDetail]);

  // Admin-only manual retry of AI knowledge enrichment for a single DTC code.
  const handleRetryKnowledge = useCallback(
    async (code: string) => {
      if (!vehicleId || !code) return;
      setDtcRetrying((m) => ({ ...m, [code]: true }));
      try {
        await api.vehicleIntelligence.dtcKnowledgeRetry(vehicleId, code);
        dtcPollCountRef.current = 0;
        await loadDtcDetail({ silent: true });
      } catch {
        /* keep DTC visible; surface nothing destructive */
      } finally {
        setDtcRetrying((m) => ({ ...m, [code]: false }));
      }
    },
    [vehicleId, loadDtcDetail],
  );

  const isOrgAdmin = userRole === 'ORG_ADMIN';

  // Renders the AI knowledge panel under an active DTC card. Pure presentation —
  // the DTC itself always renders regardless of knowledge state.
  const renderDtcKnowledge = (dtc: any, index: number) => {
    const k = dtc?.knowledge as DtcKnowledgeDto | undefined;
    if (!k) return null;
    const isExpanded = expandedErrorIndex === index;

    const urgDe: Record<string, string> = { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch', CRITICAL: 'Kritisch', UNKNOWN: 'Unbekannt' };
    const recDe: Record<string, string> = {
      RENTABLE: 'Vermietbar',
      CHECK_BEFORE_NEXT_RENTAL: 'Vor nächster Vermietung prüfen',
      BLOCK_UNTIL_INSPECTED: 'Sperren bis geprüft',
      DO_NOT_RENT: 'Nicht vermieten',
      UNKNOWN: 'Unbekannt',
    };
    const urgCls = (u?: string) =>
      ({
        CRITICAL: 'sq-chip-critical',
        HIGH: 'sq-chip-warning',
        MEDIUM: 'sq-chip-watch',
        LOW: 'sq-chip-info',
      }[u ?? 'UNKNOWN'] ?? ('sq-chip-neutral'));
    const recCls = (r?: string) =>
      ({
        DO_NOT_RENT: 'sq-chip-critical',
        BLOCK_UNTIL_INSPECTED: 'sq-chip-warning',
        CHECK_BEFORE_NEXT_RENTAL: 'sq-chip-watch',
        RENTABLE: 'sq-chip-success',
      }[r ?? 'UNKNOWN'] ?? ('sq-chip-neutral'));
    const label = (text: string) => (
      <p className={`text-[10px] uppercase tracking-wider mb-1 text-muted-foreground/70`}>{text}</p>
    );
    const wrap = (inner: ReactNode) => (
      <div className={`mt-3 ml-5 pt-3 border-t ${'border-border'}`}>
        <p className={`text-[9px] uppercase tracking-widest font-bold mb-2 ${'text-[color:var(--brand)]'}`}>
          AI-Einschätzung · DTC Knowledge
        </p>
        {inner}
      </div>
    );

    if (k.status === 'QUEUED' || k.status === 'PROCESSING') {
      return wrap(
        <div className="flex items-center gap-2">
          <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          <div>
            <p className="text-xs font-medium text-foreground/80">AI-Erklärung wird vorbereitet …</p>
            <p className="text-[11px] text-muted-foreground">Der Fehlercode bleibt sichtbar; die Erklärung wird im Hintergrund ergänzt.</p>
          </div>
        </div>,
      );
    }

    if (k.status === 'FAILED') {
      return wrap(
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-3.5 h-3.5 ${'text-[color:var(--status-watch)]'}`} />
            <p className="text-xs text-muted-foreground">Erklärung konnte noch nicht erstellt werden.</p>
          </div>
          {isOrgAdmin && (
            <button
              type="button"
              onClick={() => handleRetryKnowledge(dtc.code)}
              disabled={!!dtcRetrying[dtc.code]}
              className={`text-[11px] px-2 py-1 rounded-md font-medium ${'bg-muted text-foreground hover:bg-muted/80'} disabled:opacity-50`}
            >
              {dtcRetrying[dtc.code] ? 'Wird erneut versucht …' : 'Erneut versuchen'}
            </button>
          )}
        </div>,
      );
    }

    if (k.status === 'MISSING') {
      return wrap(<p className="text-xs text-muted-foreground">Noch keine Erklärung vorhanden.</p>);
    }

    // READY
    const causes = k.possibleCauses ?? [];
    const effects = k.possibleEffects ?? [];
    const sources = k.sources ?? [];
    return wrap(
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className={`w-3.5 h-3.5 ${'text-[color:var(--brand)]'}`} />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">SynqDrive DTC Knowledge Base</span>
            {k.source === 'VEHICLE_SPECIFIC' && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${'sq-tone-brand'}`}>Fahrzeugspezifisch</span>
            )}
            {k.needsReview && (
              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${'sq-chip-watch'}`}>Prüfung empfohlen</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpandedErrorIndex(isExpanded ? null : index)}
            className={`text-[11px] font-medium shrink-0 ${'text-[color:var(--brand)] hover:opacity-80'}`}
          >
            {isExpanded ? 'Weniger' : 'Mehr anzeigen'}
          </button>
        </div>

        {k.title && <p className="text-xs font-semibold text-foreground mb-1">{k.title}</p>}
        {k.shortDescription && <p className="text-xs text-foreground/80 mb-2 leading-relaxed">{k.shortDescription}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${recCls(k.rentalRecommendation)}`}>
            Vermietung: {recDe[k.rentalRecommendation ?? 'UNKNOWN']}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${urgCls(k.technicalUrgency)}`}>
            AI technisch: {urgDe[k.technicalUrgency ?? 'UNKNOWN']}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${urgCls(k.rentalUrgency)}`}>
            AI Rental: {urgDe[k.rentalUrgency ?? 'UNKNOWN']}
          </span>
        </div>

        {isExpanded && (
          <div className="mt-3 space-y-3">
            {causes.length > 0 && (
              <div>
                {label('Mögliche Ursachen')}
                <ul className="list-disc list-inside space-y-0.5">
                  {causes.map((c, ci) => (
                    <li key={ci} className="text-xs text-foreground/80">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {effects.length > 0 && (
              <div>
                {label('Mögliche Folgen')}
                <ul className="list-disc list-inside space-y-0.5">
                  {effects.map((c, ci) => (
                    <li key={ci} className="text-xs text-foreground/80">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {k.recommendedAction && (
              <div>
                {label('Empfehlung für Vermietung')}
                <p className="text-xs text-foreground/80 leading-relaxed">{k.recommendedAction}</p>
              </div>
            )}
            {sources.length > 0 && (
              <div>
                {label('Quellen')}
                <ul className="space-y-0.5">
                  {sources.map((s, si) => (
                    <li key={si} className="text-xs">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className={`underline ${'text-[color:var(--brand)] hover:opacity-80'}`}>
                          {s.title || s.url}
                        </a>
                      ) : (
                        <span className="text-foreground/70">{s.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {k.lastVerifiedAt && (
              <p className="text-[10px] text-muted-foreground/70">
                Zuletzt geprüft: {new Date(k.lastVerifiedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            )}
            {isOrgAdmin && (
              <button
                type="button"
                onClick={() => handleRetryKnowledge(dtc.code)}
                disabled={!!dtcRetrying[dtc.code]}
                className={`text-[11px] px-2 py-1 rounded-md font-medium ${'bg-muted text-foreground hover:bg-muted/80'} disabled:opacity-50`}
              >
                {dtcRetrying[dtc.code] ? 'Aktualisiere …' : 'Neu generieren'}
              </button>
            )}
          </div>
        )}
      </div>,
    );
  };

  const refreshHealth = () => {
    if (!vehicleId) return;
    reloadRentalHealth();
    setHealthLoading(true);
    api.vehicleIntelligence.healthSummary(vehicleId).then(setHealthSummary).catch(() => null).finally(() => setHealthLoading(false));
    api.vehicleIntelligence.aiHealthCare(vehicleId).then(setAiHealthCare).catch(() => null);
  };

  const refreshTireWear = useCallback(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.tireWearAnalysis(vehicleId).then(setTireWear).catch(() => null);
    api.vehicleIntelligence.tires(vehicleId).then(setTiresData).catch(() => null);
    api.vehicleIntelligence.tireHealthSummary(vehicleId).then(setTireHealth).catch(() => null);
    if (tireDetail) {
      api.vehicleIntelligence.tireHealthDetail(vehicleId).then(setTireDetail).catch(() => null);
    }
  }, [vehicleId, tireDetail]);

  const loadTireDetail = useCallback(() => {
    if (!vehicleId) return;
    setTireDetailLoading(true);
    api.vehicleIntelligence.tireHealthDetail(vehicleId)
      .then(setTireDetail)
      .catch(() => null)
      .finally(() => setTireDetailLoading(false));
  }, [vehicleId]);

  const resolveActiveSetup = useCallback((setupsRaw: any): any | null => {
    const setups = Array.isArray(setupsRaw) ? setupsRaw : [];
    return (
      setups.find((s: any) => s?.status === 'ACTIVE' && !s?.removedAt) ??
      setups.find((s: any) => s?.status === 'ACTIVE') ??
      setups.find((s: any) => !s?.removedAt) ??
      setups[0] ??
      null
    );
  }, []);

  const handleRotateTires = async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    setSubmittingRotation(true);
    try {
      await api.vehicleIntelligence.rotateTires(vehicleId, {
        template: rotationTemplate,
        odometerKm: rotationOdometer ? parseFloat(rotationOdometer) : undefined,
        notes: rotationNotes || undefined,
      });
      setShowRotation(false);
      setRotationTemplate('front_to_rear');
      setRotationOdometer('');
      setRotationNotes('');
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to rotate tires. Please try again.');
    }
    setSubmittingRotation(false);
  };

  const toggleTireChangePosition = useCallback((position: string) => {
    setTireChangePositions((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position],
    );
  }, []);

  const handleConfirmTireChange = useCallback(async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    setSubmittingTireChange(true);
    try {
      await api.vehicleIntelligence.changeTires(vehicleId, {
        scope: tireChangeScope,
        positions: tireChangeScope === 'full_set' ? undefined : tireChangePositions,
        odometerKm: tireChangeOdometer ? parseFloat(tireChangeOdometer) : undefined,
        notes: tireChangeNotes || undefined,
      });
      setShowTireChange(false);
      setTireChangeScope('full_set');
      setTireChangePositions([]);
      setTireChangeOdometer('');
      setTireChangeNotes('');
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to change tires.');
    }
    setSubmittingTireChange(false);
  }, [
    vehicleId,
    tireChangeScope,
    tireChangePositions,
    tireChangeOdometer,
    tireChangeNotes,
    refreshTireWear,
    loadTireDetail,
  ]);

  const handleActivateStoredSet = useCallback(async () => {
    if (!vehicleId || !activatingStoredSetId) return;
    setTireActionError(null);
    setSubmittingTireChange(true);
    try {
      await api.vehicleIntelligence.activateStoredTireSet(vehicleId, {
        storedSetupId: activatingStoredSetId,
        odometerKm: storedActivationOdometer ? parseFloat(storedActivationOdometer) : undefined,
      });
      setActivatingStoredSetId(null);
      setStoredActivationOdometer('');
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to activate stored tire set.');
    }
    setSubmittingTireChange(false);
  }, [
    vehicleId,
    activatingStoredSetId,
    storedActivationOdometer,
    refreshTireWear,
    loadTireDetail,
  ]);

  const submitComplaint = useCallback(async () => {
    if (!vehicleId || !orgId || !complaintForm.description.trim()) return;
    setSubmittingComplaint(true);
    try {
      await api.vehicles.createComplaint(orgId, vehicleId, {
        description: complaintForm.description.trim(),
        urgency: complaintForm.urgency,
        region: complaintForm.region.trim() || null,
      });
      const list = await api.vehicles.listComplaints(orgId, vehicleId);
      setComplaints(list);
      setComplaintForm({ description: '', urgency: 'MEDIUM', region: '' });
    } catch {
      /* keep form */
    }
    setSubmittingComplaint(false);
  }, [vehicleId, orgId, complaintForm]);

  const [tireActionError, setTireActionError] = useState<string | null>(null);

  const handleSubmitMeasurement = async () => {
    if (!vehicleId) return;
    setTireActionError(null);
    const activeSetup = resolveActiveSetup(tiresData);
    if (!activeSetup) {
      setTireActionError('No active tire setup found. Please add tire information first.');
      return;
    }
    const hasAnyValue = manualMeasurement.fl || manualMeasurement.fr || manualMeasurement.rl || manualMeasurement.rr;
    if (!hasAnyValue) {
      setTireActionError('Please enter at least one tread depth value.');
      return;
    }
    setSubmittingMeasurement(true);
    try {
      await api.vehicleIntelligence.addTireHealthMeasurement(vehicleId, {
        frontLeftMm: manualMeasurement.fl ? parseFloat(manualMeasurement.fl) : undefined,
        frontRightMm: manualMeasurement.fr ? parseFloat(manualMeasurement.fr) : undefined,
        rearLeftMm: manualMeasurement.rl ? parseFloat(manualMeasurement.rl) : undefined,
        rearRightMm: manualMeasurement.rr ? parseFloat(manualMeasurement.rr) : undefined,
        odometerKm: manualMeasurement.odometer ? parseFloat(manualMeasurement.odometer) : undefined,
        source: 'manual',
        workshopName: manualMeasurement.workshop || undefined,
      });
      setShowMeasurement(false);
      setMeasurementMode(null);
      setManualMeasurement({ fl: '', fr: '', rl: '', rr: '', odometer: '', workshop: '' });
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to save measurement. Please try again.');
    }
    setSubmittingMeasurement(false);
  };

  const handleOpenEditSetup = useCallback(() => {
    const active = resolveActiveSetup(tiresData);
    setEditSetupForm({
      frontDimension: active?.frontDimension ?? '',
      rearDimension: active?.rearDimension ?? '',
      brandModelFront: active?.brandModelFront ?? '',
      brandModelRear: active?.brandModelRear ?? '',
      tireSeason: active?.tireSeason ?? '',
      treadFL: '', treadFR: '', treadBL: '', treadBR: '',
      tireCondition: active?.tireCondition === 'NEW_INSTALLED' ? 'NEW_INSTALLED' : active?.tireCondition === 'ALREADY_MOUNTED' ? 'ALREADY_MOUNTED' : '',
      loadIndex: active?.loadIndex ?? '',
      speedIndex: active?.speedIndex ?? '',
    });
    handleDiscardAiTireSpec();
    setShowEditSetup(true);
  }, [tiresData, resolveActiveSetup]);

  const handleSaveEditSetup = async () => {
    if (!vehicleId || !orgId) return;
    setTireActionError(null);
    setSubmittingEditSetup(true);
    try {
      const parseOpt = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };
      await api.vehicles.upsertTires(orgId, vehicleId, {
        frontDimension: editSetupForm.frontDimension.trim() || undefined,
        rearDimension: editSetupForm.rearDimension.trim() || undefined,
        brandModelFront: editSetupForm.brandModelFront.trim() || undefined,
        brandModelRear: editSetupForm.brandModelRear.trim() || undefined,
        tireSeason: editSetupForm.tireSeason || undefined,
        loadIndexFront: editSetupForm.loadIndex.trim() || undefined,
        speedIndexFront: editSetupForm.speedIndex.trim() || undefined,
        tireCondition: editSetupForm.tireCondition || undefined,
        treadFL: parseOpt(editSetupForm.treadFL),
        treadFR: parseOpt(editSetupForm.treadFR),
        treadBL: parseOpt(editSetupForm.treadBL),
        treadBR: parseOpt(editSetupForm.treadBR),
      });
      setShowEditSetup(false);
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to save tire setup. Please try again.');
    }
    setSubmittingEditSetup(false);
  };

  // ── AI Tire Spec fetch logic ────────────────────────────────────────────────

  const aiTireSpecFieldsReady = Boolean(
    editSetupForm.brandModelFront.trim() &&
    editSetupForm.frontDimension.trim() &&
    editSetupForm.loadIndex.trim() &&
    editSetupForm.speedIndex.trim() &&
    vehicleYear,
  );

  const handleFetchAiTireSpec = useCallback(() => {
    if (!aiTireSpecFieldsReady) return;

    // Abort previous
    if (aiTireAbortRef.current) aiTireAbortRef.current.abort();
    if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);

    // Reset state
    setAiTireLoading(true);
    setAiTireSteps([]);
    setAiTireLiveStep('');
    setAiTireResult(null);
    setAiTireError('');
    setAiTireDegraded(false);
    setAiTireCountdown(30);

    // Start countdown
    aiTireCountdownRef.current = setInterval(() => {
      setAiTireCountdown(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    // Parse brand/model from combined field
    const parts = editSetupForm.brandModelFront.trim().split(/\s+/);
    const brand = parts[0] || '';
    const model = parts.slice(1).join(' ') || '';

    const controller = streamAiTireSpecs(
      {
        brand,
        model,
        year: vehicleYear ? String(vehicleYear) : undefined,
        tireSize: editSetupForm.frontDimension.trim(),
        loadIndex: editSetupForm.loadIndex.trim(),
        speedIndex: editSetupForm.speedIndex.trim(),
      },
      (evt: AiTireSpecsStreamEvent) => {
        if (evt.event === 'step') {
          setAiTireSteps(prev => {
            const existing = prev.findIndex(s => s.step === evt.data.step);
            if (existing >= 0) {
              const copy = [...prev];
              copy[existing] = evt.data;
              return copy;
            }
            return [...prev, evt.data];
          });
          if (evt.data.status === 'working') setAiTireLiveStep(evt.data.step);
        } else if (evt.event === 'progress') {
          if (evt.data.content) setAiTireLiveStep(evt.data.content);
        } else if (evt.event === 'result') {
          if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
          setAiTireCountdown(0);
          if (evt.data.degraded) {
            setAiTireDegraded(true);
          }
          setAiTireResult(evt.data.specs);
          setAiTireLoading(false);
        } else if (evt.event === 'error') {
          if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
          setAiTireCountdown(0);
          setAiTireError(evt.data.message || 'AI Tire Spec fetch failed');
          setAiTireLoading(false);
        }
      },
      () => {
        if (aiTireCountdownRef.current) clearInterval(aiTireCountdownRef.current);
        setAiTireLoading(false);
      },
    );
    aiTireAbortRef.current = controller;
  }, [aiTireSpecFieldsReady, editSetupForm.brandModelFront, editSetupForm.frontDimension, editSetupForm.loadIndex, editSetupForm.speedIndex, vehicleYear]);

  const handleApplyAiTireSpec = async () => {
    if (!vehicleId || !aiTireResult) return;
    setAiTireApplying(true);
    try {
      await api.vehicleIntelligence.applyAiTireSpec(vehicleId, { aiTireSpec: aiTireResult });
      setAiTireResult(null);
      refreshTireWear();
      loadTireDetail();
    } catch (err: any) {
      setTireActionError(err?.message || 'Failed to apply AI tire spec');
    }
    setAiTireApplying(false);
  };

  const handleDiscardAiTireSpec = () => {
    setAiTireResult(null);
    setAiTireError('');
    setAiTireDegraded(false);
    setAiTireSteps([]);
    setAiTireLiveStep('');
  };

  const refreshBrakeHealth = useCallback(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.brakeHealthSummary(vehicleId).then(setBrakeHealthSummary).catch(() => null);
    api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null);
  }, [vehicleId]);

  const handleLogBrakeChange = async () => {
    if (!vehicleId || !brakeForm.date) return;
    setSubmittingBrake(true);
    try {
      await api.vehicleIntelligence.recordBrakeService(vehicleId, {
        serviceDate: new Date(brakeForm.date).toISOString(),
        odometerKm: brakeForm.odometerKm ? parseInt(brakeForm.odometerKm, 10) : undefined,
        workshopName: brakeForm.workshopName || undefined,
        notes: brakeForm.notes || undefined,
        source: 'manual',
        kind: 'full_brake_service',
        measured: {
          frontPadMm: brakeForm.frontPadMm ? parseFloat(brakeForm.frontPadMm) : undefined,
          rearPadMm: brakeForm.rearPadMm ? parseFloat(brakeForm.rearPadMm) : undefined,
          frontDiscMm: brakeForm.frontRotorWidthMm ? parseFloat(brakeForm.frontRotorWidthMm) : undefined,
          rearDiscMm: brakeForm.rearRotorWidthMm ? parseFloat(brakeForm.rearRotorWidthMm) : undefined,
        },
        initializeIfPossible: true,
      });
      setShowBrakeEntry(false);
      setBrakeEntryMode(null);
      setBrakeForm({ date: '', odometerKm: '', workshopName: '', notes: '', frontPadMm: '', rearPadMm: '', frontRotorWidthMm: '', rearRotorWidthMm: '' });
      refreshBrakeHealth();
    } catch { /* error */ }
    setSubmittingBrake(false);
  };

  const openModal = (setter: (v: boolean) => void) => {
    setter(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsModalAnimating(true);
      });
    });
  };

  const closeModal = (setter: (v: boolean) => void) => {
    setIsModalAnimating(false);
    setIsModalClosing(true);
    setTimeout(() => {
      setter(false);
      setIsModalClosing(false);
    }, 400);
  };

  const anyModalOpen = showErrorCodes || showBattery || showService || showBrakes || showTires || showHvBattery || showComplaintsModal;

  const formatRelativeTime = (iso: string | null | undefined): string => {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const errorCodesHistory = dtcList.length > 0
    ? dtcList.map((d: any) => {
        const ts = d.firstSeenAt ?? d.lastSeenAt ?? d.createdAt;
        return {
          date: ts ? new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—',
          code: d.dtcCode ?? d.code ?? '',
          time: ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
          severity: ((d.severity ?? 'WARNING').toLowerCase() === 'warning' ? 'medium' : (d.severity ?? 'medium').toLowerCase()) as 'low' | 'medium' | 'high' | 'critical',
          system: d.description ?? d.dtcCode ?? '',
          description: d.description ?? `DTC ${d.dtcCode ?? ''}`,
          mileage: '—',
          resolution: d.clearedAt ? 'Cleared' : '—',
          resolvedDate: d.clearedAt ? new Date(d.clearedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' }) : '—',
          technician: '—',
          workshop: '—',
          isActive: d.isActive ?? false,
          lastSeenAt: d.lastSeenAt,
        };
      })
    : [];

  const bSummary = batterySummary;
  const lvPubState = bSummary?.lv?.publicationState ?? bSummary?.currentState?.publicationState ?? 'INITIAL_CALIBRATION';
  const lvStatus = bSummary?.lv?.status ?? (lvPubState === 'INITIAL_CALIBRATION' ? 'calibrating' : lvPubState === 'STABILIZING' ? 'stabilizing' : 'ready');
  // Backend marks `status: 'estimate_unavailable'` when neither an LV voltage
  // reading nor a BatteryFeatures row exists — i.e. the vehicle has never
  // emitted a 12V/LV signal. We cross-check the telemetry fallbacks so the UI
  // never shows "No LV Battery detected" for a vehicle that actually reported
  // a voltage at some point (e.g. rare telemetry races).
  const lvNoBatteryDetected =
    lvStatus === 'estimate_unavailable'
    && (bSummary?.lv?.telemetry?.voltageV ?? null) == null
    && (bSummary?.currentState?.voltageV ?? null) == null
    && (bSummary?.currentTelemetry?.lvVoltageV ?? null) == null
    && (batteryLatest?.voltageV ?? null) == null;
  const lvIsCalibrating = !lvNoBatteryDetected && (lvStatus === 'calibrating' || lvPubState === 'INITIAL_CALIBRATION');
  const lvIsStabilizing = !lvNoBatteryDetected && (lvStatus === 'stabilizing' || lvPubState === 'STABILIZING');
  const voltageDisplay = bSummary?.lv?.telemetry?.voltageV?.toFixed(2) ?? bSummary?.currentState?.voltageV?.toFixed(2) ?? batteryLatest?.voltageV?.toFixed(2) ?? '—';
  // During calibration: show V2 estimated health with soft "estimate" indicator
  const calibrationEstimate: number | null = lvIsCalibrating
    ? (bSummary?.lv?.estimatedHealthPercent ?? bSummary?.currentState?.estimatedSohPct ?? null)
    : null;
  const batteryCondition = bSummary?.lv?.condition ?? bSummary?.condition ?? 'good';
  // LV "Estimated Battery Health" — behaviour-derived 3-bar indicator. The 12V
  // battery is never shown as a workshop-verified SOH %. We read the canonical
  // estimatedHealth block and fall back to the legacy condition only when the
  // (older) API shape is in play.
  const lvEstimatedHealth = bSummary?.lv?.estimatedHealth ?? null;
  const lvEstimatedStatus: BatteryHealthStatus =
    lvEstimatedHealth?.status ??
    (batteryCondition === 'good'
      ? 'GOOD'
      : batteryCondition === 'watch'
        ? 'WATCH'
        : batteryCondition === 'attention'
          ? 'WARNING'
          : 'UNKNOWN');
  const lvEstimatedBars: 0 | 1 | 2 | 3 =
    lvEstimatedHealth?.bars ??
    (lvEstimatedStatus === 'GOOD'
      ? 3
      : lvEstimatedStatus === 'WATCH'
        ? 2
        : lvEstimatedStatus === 'WARNING' || lvEstimatedStatus === 'CRITICAL'
          ? 1
          : 0);
  // LV resting voltage with battery-spec aware status (lead-acid / AGM / EFB;
  // lithium is UNSUPPORTED so no false lead-acid alert is shown).
  const lvResting = bSummary?.lv?.restingVoltage ?? null;
  const lvRestingValue: number | null =
    lvResting?.valueV ?? bSummary?.lv?.telemetry?.restingVoltage ?? null;
  const lvRestingStatus: BatteryRestingVoltageStatus = lvResting?.status ?? 'UNKNOWN';
  const lvBatteryTypeLabel = lvResting?.batteryType && lvResting.batteryType !== 'UNKNOWN'
    ? lvResting.batteryType.replace(/_/g, ' ')
    : bSummary?.specs?.batteryType ?? null;
  const lvEstimatedTooltip =
    'Estimated from resting voltage, crank drop, recovery and stability. This is not a workshop-verified SOH.';
  const batteryLastCheckedAgo = (() => {
    const lc = bSummary?.lv?.freshness?.observedAt ?? bSummary?.currentState?.lastChecked;
    if (!lc) return null;
    const ms = Date.now() - new Date(lc).getTime();
    if (ms < 60000) return 'just now';
    if (ms < 3600000) return `${Math.floor(ms / 60000)} min ago`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)} h ago`;
    return `${Math.floor(ms / 86400000)} d ago`;
  })();
  const lvCalibration = bSummary?.lv?.calibrationProgress ?? bSummary?.currentState?.calibrationProgress ?? null;
  const formatCalibrationDays = (days: number) => (days >= 1 ? `${Math.floor(days)}` : '<1');
  const calibrationPathLabel = lvCalibration?.measurementPath === 'rest_and_crank' ? 'Ruhe + Start' : 'Nur Ruhe';
  const calibrationStatusText = (() => {
    if (!lvIsCalibrating || !lvCalibration) return 'Ruhespannungsmessungen laufen';
    if (lvCalibration.daysRemainingForStabilizing > 0) {
      return `Wartet auf Mindestzeit: ${formatCalibrationDays(lvCalibration.daysSinceFirstMeasurement)}/${lvCalibration.minimumDaysForStabilizing} Tage`;
    }

    const blockers: string[] = [];
    if (lvCalibration.blockers.includes('qualified_events')) {
      blockers.push(`${lvCalibration.qualifiedEventCount}/${lvCalibration.minimumQualifiedEventsForStabilizing} Messereignisse`);
    }
    if (lvCalibration.blockers.includes('rest_observations')) {
      blockers.push(`${lvCalibration.restObservationCount}/${lvCalibration.minimumRestObservationsForStabilizing} Ruhespannungen`);
    }
    if (lvCalibration.blockers.includes('crank_observations') && lvCalibration.minimumCrankObservationsForStabilizing > 0) {
      blockers.push(`${lvCalibration.crankObservationCount}/${lvCalibration.minimumCrankObservationsForStabilizing} Startzyklen`);
    }
    if (blockers.length > 0) {
      return `5 Tage erreicht, aber noch zu wenig Daten: ${blockers.join(' · ')}`;
    }
    return 'Messwerte werden gerade verifiziert';
  })();
  const calibrationMetricsText = lvCalibration
    ? [
        `Pfad: ${calibrationPathLabel}`,
        `${lvCalibration.qualifiedEventCount}/${lvCalibration.minimumQualifiedEventsForStabilizing} Events`,
        `${lvCalibration.restObservationCount}/${lvCalibration.minimumRestObservationsForStabilizing} Ruhe`,
        ...(lvCalibration.minimumCrankObservationsForStabilizing > 0
          ? [`${lvCalibration.crankObservationCount}/${lvCalibration.minimumCrankObservationsForStabilizing} Starts`]
          : []),
      ].join(' · ')
    : null;
  const calibrationFreshnessText = (() => {
    if (!lvIsCalibrating) return null;
    if ((lvCalibration?.lastMeasurementAgeMs ?? null) != null && (lvCalibration?.lastMeasurementAgeMs ?? 0) >= 86400000 && batteryLastCheckedAgo) {
      return `Letzter frischer Messwert: ${batteryLastCheckedAgo}. Aktuell fehlen neue Messwerte.`;
    }
    if (voltageDisplay !== '—') {
      return `Spannung: ${voltageDisplay} V`;
    }
    return null;
  })();
  const batteryChartData = batteryTrend.length > 0
    ? batteryTrend.map((d: any, i: number) => ({
        day: d.recordedAt
          ? new Date(d.recordedAt).toLocaleDateString(
              'de-DE',
              batteryChartTab === 'monat'
                ? { day: '2-digit', month: '2-digit' }
                : { weekday: 'short' },
            )
          : (batteryChartTab === 'monat' ? `${i + 1}` : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i % 7]),
        volt: d.voltageV ?? 0,
        time: d.recordedAt ? new Date(d.recordedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '',
      }))
    : [];

  const hs = aiHealthCare ?? healthSummary;

  // V4.7.28 — Vehicle Health Center status + findings now read Rental-Health-V1
  // (same source as Dashboard Fleet Status, FleetView and the detail header chip).
  // Module modals still load their own deep endpoints; only ampel / quick-card tones
  // and the roll-up list are canonical here.
  type FindingSeverity = 'critical' | 'warning';
  type RentalHealthFinding = {
    id: string;
    severity: FindingSeverity;
    icon: 'wrench' | 'calendar' | 'shield' | 'battery' | 'alert-circle' | 'disc' | 'circle' | 'bell' | 'message-square';
    title: string;
    detail: string;
    onClick?: () => void;
  };

  const moduleFindingIcon = (module: string): RentalHealthFinding['icon'] => {
    switch (module) {
      case 'service_compliance':
        return 'wrench';
      case 'battery':
        return 'battery';
      case 'error_codes':
        return 'alert-circle';
      case 'brakes':
        return 'disc';
      case 'tires':
        return 'circle';
      case 'complaints':
        return 'message-square';
      case 'vehicle_alerts':
        return 'bell';
      default:
        return 'alert-circle';
    }
  };

  const moduleFindingClick = (module: string): (() => void) | undefined => {
    switch (module) {
      case 'service_compliance':
        return () => setShowService(true);
      case 'battery':
        return () => setShowBattery(true);
      case 'error_codes':
        return () => openModal(setShowErrorCodes);
      case 'brakes':
        return () => {
          openModal(setShowBrakes);
          if (vehicleId) {
            api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null);
          }
        };
      case 'tires':
        return () => {
          setTireActionError(null);
          openModal(setShowTires);
          loadTireDetail();
        };
      case 'complaints':
        return () => openModal(setShowComplaintsModal);
      default:
        return undefined;
    }
  };

  const rentalFindings = useMemo<RentalHealthFinding[]>(() => {
    if (!rentalHealth) return [];
    const out: RentalHealthFinding[] = collectRentalHealthReasons(rentalHealth).map((r) => ({
      id: r.module,
      severity: r.state === 'critical' ? 'critical' : 'warning',
      icon: moduleFindingIcon(r.module),
      title: r.label,
      detail: r.reason,
      onClick: moduleFindingClick(r.module),
    }));
    for (const [idx, reason] of rentalHealth.blocking_reasons.entries()) {
      if (out.some((f) => f.detail === reason)) continue;
      out.unshift({
        id: `blocked-${idx}`,
        severity: 'critical',
        icon: 'shield',
        title: 'Nicht vermietbar',
        detail: reason,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rentalHealth, vehicleId]);

  const vhcStatus = rentalOverallToVhcStatus(rentalHealth?.overall_state, rentalHealthLoading);
  const hasCriticalFinding = vhcStatus === 'CRITICAL';

  const cardClass = 'bg-card border border-border/60 rounded-xl shadow-sm p-2.5';
  const quickCardClass = `${cardClass} flex flex-col cursor-pointer transition-all duration-300 ease-out hover:shadow-lg hover:-translate-y-0.5 hover:border-border relative overflow-hidden group`;
  const quickCardHeaderClass = 'flex items-center justify-between mb-1 relative z-10';
  const quickCardTitleClass = 'text-[10px] font-bold tracking-tight text-foreground';
  const quickCardBodyClass = 'flex-1 flex flex-col justify-center relative z-10';
  const quickCardFooterClass = 'mt-1 pt-1 border-t border-border/50 relative z-10';

  return (
    <div className="relative">
      <PageHeader
        title="Vehicle Health"
        eyebrow="Health Center"
        description="AI-assisted diagnostics, live tell-tales, and module health for this vehicle."
        icon={<Icon name="activity" className="w-4 h-4" />}
        actions={
          <button
            type="button"
            onClick={refreshHealth}
            className="p-1.5 rounded-full transition-colors hover:bg-muted text-muted-foreground"
            title="Refresh health data"
          >
            {healthLoading ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="refresh-cw" className="w-4 h-4" />}
          </button>
        }
      />
      {vehicleId && orgId && (
        <div className="mb-3">
          <MisuseCasesPanel orgId={orgId} vehicleId={vehicleId} title="Prüffälle" limit={10} />
        </div>
      )}
      <div
        className="grid grid-cols-[1.4fr_2.55fr] gap-3 transition-all duration-500 ease-out origin-center items-start"
        style={{
          transform: isModalAnimating ? 'scale(0.92)' : 'scale(1)',
          filter: isModalAnimating ? 'blur(12px)' : 'blur(0px)',
          opacity: isModalAnimating ? 0.4 : 1,
          pointerEvents: (anyModalOpen || isModalClosing) ? 'none' : 'auto',
        }}
      >
        {/* ─── Vehicle Health Center – col 1, spans 2 rows ─── */}
        <DataCard className="flex flex-col relative overflow-hidden p-0" bodyClassName="p-5 flex flex-col flex-1">
          <div className="flex items-center gap-3 mb-5">
            <div className="sq-tone-brand p-2 rounded-xl">
              <Icon name="sparkles" className="w-4 h-4" />
            </div>
            <h3 className="text-[10px] font-semibold tracking-tight text-foreground">Vehicle Health Center</h3>
            <span className="ml-auto sq-tone-brand px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest">Powered by AI</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar relative z-10">

            {/* ── Overall Status (Rental-Health-V1) ─────────────────────────── */}
            {(() => {
              const status = vhcStatus;
              const cfg = {
                LOADING:          { bg: 'sq-tone-nodata border border-border', dot: 'bg-gray-400', ping: 'bg-gray-300', text: 'text-muted-foreground', sub: 'text-muted-foreground', label: 'Lädt…' },
                GOOD:             { bg: 'sq-tone-success border border-border', dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]', ping: 'bg-green-300', text: 'text-[color:var(--status-positive)]', sub: 'text-[color:var(--status-positive)]', label: 'Gut' },
                ATTENTION_NEEDED: { bg: 'sq-tone-watch border border-border', dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]', ping: 'bg-amber-400', text: 'text-[color:var(--status-watch)]', sub: 'text-[color:var(--status-watch)]', label: 'Warnung' },
                CRITICAL:         { bg: 'sq-tone-critical border border-border', dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]', ping: 'bg-red-400', text: 'text-[color:var(--status-critical)]', sub: 'text-[color:var(--status-critical)]', label: 'Kritisch' },
                NO_RECENT_DATA:   { bg: 'sq-tone-nodata border border-border', dot: 'bg-gray-400', ping: 'bg-gray-300', text: 'text-muted-foreground', sub: 'text-muted-foreground', label: 'Begrenzte Daten' },
              }[status] ?? { bg: 'sq-tone-nodata border border-border', dot: 'bg-gray-400', ping: 'bg-gray-300', text: 'text-muted-foreground', sub: 'text-muted-foreground', label: '—' };

              const aiSummaryText = aiHealthCare?.summaryText ?? hs?.overallStatus?.shortSummary ?? 'Keine Analyse verfügbar.';
              const critCount = rentalFindings.filter((f) => f.severity === 'critical').length;
              const warnCount = rentalFindings.filter((f) => f.severity === 'warning').length;
              const summaryText = (() => {
                if (critCount === 0 && warnCount === 0) {
                  return aiSummaryText;
                }
                const parts: string[] = [];
                if (critCount > 0) parts.push(`${critCount} kritische${critCount === 1 ? 'r' : ''} Befund${critCount === 1 ? '' : 'e'}`);
                if (warnCount > 0) parts.push(`${warnCount} Warnung${warnCount === 1 ? '' : 'en'}`);
                const lead = parts.join(' · ');
                if (critCount > 0) return `${lead} — sofortiges Handeln erforderlich.`;
                return `${lead} — bitte prüfen.`;
              })();
              const reasons = rentalFindings.length > 0
                ? []
                : aiHealthCare?.reasons ?? (hs?.watchpoints ?? []);

              return (
                <div className={`sq-glass rounded-2xl p-5 ${cfg.bg}`}>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="relative flex items-center justify-center w-5 h-5 shrink-0">
                      <span className={`absolute inline-flex h-full w-full rounded-full ${cfg.ping} opacity-25 ${status !== 'NO_RECENT_DATA' ? 'animate-ping' : ''}`} />
                      <div className={`relative w-3 h-3 rounded-full ${cfg.dot}`} />
                    </div>
                    <span className={`font-bold text-[10px] tracking-tight ${cfg.text}`}>{cfg.label}</span>
                    <HealthStatusChip
                      className="ml-auto text-[10px] uppercase tracking-widest"
                      state={
                        status === 'GOOD' ? 'good'
                        : status === 'CRITICAL' ? 'critical'
                        : status === 'ATTENTION_NEEDED' ? 'watch'
                        : status === 'NO_RECENT_DATA' ? 'no_data'
                        : 'unknown'
                      }
                      label={status === 'ATTENTION_NEEDED' ? 'Warning' : status.replace(/_/g, ' ')}
                    />
                  </div>
                  <p className={`text-[10px] ml-8 leading-relaxed font-medium ${cfg.sub}`}>{summaryText}</p>
                  {reasons.length > 0 && (
                    <ul className={`mt-3 ml-8 space-y-1.5`}>
                      {reasons.slice(0, 3).map((r, i) => (
                        <li key={i} className={`flex items-start gap-2 text-xs font-medium ${cfg.sub}`}>
                          <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* ── Sofortige Aufmerksamkeit (Rental-Health-V1 module reasons) ─ */}
            {rentalFindings.length > 0 && (
              <div className={`sq-glass rounded-2xl p-5 ${
                hasCriticalFinding
                  ? 'sq-tone-critical border border-border'
                  : 'sq-tone-watch border border-border'
              }`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`p-1.5 rounded-lg ${hasCriticalFinding ? 'bg-red-500/20 text-red-500' : 'bg-amber-500/20 text-amber-500'}`}>
                    <Icon name="alert-triangle" className="w-4 h-4" />
                  </div>
                  <span className={`font-bold text-[10px] tracking-tight ${
                    hasCriticalFinding
                      ? 'text-[color:var(--status-critical)]'
                      : 'text-[color:var(--status-watch)]'
                  }`}>{hasCriticalFinding ? 'Sofortige Aufmerksamkeit' : 'Warnungen'}</span>
                  <span className={`ml-auto text-[9px] font-bold px-2.5 py-1 rounded-full ${
                    hasCriticalFinding
                      ? 'sq-chip-critical'
                      : 'sq-chip-watch'
                  }`}>{rentalFindings.length}</span>
                </div>
                <ul className="space-y-2.5">
                  {rentalFindings.map((f) => {
                    const isCrit = f.severity === 'critical';
                    const IconComp =
                      f.icon === 'wrench' ? Wrench
                      : f.icon === 'calendar' ? Calendar
                      : f.icon === 'shield' ? ShieldAlert
                      : f.icon === 'battery' ? Battery
                      : f.icon === 'disc' ? Gauge
                      : f.icon === 'circle' ? Activity
                      : f.icon === 'bell' ? AlertTriangle
                      : AlertTriangle;
                    const tint = isCrit
                      ? 'sq-tone-critical ring-1 ring-border'
                      : 'sq-tone-watch ring-1 ring-border';
                    const titleColor = isCrit
                      ? 'text-[color:var(--status-critical)]'
                      : 'text-[color:var(--status-watch)]';
                    const detailColor = isCrit
                      ? 'text-[color:var(--status-critical)]'
                      : 'text-[color:var(--status-watch)]';
                    return (
                      <li
                        key={f.id}
                        onClick={(e) => { if (f.onClick) { e.stopPropagation(); f.onClick(); } }}
                        className={`flex items-start gap-3 rounded-xl p-2.5 -mx-1.5 transition-all duration-200 ${f.onClick ? 'cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.04] hover:shadow-sm' : ''}`}
                      >
                        <div className={`shrink-0 p-2 rounded-xl shadow-sm ${tint}`}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-semibold tracking-tight ${titleColor}`}>{f.title}</span>
                            <StatusChip tone={isCrit ? 'critical' : 'watch'} className="text-[9px] uppercase tracking-widest">
                              {isCrit ? 'Kritisch' : 'Warnung'}
                            </StatusChip>
                          </div>
                          <p className={`text-[10px] leading-relaxed font-medium ${detailColor}`}>{f.detail}</p>
                        </div>
                        {f.onClick && <Icon name="chevron-right" className={`w-4 h-4 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5 ${isCrit ? 'text-red-400' : 'text-amber-400'}`} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* ── Tacho Warnleuchten (live dashboard warning lights) ──────── */}
            {aiHealthCare?.hmHealthActive && (
              <div className={`sq-glass rounded-2xl p-5 ${
                aiHealthCare.hmFreshnessStatus === 'stale'
                  ? 'sq-tone-watch border border-border'
                  : 'sq-tone-ai border border-border'
              }`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-1.5 rounded-lg ${
                    aiHealthCare.hmFreshnessStatus === 'stale'
                      ? 'sq-tone-watch'
                      : 'sq-tone-ai'
                  }`}>
                    <Icon name="activity" className="w-4 h-4" />
                  </div>
                  <span className={`font-bold text-[10px] tracking-tight ${'text-[color:var(--status-ai)]'}`}>Tacho Warnleuchten</span>
                  {aiHealthCare.hmFreshnessStatus === 'stale' && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[8px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                      <Icon name="alert-triangle" className="w-2.5 h-2.5" />
                      Veraltet
                    </span>
                  )}
                  {aiHealthCare.lastHmUpdate && (
                    <span className={`ml-auto text-[10px] font-medium px-2.5 py-1 rounded-full ${
                      aiHealthCare.hmFreshnessStatus === 'stale' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {(() => {
                        const ms = Date.now() - new Date(aiHealthCare.lastHmUpdate!).getTime();
                        const h = Math.floor(ms / 3600000);
                        const d = Math.floor(h / 24);
                        if (d >= 1) return `vor ${d}d`;
                        return `vor ${h < 1 ? '<1h' : `${h}h`}`;
                      })()}
                    </span>
                  )}
                </div>
                {aiHealthCare.hmLastErrorAt && aiHealthCare.hmLastErrorMessage && (
                  <div className={`mb-4 rounded-xl px-4 py-3 text-xs font-medium border shadow-sm ${
                    'sq-tone-critical border border-border'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="alert-circle" className="w-3.5 h-3.5" />
                      <span className="font-bold">Sync Error</span>
                    </div>
                    Letzter HM-Abruf fehlgeschlagen: {aiHealthCare.hmLastErrorMessage}
                  </div>
                )}
                {!aiHealthCare.hmLastErrorAt && aiHealthCare.hmFreshnessStatus === 'no_data' && (
                  <div className={`mb-4 rounded-xl px-4 py-3 text-xs font-medium border shadow-sm ${
                    'sq-tone-info border border-border'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon name="zap" className="w-3.5 h-3.5" />
                      <span className="font-bold">Stream Active</span>
                    </div>
                    OEM-Fleet-Clearance aktiv — Daten werden via MQTT gestreamt, sobald das Fahrzeug Telemetrie sendet.
                  </div>
                )}
                {(() => {
                  // V4.6.39: Signal-semantics-aware rendering of "no push" state.
                  //
                  // Context: HM MQTT Push at Mercedes-Benz (and most OEMs) is
                  // edge-triggered — the Airtable "Every 2min" column refers to
                  // PULL sampling (REST polling frequency), not push cadence.
                  // The vehicle only pushes when the internal state actually
                  // changes (Mercedes OEM guide: "data being uploaded by the
                  // vehicle as soon as the state changes internally").
                  //
                  // That means `null` in our cache can mean several things and
                  // the UI must NOT collapse them into one ambiguous label
                  // (V4.6.38's "OEM liefert dieses Signal nicht" was wrong —
                  // Mercedes does ship these signals, just not periodically).
                  //
                  // Signal classes for the Mercedes C 63 AMG empirically and
                  // cross-verified with the HM Auto-API-Availability Airtable
                  // (shr4Tv65uPkaf5wzy, 90 rows) for Mercedes-Benz fleets:
                  //  • warn_flag      : limp_mode, brake_lining_pre_warning,
                  //                     tire_pressure_statuses, battery_low_warning
                  //                     → push only when the warning fires.
                  //                     null + fresh HM stream = "no alarm".
                  //  • measure        : engine_oil_level. Should be periodic
                  //                     per the tabular spec but Mercedes
                  //                     pushes it only on significant delta,
                  //                     so null on a warm car is common.
                  //                     Keep wording neutral (no "OK" claim).
                  type SignalSemantics = 'warn_flag' | 'measure';
                  const freshness = aiHealthCare.hmFreshnessStatus;
                  const streamCold = freshness === 'no_data';
                  type Tone = 'alert' | 'ok' | 'neutral' | 'muted';
                  const resolveFlag = (
                    value: boolean | null | undefined,
                    activeText: string,
                    okText: string,
                    semantics: SignalSemantics,
                  ): { text: string; tone: Tone } => {
                    if (value === true) return { text: activeText, tone: 'alert' };
                    if (value === false) return { text: okText, tone: 'ok' };
                    if (streamCold) return { text: 'Noch keine Daten', tone: 'neutral' };
                    if (semantics === 'warn_flag') {
                      // V4.6.40: warn_flag at null + fresh stream → render as "Aus"
                      // (same text + tone as an explicit false push). Rationale:
                      // physical dashboard lights are binary — if Mercedes didn't
                      // push, the light is physically off; "Keine Meldung" was
                      // ambiguous. Consistent wording with okText keeps the row
                      // semantics readable at a glance.
                      return { text: okText, tone: 'ok' };
                    }
                    return { text: 'Aktuell nicht vom OEM übertragen', tone: 'muted' };
                  };
                  const textClassFor = (tone: Tone, strong = false) => {
                    if (tone === 'alert') return 'text-amber-600 dark:text-amber-400 font-bold';
                    if (tone === 'ok') return strong ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground font-medium';
                    if (tone === 'muted') return 'italic text-muted-foreground/60 font-medium';
                    return 'text-muted-foreground font-medium';
                  };
                  const dotClassFor = (tone: Tone) => {
                    if (tone === 'alert') return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse';
                    if (tone === 'ok') return 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.3)]';
                    return 'bg-gray-300 dark:bg-gray-600';
                  };
                  const iconTintFor = (tone: Tone) => {
                    if (tone === 'alert') return 'text-amber-500';
                    if (tone === 'ok') return 'text-[color:var(--status-positive)]';
                    if (tone === 'muted') return 'text-gray-300 dark:text-gray-600';
                    return 'text-muted-foreground';
                  };
                  const iconBgFor = (tone: Tone) => {
                    if (tone === 'alert') return 'sq-tone-watch ring-1 ring-border';
                    if (tone === 'ok') return 'sq-tone-success ring-1 ring-border';
                    return 'bg-muted/40 ring-1 ring-border';
                  };
                  return (
                <div className="space-y-1">
                  {/* Motoröl — measure (periodic but Mercedes pushes only on delta).
                      V4.6.41: hide row only when stream is WARM and the OEM still does
                      not push any value — that proves the signal is never received for
                      this vehicle. Cold stream → keep visible with "Noch keine Daten",
                      because we cannot yet conclude whether the OEM ships oil data. */}
                  {(() => {
                    const oil = aiHealthCare.oilLevelDisplay;
                    const hasData = oil && oil.mode !== 'no_data';
                    if (!hasData && !streamCold) return null;
                    const isLow = aiHealthCare.hmIndicators?.oilLevel?.status === 'LOW';
                    return (
                      <div className="flex items-center gap-3.5 p-2 -mx-2 rounded-xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${isLow ? ('sq-tone-watch border border-border') : ('bg-muted/40 border border-border')}`}>
                          {/* Min Oil Level — Figma: TA284qaiR287FrPzedlr58, node 2:98 */}
                          <img
                            src={tellTaleOilIcon}
                            alt=""
                            aria-hidden="true"
                            className={`w-4 h-4 object-contain transition-opacity ${isLow ? 'opacity-100' : 'opacity-50 grayscale'}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-foreground">Motoröl</p>
                          {hasData ? (
                            <>
                              <div className="w-full h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden shadow-inner">
                                <div
                                  className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : oil!.value != null && oil!.value >= 0.9 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}
                                  style={{ width: `${Math.round((oil!.value ?? 0.5) * 100)}%` }}
                                />
                              </div>
                              <p className={`text-[10px] mt-1 font-semibold ${isLow ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{oil!.label}</p>
                            </>
                          ) : <p className="text-[9px] italic font-medium mt-0.5 text-muted-foreground/60">Noch keine Daten</p>}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Motorkontrolleuchte — warn_flag (HM engine.limp_mode).
                      V4.6.41: warn_flags are received from every supported OEM
                      stream — keep row visible even when stream is cold ("Noch
                      keine Daten"). Only signals we never receive should hide. */}
                  {(() => {
                    const r = resolveFlag(aiHealthCare.indicators?.limpMode, 'Aktiv — Werkstatt aufsuchen', 'Aus', 'warn_flag');
                    return (
                      <div className="flex items-center gap-3.5 p-2 -mx-2 rounded-xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${iconBgFor(r.tone)}`}>
                          {/* CEL_1 — Figma: TA284qaiR287FrPzedlr58, node 1:4 */}
                          <img src={tellTaleCelIcon} alt="" aria-hidden="true" className={`w-4 h-4 object-contain transition-opacity ${r.tone === 'ok' ? 'opacity-50 grayscale' : 'opacity-100'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-bold text-foreground">Motorkontrolleuchte</p>
                          <p className={`text-[10px] mt-0.5 ${textClassFor(r.tone)}`}>{r.text}</p>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mr-1 ${dotClassFor(r.tone)}`} />
                      </div>
                    );
                  })()}

                  {/* Bremsbelag Vorwarnung — warn_flag */}
                  {(() => {
                    const r = resolveFlag(aiHealthCare.indicators?.brakeWarning, 'Warnung aktiv', 'Aus', 'warn_flag');
                    return (
                      <div className="flex items-center gap-3.5 p-2 -mx-2 rounded-xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${iconBgFor(r.tone)}`}>
                          {/* Brake Pad Warning_2 — Figma: TA284qaiR287FrPzedlr58, node 1:66 */}
                          <img src={tellTaleBrakePadIcon} alt="" aria-hidden="true" className={`w-4 h-4 object-contain transition-opacity ${r.tone === 'ok' ? 'opacity-50 grayscale' : 'opacity-100'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-bold text-foreground">Bremsbelag Vorwarnung</p>
                          <p className={`text-[10px] mt-0.5 ${textClassFor(r.tone)}`}>{r.text}</p>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mr-1 ${dotClassFor(r.tone)}`} />
                      </div>
                    );
                  })()}

                  {/* Reifendruck Warnung — warn_flag */}
                  {(() => {
                    const r = resolveFlag(aiHealthCare.indicators?.tirePressureWarning, 'Druckwarnung aktiv', 'Aus', 'warn_flag');
                    return (
                      <div className="flex items-center gap-3.5 p-2 -mx-2 rounded-xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${iconBgFor(r.tone)}`}>
                          {/* LTP_1 — Figma: TA284qaiR287FrPzedlr58, node 2:112 */}
                          <img src={tellTaleTirePressureIcon} alt="" aria-hidden="true" className={`w-4 h-4 object-contain transition-opacity ${r.tone === 'ok' ? 'opacity-50 grayscale' : 'opacity-100'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-bold text-foreground">Reifendruck Warnung</p>
                          <p className={`text-[10px] mt-0.5 ${textClassFor(r.tone)}`}>{r.text}</p>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mr-1 ${dotClassFor(r.tone)}`} />
                      </div>
                    );
                  })()}

                  {/* Batterie-Warnleuchte — warn_flag (dashboard_lights.battery_low_warning) */}
                  {(() => {
                    const r = resolveFlag(aiHealthCare.indicators?.batteryWarningLight, 'Warnleuchte aktiv', 'Aus', 'warn_flag');
                    return (
                      <div className="flex items-center gap-3.5 p-2 -mx-2 rounded-xl transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${iconBgFor(r.tone)}`}>
                          {/* Battery Level Low_2 — Figma: TA284qaiR287FrPzedlr58, node 2:107 */}
                          <img src={tellTaleBatteryIcon} alt="" aria-hidden="true" className={`w-4 h-4 object-contain transition-opacity ${r.tone === 'ok' ? 'opacity-50 grayscale' : 'opacity-100'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-bold text-foreground">Batterie-Warnleuchte</p>
                          <p className={`text-[10px] mt-0.5 ${textClassFor(r.tone)}`}>{r.text}</p>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 mr-1 ${dotClassFor(r.tone)}`} />
                      </div>
                    );
                  })()}
                </div>
                  );
                })()}
              </div>
            )}

          </div>
        </DataCard>

        {/* ─── Right Column: Quick Cards ─── */}
        <div className="grid grid-cols-3 gap-3 h-fit auto-rows-fr">
        {/* ─── Error Codes card ─── */}
        {(() => {
          const s = dtcSummary;
          const dtcStatus = s?.status ?? (activeDtcCount > 0 ? 'active_faults' : lastDtcChecked ? 'clean' : 'unavailable');
          const isStale = s?.isStale ?? false;
          const faultCount = s?.activeFaultCount ?? (dtcStatus === 'active_faults' ? activeDtcCount : 0);
          const checkedAt = s?.lastCheckedAt ?? lastDtcChecked;
          const accent = quickCardAccentFromRentalState(rentalHealth?.modules.error_codes.state);
          return (
            <div onClick={() => openModal(setShowErrorCodes)} className={`${quickCardClass} order-1`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none transition-opacity ${accent.backdrop}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${accent.iconBox}`}>
                    <Icon name="alert-circle" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Error Codes</h3>
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              <div className={`${quickCardBodyClass} items-center`}>
                {dtcStatus === 'unavailable' && (
                  <>
                    <span className={`text-3xl mb-1 text-muted-foreground/60`}>—</span>
                    <p className={`text-[10px] font-medium text-center text-muted-foreground`}>Noch nicht geprüft</p>
                  </>
                )}
                {dtcStatus === 'stale' && (
                  <>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-2 shadow-sm ${'sq-tone-watch ring-1 ring-border'}`}>
                      <Icon name="alert-triangle" className={`w-4 h-4 ${'text-[color:var(--status-watch)]'}`} />
                    </div>
                    <p className={`text-[10px] font-semibold text-center ${'text-[color:var(--status-watch)]'}`}>Daten veraltet / Abruf fehlgeschlagen</p>
                  </>
                )}
                {(dtcStatus === 'clean' || dtcStatus === 'active_faults') && (
                  <>
                    <div className={`text-[40px] font-black tracking-tighter leading-none ${faultCount > 0 ? accent.countText : 'text-foreground'}`}>{faultCount}</div>
                    {faultCount === 0 && (
                      <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${'sq-chip-success'}`}>
                        <Icon name="check-circle" className="w-2.5 h-2.5" /> Keine Fehler
                      </div>
                    )}
                    {faultCount > 0 && (
                      <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${accent.faultBadge}`}>
                        {faultCount} Fehlercode{faultCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={`${quickCardFooterClass} flex items-center gap-1.5`}>
                {isStale && <Icon name="alert-triangle" className={`w-3 h-3 shrink-0 ${'text-[color:var(--status-watch)]'}`} />}
                <p className={`text-[10px] font-medium ${isStale ? ('text-[color:var(--status-watch)]') : 'text-muted-foreground'}`}>
                  {checkedAt ? formatRelativeTime(checkedAt) : '—'}
                </p>
              </div>
            </div>
          );
        })()}

        {/* ─── Battery card (12V) — SOH bar + current voltage ─── */}
        <div onClick={() => openModal(setShowBattery)} className={`${quickCardClass} order-4`}>
          <style>{`@keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }`}</style>
          {(() => {
            const batteryAccent = quickCardAccentFromRentalState(rentalHealth?.modules.battery.state);
            return (
              <>
          {/* Subtle gradient backdrop */}
          <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${batteryAccent.backdrop}`} />
          <div className={`${quickCardHeaderClass} gap-2`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className={`p-1.5 rounded-lg shrink-0 ${batteryAccent.iconBox}`}>
                <Icon name="battery" className="w-3.5 h-3.5" />
              </div>
              <h3 className={quickCardTitleClass}>Battery</h3>
              {aiHealthCare?.indicators?.batteryWarningLight === true && (
                <span
                  title="Dashboard-Warnleuchte leuchtet — Lichtmaschine und Ladezustand prüfen"
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border animate-pulse ${
                    'sq-chip-watch border border-border'
                  }`}
                >
                  <img src={tellTaleBatteryIcon} alt="" aria-hidden="true" className="w-3 h-3 object-contain" />
                  Warnleuchte
                </span>
              )}
            </div>
            <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5`} />
          </div>
          <div className={`${quickCardBodyClass}`}>
            {lvNoBatteryDetected ? (
              <>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={`text-sm font-bold tracking-tight text-foreground`}>
                    No LV Battery detected
                  </span>
                </div>
                <p className={`text-[10px] text-muted-foreground`}>
                  Für dieses Fahrzeug wird kein 12V-Signal gemeldet. Entweder besitzt es keine separat überwachte LV-Batterie oder die Telemetrie ist nicht verfügbar.
                </p>
              </>
            ) : lvIsCalibrating ? (
              <>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`text-xs font-medium ${'text-[color:var(--status-info)]'}`}>
                    Sammelt Messwerte
                  </span>
                  <span className="inline-flex">
                    {[0, 1, 2].map(i => <span key={i} className={`inline-block w-1 h-1 rounded-full mx-0.5 ${'bg-[color:var(--status-info)]'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}
                  </span>
                </div>
                {calibrationEstimate != null ? (
                  <div className="flex items-center gap-1.5 mb-1.5" title={lvEstimatedTooltip}>
                    <BatteryConditionBars
                      status={calibrationEstimate >= 80 ? 'GOOD' : calibrationEstimate >= 60 ? 'WATCH' : calibrationEstimate >= 40 ? 'WARNING' : 'CRITICAL'}
                      size="sm"
                      showLabel={false}
                    />
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-info border border-border'}`}>
                      Schätzung
                    </span>
                  </div>
                ) : null}
                <p className={`text-[10px] text-muted-foreground/70`}>
                  {calibrationStatusText}
                </p>
                {calibrationMetricsText && <p className={`text-[10px] mt-1 text-muted-foreground/60`}>{calibrationMetricsText}</p>}
                {calibrationFreshnessText && <p className={`text-[10px] mt-1 text-muted-foreground/60`}>{calibrationFreshnessText}</p>}
              </>
            ) : (
              <>
                {/* Estimated Battery Health — 3-bar indicator (no SOH %). */}
                <div className="mb-2" title={lvEstimatedTooltip}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>Estimated Battery Health</p>
                  <div className="flex items-center gap-2">
                    <BatteryConditionBars
                      status={lvEstimatedStatus}
                      bars={lvEstimatedBars}
                      size="md"
                    />
                    {lvIsStabilizing && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${'sq-chip-watch border border-border'}`}>Estimated</span>
                    )}
                  </div>
                </div>
                {/* Resting voltage — current rest/charge state, separate from health. */}
                <div className="mb-2">
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>
                    Resting Voltage{lvBatteryTypeLabel ? ` · ${lvBatteryTypeLabel}` : ''}
                  </p>
                  {lvRestingValue != null ? (
                    <RestingVoltageBadge valueV={lvRestingValue} status={lvRestingStatus} />
                  ) : (
                    <p className={`text-[10px] font-medium text-muted-foreground`}>
                      Live voltage: <span className={`font-bold text-foreground tabular-nums`}>{voltageDisplay}</span>
                      {voltageDisplay !== '—' ? ' V' : ''}
                    </p>
                  )}
                </div>
                {!lvIsStabilizing && (batteryCondition === 'watch' || batteryCondition === 'attention') && (
                  <div className={`mt-2 rounded-lg px-2.5 py-2 border text-[9px] leading-snug font-medium ${
                    batteryCondition === 'attention'
                      ? ('sq-tone-critical border border-border')
                      : ('sq-tone-watch border border-border')
                  }`}>
                    {batteryCondition === 'attention'
                      ? 'Batteriespannung kritisch — Austausch empfohlen.'
                      : 'Batteriespannung niedrig — beobachten.'}
                  </div>
                )}
              </>
            )}
            {aiHealthCare?.indicators?.batteryWarningLight === true && (
              <div className={`mt-2 rounded-md px-2 py-1.5 border text-[10px] leading-snug flex items-start gap-1.5 ${
                'sq-tone-watch border border-border'
              }`}>
                <img src={tellTaleBatteryIcon} alt="" aria-hidden="true" className="w-3.5 h-3.5 shrink-0 mt-0.5 object-contain" />
                <span><span className="font-semibold">Warnleuchte aktiv</span> — Dashboard meldet Batterie-Warnung. Lichtmaschine und Ladezustand prüfen.</span>
              </div>
            )}
          </div>
          {!lvNoBatteryDetected && batteryLastCheckedAgo && (
            <div className={quickCardFooterClass}>
              <p className={`text-[10px] text-muted-foreground/70`}>{batteryLastCheckedAgo}</p>
            </div>
          )}
              </>
            );
          })()}
        </div>

        {/* ─── Service Info card ─── */}
        {(() => {
          const si = serviceInfo;
          const pct = si?.serviceRemainingPercent ?? null;
          const overdue = si?.serviceOverdue === true;
          const imminent = si?.serviceDueImminently === true && !overdue;

          // Precise "next service" string — formats by the best available
          // precision the backend gave us and preserves the sign so overdue
          // vehicles show "überfällig seit …" instead of a misleading 0 mo.
          //
          // Note: `hasServiceBaseline` only reflects DB-side history (a stored
          // VehicleServiceEvent / lastServiceDate). Vehicles that stream
          // service counters via HM (e.g. Mercedes fleet-clearance with
          // `timeToNextServiceDays`) can legitimately be overdue even when
          // no local baseline exists — in that case we still have a real
          // remaining/overdue value and must render it. Otherwise the card
          // collapses to "—" while the red ÜBERFÄLLIG badge stays lit.
          const nextStr = (() => {
            if (!si) return '—';
            const hasAnySource =
              si.hasServiceBaseline ||
              si.hmServiceSource === true ||
              si.serviceRemainingDays != null ||
              si.serviceRemainingMonths != null ||
              si.serviceRemainingKm != null ||
              si.serviceOverdue === true;
            if (!hasAnySource) return '—';
            const dayParts: string[] = [];
            if (si.serviceOverdue) {
              if (si.serviceOverdueDays != null) dayParts.push(`${si.serviceOverdueDays} Tagen`);
              if (si.serviceOverdueKm != null) dayParts.push(`${si.serviceOverdueKm.toLocaleString('de-DE')} km`);
              return dayParts.length > 0
                ? `Überfällig seit ${dayParts.join(' / ')}`
                : 'Überfällig';
            }
            const parts: string[] = [];
            if (si.serviceRemainingDays != null && si.serviceRemainingDays <= 90) {
              parts.push(`in ${si.serviceRemainingDays} Tagen`);
            } else if (si.serviceRemainingMonths != null) {
              parts.push(`in ${si.serviceRemainingMonths} Monaten`);
            }
            if (si.serviceRemainingKm != null && si.serviceRemainingKm >= 0) {
              parts.push(`${si.serviceRemainingKm.toLocaleString('de-DE')} km`);
            }
            return parts.length > 0 ? parts.join(' · ') : '—';
          })();

          // Progress bar: red when overdue, amber when imminent, otherwise
          // follow the existing percent-based scale so "fine" vehicles keep
          // their green bar.
          const barColor = overdue
            ? 'bg-red-500'
            : imminent
              ? 'bg-amber-500'
              : pct == null
                ? 'bg-gray-400'
                : pct >= 50
                  ? 'bg-green-500'
                  : pct >= 25
                    ? 'bg-amber-500'
                    : 'bg-red-500';
          const nextColor = overdue ? 'text-red-600 dark:text-red-400' : imminent ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';

          const hasTuv = si?.tuvValidTill != null;
          const tuvDays = si?.tuvRemainingDays;
          const tuvDate = hasTuv ? new Date(si!.tuvValidTill!).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
          const tuvOverdue = si?.tuvOverdue === true;
          const tuvColor =
            !hasTuv || tuvDays == null
              ? 'text-muted-foreground'
              : tuvOverdue || tuvDays <= 30
                ? 'text-[color:var(--status-critical)]'
                : tuvDays <= 60
                  ? 'text-[color:var(--status-watch)]'
                  : 'text-foreground';

          const hasBok = si?.bokraftValidTill != null;
          const bokDays = si?.bokraftRemainingDays;
          const bokDate = hasBok ? new Date(si!.bokraftValidTill!).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
          const bokOverdue = si?.bokraftOverdue === true;
          const bokColor =
            !hasBok || bokDays == null
              ? 'text-muted-foreground'
              : bokOverdue || bokDays <= 30
                ? 'text-[color:var(--status-critical)]'
                : bokDays <= 60
                  ? 'text-[color:var(--status-watch)]'
                  : 'text-foreground';

          const borderHighlight = serviceCardBorderFromRentalState(
            rentalHealth?.modules.service_compliance.state,
          );
          const serviceAccent = quickCardAccentFromRentalState(rentalHealth?.modules.service_compliance.state);

          return (
            <div onClick={() => openModal(setShowService)} className={`${quickCardClass} order-3 ${borderHighlight}`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${serviceAccent.backdrop}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${serviceAccent.iconBox}`}>
                    <Icon name="wrench" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Service Info</h3>
                  {overdue && (
                    <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 uppercase tracking-widest border border-red-200 dark:border-red-500/30">Überfällig</span>
                  )}
                  {imminent && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 uppercase tracking-widest border border-amber-200 dark:border-amber-500/30">Fällig</span>
                  )}
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              {pct != null && (
                <div className={`w-full h-2 rounded-full overflow-hidden mb-3 bg-muted shadow-inner relative z-10`}>
                  <div className={`h-full ${barColor} rounded-full transition-all shadow-[0_0_8px_currentColor]`} style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="flex flex-col justify-between flex-1 gap-3 relative z-10">
                <div>
                  <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 text-muted-foreground/70`}>Next service</p>
                  <p className={`text-[10px] font-bold ${nextColor}`}>{nextStr}</p>
                </div>
                <div>
                  <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 text-muted-foreground/70`}>Next TÜV</p>
                  <p className={`text-[10px] font-bold ${tuvColor}`}>{hasTuv ? tuvDate : '—'}</p>
                  {hasTuv && tuvOverdue && (
                    <p className={`text-[10px] mt-1 font-bold text-red-600 dark:text-red-400`}>TÜV abgelaufen</p>
                  )}
                  {hasTuv && !tuvOverdue && tuvDays != null && tuvDays <= 90 && (
                    <p className={`text-[10px] mt-1 font-semibold ${tuvDays <= 30 ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`}>
                      Fällig in {tuvDays} Tagen
                    </p>
                  )}
                  {!hasTuv && (
                    <p className={`text-[10px] mt-1 text-muted-foreground/70 font-medium italic`}>No tracking</p>
                  )}
                </div>
                <div>
                  <p className={`text-[9px] uppercase tracking-widest font-bold mb-1 text-muted-foreground/70`}>Next BOKraft</p>
                  <p className={`text-[10px] font-bold ${bokColor}`}>{hasBok ? bokDate : '—'}</p>
                  {hasBok && bokOverdue && (
                    <p className={`text-[10px] mt-1 font-bold text-red-600 dark:text-red-400`}>BOKraft abgelaufen</p>
                  )}
                  {!hasBok && (
                    <p className={`text-[10px] mt-1 text-muted-foreground/70 font-medium italic`}>No tracking</p>
                  )}
                </div>
                {(overdue || imminent) && (
                  <div className={`rounded-lg px-2.5 py-2 text-[9px] leading-snug font-medium border ${overdue ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'}`}>
                    {overdue
                      ? 'Service überfällig — Werkstatttermin vereinbaren.'
                      : 'Service fällig — Werkstatttermin planen.'}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ─── Brakes Quick View — canonical condition (measured vs estimated honesty) ─── */}
        {(() => {
          const bhs = brakeHealthSummary;
          // Canonical condition is the single source of truth (estimates cap at
          // WARNING; CRITICAL only from a real measured/documented safety signal).
          const condition = bhs?.overallCondition ?? 'UNKNOWN';
          const style = brakeConditionStyle(condition);
          const hasData = condition !== 'UNKNOWN';
          const brakeAccent = quickCardAccentFromRentalState(rentalHealth?.modules.brakes.state);
          const basisLabel = bhs?.dataBasis ? BRAKE_BASIS_LABEL[bhs.dataBasis] : null;
          const confLabel = bhs?.confidenceLevel ? BRAKE_CONFIDENCE_LABEL[bhs.confidenceLevel] : null;
          const frontRange = formatBrakeKmRange(bhs?.estimatedFrontRemainingKmMin, bhs?.estimatedFrontRemainingKmMax);
          const rearRange = formatBrakeKmRange(bhs?.estimatedRearRemainingKmMin, bhs?.estimatedRearRemainingKmMax);
          const nextInspection = bhs?.nextInspectionRecommendedInKm ?? null;
          const openAlerts = bhs?.openAlerts ?? [];
          const tintBg = brakeAccent.backdrop;
          return (
            <div onClick={() => { openModal(setShowBrakes); if (vehicleId) api.vehicleIntelligence.brakeHealthDetail(vehicleId).then(setBrakeHealthDetail).catch(() => null); }} className={`${quickCardClass} order-6 ${!hasData ? 'opacity-60' : ''}`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${tintBg}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${brakeAccent.iconBox}`}>
                    <Icon name="disc" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Brake Health</h3>
                  {openAlerts.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />}
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              <div className={quickCardBodyClass}>
                {/* Condition pill + data basis */}
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ${style.pill}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                  {basisLabel && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{basisLabel}{confLabel ? ` · ${confLabel}` : ''}</span>
                  )}
                </div>
                {hasData ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Front: <span className="font-bold text-foreground tabular-nums">{frontRange ?? '—'}</span>
                    </p>
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Rear: <span className="font-bold text-foreground tabular-nums">{rearRange ?? '—'}</span>
                    </p>
                    {nextInspection != null && (
                      <p className="text-[10px] font-medium text-muted-foreground">
                        Inspection in: <span className="font-bold text-foreground tabular-nums">{Math.round(nextInspection).toLocaleString('de-DE')} km</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    Bremszustand wird ermittelt, sobald eine Werkstatt-Messung, ein Dokument oder ein Brems-Signal verfügbar ist.
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* ─── Tires — health % + estimated lifetime km ─── */}
        {(() => {
          const th = tireHealth;
          const hasTireData = (th != null && th.overallPercent != null) || (tireWear != null && tireWear.overallPercent != null);
          const pct = th?.overallPercent ?? tireWear?.overallPercent ?? null;
          const remKm = th?.overallRemainingKm ?? tireWear?.estimatedRemainingKm ?? null;
          const barColor = pct != null ? (pct >= 50 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : pct >= 25 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]') : 'bg-gray-300';
          const conf = th?.confidenceLabel ?? null;
          const hasAlerts = (th?.alerts?.length ?? 0) > 0;
          const activeSetup = resolveActiveSetup(tiresData);
          // ── Canonical read model (single source of truth — measured vs estimated honesty) ──
          const canonStatus = th?.overallStatus ?? null;
          const canonStyle = tireStatusStyle(canonStatus);
          const displayMm = th?.displayTreadMm ?? th?.lowestTreadMm ?? null;
          const lowestPos = th?.lowestTreadPosition ?? null;
          const displayMode = th?.displayMode ?? (th?.measurementState === 'measured' ? 'MEASURED' : th?.measurementState ? 'ESTIMATED' : null);
          const confLevel = th?.confidence ?? null;
          const lastMeasuredAt = th?.lastMeasurementAt ?? th?.latestMeasurementAt ?? null;
          const estRemKm = th?.estimatedRemainingKm ?? remKm;
          const topRec = th?.recommendations?.find((r) => r && r.trim().length > 0) ?? null;
          const tireAccent = quickCardAccentFromRentalState(rentalHealth?.modules.tires.state);
          return (
            <div onClick={() => { setTireActionError(null); openModal(setShowTires); loadTireDetail(); }} className={`${quickCardClass} order-5 ${!hasTireData ? 'opacity-60' : ''}`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${tireAccent.backdrop}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${!hasTireData ? ('bg-muted text-muted-foreground') : tireAccent.iconBox}`}>
                    <Icon name="circle" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Tires</h3>
                  {hasTireData && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest sq-tone-ai shadow-sm">ML</span>}
                  {hasAlerts && <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse" />}
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              {hasTireData && pct != null ? (
                <div className={quickCardBodyClass}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`text-[18px] font-black tracking-tight text-foreground leading-none`}>{pct}</span>
                    <span className="text-xs font-bold text-muted-foreground tracking-tight">% Tread</span>
                    {th?.actionState && th.actionState !== 'OBSERVE' && (
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
                        th.actionState === 'REPLACE' ? ('sq-chip-critical border border-border') :
                        th.actionState === 'PLAN_SERVICE' ? ('sq-chip-watch border border-border') :
                        ('sq-chip-info border border-border')
                      }`}>
                        {formatEnumLabel(th.actionState)}
                      </span>
                    )}
                  </div>
                  <div className={`w-full h-2 rounded-full overflow-hidden mb-2.5 bg-muted shadow-inner`}>
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`text-[10px] font-medium text-muted-foreground`}>
                    Lifetime: <span className={`font-bold text-foreground tabular-nums`}>{remKm != null ? `${Math.floor(remKm).toLocaleString('de-DE')} km` : '—'}</span>
                  </p>
                  {/* Canonical status (single source of truth) — falls back to % bucket for legacy payloads */}
                  {canonStatus && canonStatus !== 'UNKNOWN' ? (
                    <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest w-fit ${canonStyle.pill}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${canonStyle.dot}`} />
                      {canonStyle.label}
                    </div>
                  ) : (
                    <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest w-fit ${
                      pct >= 50 ? ('sq-chip-success') :
                      pct >= 25 ? ('sq-chip-watch') :
                      ('sq-chip-critical')
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        pct >= 50 ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' :
                        pct >= 25 ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]' :
                        'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'
                      }`} />
                      {pct >= 50 ? 'Healthy' : pct >= 25 ? 'Monitor' : 'Critical'}
                    </div>
                  )}
                  {/* Lowest tread (mm) + position + measured/estimated honesty */}
                  {displayMm != null && (
                    <p className={`text-[10px] mt-2 font-medium text-muted-foreground`}>
                      Lowest tread: <span className="font-bold text-foreground tabular-nums">ca. {displayMm.toFixed(1)} mm</span>
                      {lowestPos ? <span className="text-muted-foreground"> · {lowestPos}</span> : null}
                    </p>
                  )}
                  {displayMode && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
                        displayMode === 'MEASURED'
                          ? ('sq-chip-info')
                          : ('sq-tone-ai')
                      }`}>
                        {displayMode === 'MEASURED' ? 'Measured' : displayMode === 'ESTIMATED' ? 'Estimated' : 'Unknown'}
                      </span>
                      {confLevel && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
                          confLevel === 'HIGH' ? ('sq-chip-success') :
                          confLevel === 'MEDIUM' ? ('sq-chip-watch') :
                          ('sq-chip-warning')
                        }`}>
                          Conf: {confLevel}
                        </span>
                      )}
                    </div>
                  )}
                  {lastMeasuredAt && (
                    <p className={`text-[10px] mt-1 font-medium text-muted-foreground/70`}>
                      Last measured: {formatMeasuredAgo(lastMeasuredAt) ?? '—'}
                    </p>
                  )}
                  {topRec && (
                    <p className={`text-[10px] mt-1 font-medium ${'text-[color:var(--status-info)]'} line-clamp-2`}>
                      {topRec}
                    </p>
                  )}
                </div>
              ) : (
                <div className={quickCardBodyClass}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className={`text-sm font-bold tracking-tight text-foreground`}>
                      No active Tracking
                    </span>
                  </div>
                  {activeSetup && (
                    <p className={`text-[10px] mb-1 font-medium text-muted-foreground`}>{activeSetup.brandModelFront ?? activeSetup.frontDimension ?? 'Setup'}</p>
                  )}
                  <p className={`text-[10px] text-muted-foreground`}>
                    Bitte Reifeninformationen hinterlegen, um die Reifenüberwachung zu aktivieren.
                  </p>
                </div>
              )}
              {/* HM Tire Pressure indicator */}
              {hmTirePressure && (
                <div className={`${quickCardFooterClass} flex items-center justify-between gap-2`}>
                  <p className="text-[10px] text-muted-foreground/70 shrink-0 font-medium">
                    {hmTirePressure.lastUpdatedAt ? (() => {
                      const ms = Date.now() - new Date(hmTirePressure.lastUpdatedAt!).getTime();
                      const h = Math.floor(ms / 3600000);
                      return h < 1 ? 'gerade eben' : `vor ${h}h`;
                    })() : '—'}
                  </p>
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${
                    hmTirePressure.overallStatus === 'OK' ? ('sq-chip-success') :
                    hmTirePressure.overallStatus === 'ISSUE' ? ('sq-chip-watch') :
                    ('bg-muted text-muted-foreground')
                  }`}>
                    {hmTirePressure.overallStatus === 'OK' ? <><Icon name="check-circle" className="w-2.5 h-2.5" /> Pressure OK</> :
                     hmTirePressure.overallStatus === 'ISSUE' ? <><Icon name="alert-triangle" className="w-2.5 h-2.5" /> Pressure Warning</> :
                     'No data'}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ─── HV Battery (EV/PHEV) or Complaint List (ICE) ─── */}
        {isEv ? (() => {
          const hvPubState = hvBatteryStatus?.publicationState ?? 'INITIAL_CALIBRATION';
          const hvCalibrating = hvPubState === 'INITIAL_CALIBRATION';
          const hvStabilizing = hvPubState === 'STABILIZING';
          const soh = hvCalibrating
            ? (hvBatteryStatus?.rawSohPercent != null ? Math.round(hvBatteryStatus.rawSohPercent) : null)
            : Math.round(hvBatteryStatus?.publishedSohPercent ?? hvBatteryStatus?.sohPercent ?? 0) || null;
          const interp = hvBatteryStatus?.sohInterpretation;
          // HV SOH bands (distinct from LV): ≥80 GOOD · 70–79 WATCH · 60–69 WARNING · <60 CRITICAL.
          const hvStatus = bSummary?.hv?.healthStatus
            ?? (soh == null ? 'UNKNOWN' : soh >= 80 ? 'GOOD' : soh >= 70 ? 'WATCH' : soh >= 60 ? 'WARNING' : 'CRITICAL');
          const barColor =
            hvStatus === 'GOOD' ? 'bg-green-500' :
            hvStatus === 'WATCH' ? 'bg-amber-500' :
            hvStatus === 'WARNING' ? 'bg-orange-500' :
            hvStatus === 'CRITICAL' ? 'bg-red-500' : 'bg-gray-400';
          return (
            <div onClick={() => openModal(setShowHvBattery)} className={`${cardClass} order-2 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-foreground">HV Battery</h3>
                <div className="flex items-center gap-1">
                  <Icon name="zap" className={`w-3.5 h-3.5 ${'text-[color:var(--status-positive)]'}`} />
                  <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground`} />
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center py-2">
                {hvCalibrating ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      {soh != null ? (
                        <span className={`text-sm font-bold tracking-tight text-foreground`}>~{soh}% SOH</span>
                      ) : (
                        <span className={`text-sm font-semibold ${'text-[color:var(--status-info)]'}`}>Calibrating</span>
                      )}
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-info border border-border'}`}>Schätzung</span>
                    </div>
                    {soh != null && (
                      <div className={`w-full h-1.5 rounded-full overflow-hidden mb-1 bg-muted`}>
                        <div className={`h-full bg-blue-400/60 rounded-full transition-all`} style={{ width: `${soh}%` }} />
                      </div>
                    )}
                    <p className={`text-[10px] text-muted-foreground`}>Collecting charge and discharge data</p>
                  </>
                ) : soh == null ? (
                  <>
                    <span className={`text-sm font-bold tracking-tight text-foreground`}>Not available</span>
                    <p className={`text-[10px] mt-1 text-muted-foreground`}>No reliable HV SOH data</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-sm font-bold tracking-tight text-foreground`}>{`${hvStabilizing ? '~' : ''}${soh}% SOH`}</span>
                      {hvStabilizing && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-watch border border-border'}`}>Estimated</span>
                      )}
                    </div>
                    <div className={`w-full h-1.5 rounded-full overflow-hidden mb-2 bg-muted`}>
                      <div className={`h-full ${hvStabilizing ? ('bg-[color:var(--status-watch)]') : barColor} rounded-full transition-all`} style={{ width: `${soh}%` }} />
                    </div>
                    <p className={`text-xs text-muted-foreground`}>{hvStabilizing ? 'Estimated SOH · Stabilizing' : (interp?.label ?? '—')}</p>
                  </>
                )}
                {hvBatteryStatus?.currentSocPercent != null && (
                  <p className={`text-[10px] mt-1 text-muted-foreground/70`}>Current SoC: {formatMaxDecimals(hvBatteryStatus.currentSocPercent)}%</p>
                )}
              </div>
            </div>
          );
        })() : (() => {
          const activeComplaints = complaints.filter((c) => c.status === 'ACTIVE').length;
          return (
            <div onClick={() => openModal(setShowComplaintsModal)} className={`${quickCardClass} order-2`}>
              {/* Subtle gradient backdrop */}
              <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${activeComplaints > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/8'}`} />
              <div className={quickCardHeaderClass}>
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${activeComplaints > 0 ? ('sq-tone-watch') : ('sq-tone-success')}`}>
                    <Icon name="clipboard-list" className="w-3.5 h-3.5" />
                  </div>
                  <h3 className={quickCardTitleClass}>Complaints</h3>
                </div>
                <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transition-transform group-hover:translate-x-0.5`} />
              </div>
              <div className={`${quickCardBodyClass} items-center`}>
                {complaintsLoading ? (
                  <SkeletonCard className="w-full" />
                ) : (
                  <>
                    <div className={`text-[40px] font-black tracking-tighter leading-none ${activeComplaints > 0 ? 'text-amber-500 drop-shadow-[0_0_12px_rgba(245,158,11,0.3)]' : 'text-foreground'}`}>{activeComplaints}</div>
                    <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${
                      activeComplaints === 0 ? ('sq-chip-success') :
                      ('sq-chip-watch')
                    }`}>
                      {activeComplaints === 0 ? <><Icon name="check-circle" className="w-2.5 h-2.5" /> Alles klar</> : <><Icon name="alert-circle" className="w-2.5 h-2.5" /> {activeComplaints === 1 ? 'Active' : 'Active'}</>}
                    </div>
                  </>
                )}
              </div>
              <div className={`${quickCardFooterClass} flex items-center gap-1.5`}>
                <Icon name="clipboard-list" className={`w-3 h-3 text-muted-foreground/70`} />
                <p className={`text-[10px] font-medium text-muted-foreground`}>Technical issues & observations</p>
              </div>
            </div>
          );
        })()}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
         ═══════════════════════════════════════════════════════════════ */}

      {/* ─── Error Codes Modal ─── */}
      {showErrorCodes && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowErrorCodes)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl rounded-xl p-5 shadow-lg transition-all duration-500 ease-out max-h-[85vh] overflow-y-auto bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowErrorCodes)} className={`absolute top-6 right-6 p-1.5 rounded-full transition-colors ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {/* Modal header */}
            <div className="mb-4">
              <h2 className="text-base font-semibold mb-1 text-foreground">Error Codes</h2>
              {rentalHealth?.modules.error_codes && (
                <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${'bg-muted/40 border-border'}`}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Betriebsstatus (Fleet Health)
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${rentalStatePillClasses(rentalHealth.modules.error_codes.state)}`}>
                    {rentalStateLabelDe(rentalHealth.modules.error_codes.state)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{rentalHealth.modules.error_codes.reason}</span>
                </div>
              )}
              {(() => {
                const d = dtcDetail;
                const s = dtcSummary;
                const cs = d?.currentFaults?.status ?? s?.status;
                const errorAccent = quickCardAccentFromRentalState(rentalHealth?.modules.error_codes.state);
                if (!cs || cs === 'unavailable') return (
                  <p className={`text-sm text-muted-foreground`}>No DTC check has been performed yet</p>
                );
                if (cs === 'stale') return (
                  <div className="flex items-center gap-2">
                    <Icon name="alert-triangle" className={`w-4 h-4 ${'text-[color:var(--status-watch)]'}`} />
                    <p className={`text-sm ${'text-[color:var(--status-watch)]'}`}>DTC status outdated — last successful check {formatRelativeTime(d?.monitoring?.lastSuccessfulCheckAt ?? s?.lastSuccessfulCheckAt)}</p>
                  </div>
                );
                const count = d?.currentFaults?.activeFaults?.length ?? s?.activeFaultCount ?? 0;
                const moduleState = rentalHealth?.modules.error_codes.state;
                const statusDot =
                  moduleState === 'critical'
                    ? 'bg-red-500'
                    : moduleState === 'warning'
                      ? 'bg-amber-500'
                      : moduleState === 'good'
                        ? 'bg-emerald-500'
                        : 'bg-muted-foreground';
                if (count > 0) return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${statusDot} animate-pulse`} />
                    <p className={`text-sm font-semibold ${errorAccent.countText}`}>{count} active fault code{count > 1 ? 's' : ''} detected</p>
                    {d?.monitoring?.lastSuccessfulCheckAt && <span className={`ml-auto text-xs text-muted-foreground/70`}>Last check {formatRelativeTime(d.monitoring.lastSuccessfulCheckAt)}</span>}
                  </div>
                );
                return (
                  <div className="flex items-center gap-2">
                    <Icon name="check-circle" className={`w-4 h-4 ${'text-[color:var(--status-positive)]'}`} />
                    <p className={`text-sm ${'text-[color:var(--status-positive)]'}`}>No active fault codes</p>
                    {d?.monitoring?.lastSuccessfulCheckAt && <span className={`ml-auto text-xs text-muted-foreground/70`}>Last check {formatRelativeTime(d.monitoring.lastSuccessfulCheckAt)}</span>}
                  </div>
                );
              })()}
            </div>

            {dtcDetailLoading && <SkeletonCard className="mb-4" />}

            {!dtcDetailLoading && (() => {
              const d = dtcDetail;
              const sevCls = (sev: string) => ({
                high: 'sq-chip-critical',
                medium: 'sq-chip-watch',
                low: 'sq-chip-info',
              }[sev] ?? ('sq-chip-neutral'));

              return (
                <>
                  {/* ── Section A: Current Fault Status ───────────────── */}
                  <div className="mb-5">
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground`}>A — Current Fault Status</h3>

                    {(!d || d.currentFaults.status === 'unavailable') && (
                      <EmptyState
                        compact
                        icon={<Icon name="clock" className="w-5 h-5" />}
                        title="No DTC data available"
                        description="The first DTC poll runs every 3 hours — no check has been performed yet"
                        className="rounded-lg border bg-muted border-border py-6"
                      />
                    )}

                    {d?.currentFaults.status === 'stale' && (
                      <div className={`flex items-center gap-3 p-4 rounded-lg border ${'sq-tone-watch border border-border'}`}>
                        <Icon name="alert-triangle" className={`w-5 h-5 shrink-0 ${'text-[color:var(--status-watch)]'}`} />
                        <div>
                          <p className={`text-sm font-semibold ${'text-[color:var(--status-watch)]'}`}>Current DTC status is outdated</p>
                          <p className={`text-xs ${'text-[color:var(--status-watch)]'}`}>The displayed DTC state may not reflect the actual vehicle condition. Wait for the next successful check.</p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'clean' && (
                      <div className={`flex items-center gap-3 p-4 rounded-lg border ${'sq-tone-success border border-border'}`}>
                        <Icon name="check-circle" className={`w-5 h-5 shrink-0 ${'text-[color:var(--status-positive)]'}`} />
                        <div>
                          <p className={`text-sm font-semibold ${'text-[color:var(--status-positive)]'}`}>No Active Fault Codes</p>
                          <p className={`text-xs ${'text-[color:var(--status-positive)]'}`}>Vehicle diagnostics are clear as of the last successful check</p>
                        </div>
                      </div>
                    )}

                    {d?.currentFaults.status === 'active_faults' && d.currentFaults.activeFaults.length > 0 && (
                      <div className="space-y-2">
                        {d.currentFaults.activeFaults.map((dtc: any, i: number) => {
                          const faultTone = dtcFaultCardTone(dtc.severity);
                          return (
                          <div key={dtc.id ?? i} className={`p-4 rounded-lg border ${faultTone.card}`}>
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <div className={`w-2 h-2 rounded-full ${faultTone.dot} animate-pulse shrink-0`} />
                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${faultTone.codePill}`}>{dtc.code}</span>
                              <span className={`text-xs flex-1 font-medium text-foreground min-w-[120px]`}>{dtc.label}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${rentalStatePillClasses(
                                rentalHealth?.modules.error_codes.state,
                              )}`} title="Fleet Health Modulstatus">
                                Betrieb: {rentalStateLabelDe(rentalHealth?.modules.error_codes.state)}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${sevCls(dtc.severity)}`} title="Roh-Severity aus DTC-Poll">
                                DTC: {dtc.severity}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 ml-5">
                              <div>
                                <p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70`}>Category</p>
                                <p className={`text-xs text-foreground/80`}>{dtc.category}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70`}>First Seen</p>
                                <p className={`text-xs text-foreground/80`}>{dtc.firstSeenAt ? new Date(dtc.firstSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground/70`}>Last Seen</p>
                                <p className={`text-xs text-foreground/80`}>{dtc.lastSeenAt ? new Date(dtc.lastSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                              </div>
                            </div>
                            {renderDtcKnowledge(dtc, i)}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Section B: Historical Fault Codes ─────────────── */}
                  <div className="mb-5">
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground`}>B — Historical Fault Codes</h3>

                    {(!d || d.history.length === 0) ? (
                      <p className={`text-sm text-muted-foreground/70`}>No historical DTC records yet</p>
                    ) : (
                      <div className={`rounded-lg border overflow-hidden border-border`}>
                        {/* Table header */}
                        <div className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground`}>
                          <span>Code</span>
                          <span>Label</span>
                          <span>Category</span>
                          <span>First Seen</span>
                          <span>Last Seen</span>
                          <span>Status</span>
                        </div>
                        {/* Table rows */}
                        {d.history.map((item: any, idx: number) => (
                          <div key={item.id ?? idx} className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-3 px-4 py-3 items-center text-xs border-t border-border hover:bg-muted/50 transition-colors`}>
                            <span className={`font-bold font-mono text-[11px] ${'text-[color:var(--brand)]'}`}>{item.code}</span>
                            <span className={`truncate text-foreground/80`}>{item.label}</span>
                            <span className={`text-[10px] text-muted-foreground`}>{item.category}</span>
                            <span className={`text-[10px] tabular-nums text-muted-foreground`}>{item.firstSeenAt ? new Date(item.firstSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                            <span className={`text-[10px] tabular-nums text-muted-foreground`}>{item.lastSeenAt ? new Date(item.lastSeenAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${item.isActive ? ('sq-chip-critical') : item.clearedAt ? ('sq-chip-success') : ('sq-chip-neutral')}`}>
                              {item.isActive ? 'Active' : item.clearedAt ? 'Cleared' : 'Historical'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Section C: DTC Monitoring Information ─────────── */}
                  <div>
                    <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground`}>C — DTC Monitoring</h3>
                    <div className={`rounded-lg border p-5 bg-muted border-border`}>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                        {[
                          { label: 'Poll Interval', value: `Every ${d?.monitoring?.pollIntervalHours ?? 3} hours` },
                          { label: 'Stale Threshold', value: `${d?.monitoring?.staleThresholdHours ?? 6} hours` },
                          { label: 'Signal Source', value: d?.monitoring?.signalSource ?? 'obdDTCList' },
                          { label: 'Last Poll Attempt', value: d?.monitoring?.lastCheckedAt ? formatRelativeTime(d.monitoring.lastCheckedAt) : '—' },
                          { label: 'Last Successful Check', value: d?.monitoring?.lastSuccessfulCheckAt ? formatRelativeTime(d.monitoring.lastSuccessfulCheckAt) : '—' },
                          { label: 'Poll Status', value: d?.monitoring?.pollStatus ?? '—' },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className={`text-[10px] uppercase tracking-wider mb-1 text-muted-foreground/70`}>{label}</p>
                            <p className={`text-xs font-medium text-foreground/80`}>{value}</p>
                          </div>
                        ))}
                      </div>
                      {d?.monitoring?.pollError && (
                        <div className={`mt-4 pt-4 border-t border-border`}>
                          <p className={`text-[10px] uppercase tracking-wider mb-1 text-muted-foreground/70`}>Last Error</p>
                          <p className={`text-xs font-mono ${'text-[color:var(--status-critical)]'}`}>{d.monitoring.pollError}</p>
                        </div>
                      )}
                      <div className={`mt-4 pt-4 border-t border-border`}>
                        <div className="flex items-center gap-2">
                          {d?.monitoring?.isStale
                            ? <Icon name="alert-triangle" className={`w-3.5 h-3.5 ${'text-[color:var(--status-watch)]'}`} />
                            : <Icon name="check-circle" className={`w-3.5 h-3.5 ${'text-[color:var(--status-positive)]'}`} />}
                          <p className={`text-xs ${d?.monitoring?.isStale ? ('text-[color:var(--status-watch)]') : ('text-[color:var(--status-positive)]')}`}>
                            {d?.monitoring?.isStale
                              ? 'Monitoring data is stale — no fresh DTC check available'
                              : 'Monitoring is active — data is within the freshness window'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Complaint List Modal ─── */}
      {showComplaintsModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowComplaintsModal)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`}
            style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}
          >
            <button type="button" onClick={() => closeModal(setShowComplaintsModal)} className={`absolute top-5 right-5 p-1.5 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>
            <div className="mb-4">
              <h2 className="text-base font-semibold mb-1 text-foreground">Complaint List</h2>
              <p className={`text-xs text-muted-foreground`}>Driver / staff technical observations (return protocol, inspections)</p>
            </div>

            <div className={`rounded-lg p-4 mb-4 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Manual entry</p>
              <textarea
                value={complaintForm.description}
                onChange={(e) => setComplaintForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the issue…"
                rows={3}
                className={`w-full rounded-xl px-3 py-2 text-sm border outline-none mb-2 ${'bg-background border border-border text-foreground placeholder:text-muted-foreground'}`}
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  value={complaintForm.region}
                  onChange={(e) => setComplaintForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Affected region (e.g. front axle)"
                  className={`rounded-xl px-3 py-2 text-xs border outline-none ${'bg-background border border-border text-foreground placeholder:text-muted-foreground'}`}
                />
                <select
                  value={complaintForm.urgency}
                  onChange={(e) => setComplaintForm((f) => ({ ...f, urgency: e.target.value }))}
                  className={`rounded-xl px-3 py-2 text-xs border outline-none ${'bg-background border border-border text-foreground'}`}
                >
                  {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={submittingComplaint || !complaintForm.description.trim() || !orgId}
                onClick={() => void submitComplaint()}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${'sq-tone-brand text-white hover:opacity-90'} disabled:opacity-50`}
              >
                {submittingComplaint ? <Icon name="loader-2" className="w-4 h-4 animate-spin inline" /> : 'Save complaint'}
              </button>
            </div>

            <h3 className={`text-sm font-semibold mb-3 text-foreground`}>Active</h3>
            <div className="space-y-2 mb-4">
              {complaints.filter((c) => c.status === 'ACTIVE').length === 0 ? (
                <p className={`text-sm text-muted-foreground`}>No active Feedbacks</p>
              ) : (
                complaints.filter((c) => c.status === 'ACTIVE').map((c) => (
                  <div key={c.id} className={`rounded-xl p-3 border bg-muted border-border`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase ${'text-[color:var(--status-watch)]'}`}>{c.urgency}</span>
                      <span className={`text-[10px] text-muted-foreground`}>{new Date(c.createdAt).toLocaleString('de-DE')}</span>
                    </div>
                    <p className={`text-sm text-foreground`}>{c.description}</p>
                    {c.region && <p className={`text-xs mt-1 text-muted-foreground`}>Region: {c.region}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {c.createdByUserId && <span className={`text-[10px] text-muted-foreground/70`}>By: {c.createdByUserId}</span>}
                      <span className={`text-[10px] text-muted-foreground/70`}>Source: {c.source}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h3 className={`text-sm font-semibold mb-3 text-foreground`}>History</h3>
            <div className="space-y-2">
              {complaints.filter((c) => c.status === 'RESOLVED').length === 0 ? (
                <p className={`text-sm text-muted-foreground`}>No resolved entries yet</p>
              ) : (
                complaints.filter((c) => c.status === 'RESOLVED').map((c) => (
                  <div key={c.id} className={`rounded-xl p-3 border opacity-80 bg-muted border-border`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase text-muted-foreground`}>{c.urgency}</span>
                      <span className={`text-[10px] text-muted-foreground`}>{new Date(c.createdAt).toLocaleString('de-DE')}</span>
                    </div>
                    <p className={`text-sm text-foreground/80`}>{c.description}</p>
                    {c.region && <p className={`text-xs mt-1 text-muted-foreground`}>Region: {c.region}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {c.createdByUserId && <span className={`text-[10px] text-muted-foreground/70`}>By: {c.createdByUserId}</span>}
                      {c.resolvedAt && <span className={`text-[10px] ${'text-[color:var(--status-positive)]'}`}>Resolved: {new Date(c.resolvedAt).toLocaleDateString('de-DE')}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Battery Modal ─── */}
      {showBattery && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowBattery)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowBattery)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {/* Header + condition badge */}
            <div className="flex items-center gap-3 mb-5">
              <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Battery Health</h2>
              {lvNoBatteryDetected ? (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${'sq-chip-neutral'}`}>Not detected</span>
              ) : lvIsCalibrating ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">Calibrating</span>
              ) : lvIsStabilizing ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">Estimated · Stabilizing</span>
              ) : (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  batteryCondition === 'good' ? 'bg-green-100 text-green-700' : batteryCondition === 'watch' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>{batteryCondition === 'good' ? 'Healthy' : batteryCondition === 'watch' ? 'Monitor' : 'Attention'}</span>
              )}
              {!lvNoBatteryDetected && !lvIsCalibrating && bSummary?.trendDirection && bSummary.trendDirection !== 'unknown' && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  bSummary.trendDirection === 'stable' ? ('sq-chip-neutral') :
                  bSummary.trendDirection === 'improving' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                }`}>{bSummary.trendDirection === 'stable' ? 'Stable' : bSummary.trendDirection === 'improving' ? 'Improving' : 'Declining'}</span>
              )}
              {/* Maturity info in detail view */}
              {bSummary?.currentState?.maturityConfidence && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-neutral'}`}>
                  Confidence: {bSummary.currentState.maturityConfidence}
                </span>
              )}
            </div>

            {/* Current state cards */}
            <div className="flex gap-3 mb-5">
              <div className={`flex-1 rounded-lg px-4 py-3 ${'sq-tone-brand'}`}>
                <div className="flex items-center gap-1.5 mb-1"><Icon name="battery-charging" className={`w-3 h-3 ${'text-[color:var(--brand)]'}`} /><span className={`text-[10px] uppercase tracking-wider font-semibold ${'text-[color:var(--brand)]'}`}>Voltage</span></div>
                <div className="flex items-baseline gap-1"><span className={`text-sm font-bold text-foreground`}>{voltageDisplay}</span><span className={`text-xs text-muted-foreground`}>V</span></div>
              </div>
              <div className={`flex-1 rounded-lg px-4 py-3 bg-muted`}>
                <div className="flex items-center gap-1.5 mb-1"><Icon name="clock" className={`w-3 h-3 text-muted-foreground`} /><span className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Last Check</span></div>
                <div className="flex items-baseline gap-1"><span className={`text-sm font-bold text-foreground`}>{batteryLastCheckedAgo || '—'}</span></div>
              </div>
              <div className={`flex-1 rounded-lg px-4 py-3 ${bSummary?.currentState.temperatureC != null && bSummary.currentState.temperatureC < 5 ? ('sq-tone-info') : 'bg-muted'}`}>
                <div className="flex items-center gap-1.5 mb-1"><Icon name="thermometer" className={`w-3 h-3 ${bSummary?.currentState.temperatureC != null && bSummary.currentState.temperatureC < 5 ? ('text-[color:var(--status-info)]') : ('text-muted-foreground')}`} /><span className={`text-[10px] uppercase tracking-wider font-semibold ${bSummary?.currentState.temperatureC != null && bSummary.currentState.temperatureC < 5 ? ('text-[color:var(--status-info)]') : ('text-muted-foreground')}`}>Temperature</span></div>
                <div className="flex items-baseline gap-1"><span className={`text-sm font-bold text-foreground`}>{bSummary?.currentState.temperatureC != null ? `${bSummary.currentState.temperatureC}°C` : '—'}</span></div>
              </div>
            </div>

            {(bSummary?.currentTelemetry?.socPercent != null ||
              bSummary?.currentTelemetry?.rangeKm != null ||
              bSummary?.currentTelemetry?.chargingPowerKw != null ||
              bSummary?.currentTelemetry?.chargingState != null) && (
              <div className={`rounded-lg p-4 mb-5 ${'sq-tone-success border border-border'}`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 ${'text-[color:var(--status-positive)]'}`}>
                  Current Battery State (Not Health)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">SoC</p>
                    <p className="text-sm font-bold text-foreground">
                      {bSummary?.currentTelemetry?.socPercent != null
                        ? `${Math.round(bSummary.currentTelemetry.socPercent)}%`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Range</p>
                    <p className="text-sm font-bold text-foreground">
                      {bSummary?.currentTelemetry?.rangeKm != null
                        ? `${Math.round(bSummary.currentTelemetry.rangeKm)} km`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Charging</p>
                    <p className="text-sm font-bold text-foreground">
                      {bSummary?.currentTelemetry?.chargingState === 'charging'
                        ? 'Charging'
                        : bSummary?.currentTelemetry?.chargingState === 'not_charging'
                          ? 'Not charging'
                          : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Charge Power</p>
                    <p className="text-sm font-bold text-foreground">
                      {bSummary?.currentTelemetry?.chargingPowerKw != null
                        ? `${Math.round(bSummary.currentTelemetry.chargingPowerKw * 10) / 10} kW`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Estimated Battery Health + Resting Voltage */}
            {(() => {
              if (lvNoBatteryDetected) {
                return (
                  <div className={`rounded-lg px-5 py-4 mb-5 ${'bg-muted/60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Estimated Battery Health</p>
                      <span className={`text-sm font-semibold text-foreground`}>No LV Battery detected</span>
                    </div>
                    <p className={`text-[11px] text-muted-foreground`}>
                      Für dieses Fahrzeug wird kein 12V-Signal (<code className="px-1 py-0.5 rounded bg-muted text-[10px]">lowVoltageBatteryCurrentVoltage</code>) über die DIMO-Telemetrie gemeldet. Entweder besitzt das Fahrzeug keine separat überwachte LV-Batterie, oder der Hersteller/das Fahrzeug liefert dieses Signal nicht aus. Es werden keine Messwerte gesammelt.
                    </p>
                  </div>
                );
              }
              if (lvIsCalibrating) {
                return (
                  <div className={`rounded-lg px-5 py-4 mb-5 ${'sq-tone-info'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-[10px] uppercase tracking-wider font-semibold ${'text-[color:var(--status-info)]'}`}>Estimated Battery Health</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold ${'text-[color:var(--status-info)]'}`}>Calibrating</span>
                        <span className="inline-flex">{[0,1,2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${'bg-[color:var(--status-info)]'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}</span>
                      </div>
                    </div>
                    <p className={`text-[10px] ${'text-[color:var(--status-info)]'}`}>{calibrationStatusText}</p>
                    {calibrationMetricsText && <p className={`text-[10px] mt-1 ${'text-[color:var(--status-info)]'}`}>{calibrationMetricsText}</p>}
                    {calibrationFreshnessText && <p className={`text-[10px] mt-1 ${'text-[color:var(--status-watch)]'}`}>{calibrationFreshnessText}</p>}
                    {lvCalibration && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className={`rounded-lg px-3 py-2 ${'bg-muted/50'}`}>
                          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Tage</p>
                          <p className="text-sm font-bold text-foreground">{formatCalibrationDays(lvCalibration.daysSinceFirstMeasurement)}/{lvCalibration.minimumDaysForStabilizing}</p>
                        </div>
                        <div className={`rounded-lg px-3 py-2 ${'bg-muted/50'}`}>
                          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Events</p>
                          <p className="text-sm font-bold text-foreground">{lvCalibration.qualifiedEventCount}/{lvCalibration.minimumQualifiedEventsForStabilizing}</p>
                        </div>
                        <div className={`rounded-lg px-3 py-2 ${'bg-muted/50'}`}>
                          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Ruhe</p>
                          <p className="text-sm font-bold text-foreground">{lvCalibration.restObservationCount}/{lvCalibration.minimumRestObservationsForStabilizing}</p>
                        </div>
                        {lvCalibration.minimumCrankObservationsForStabilizing > 0 && (
                          <div className={`rounded-lg px-3 py-2 ${'bg-muted/50'}`}>
                            <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">Starts</p>
                            <p className="text-sm font-bold text-foreground">{lvCalibration.crankObservationCount}/{lvCalibration.minimumCrankObservationsForStabilizing}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              const lvAggStatus = bSummary?.lv?.healthStatus
                ?? (lvEstimatedStatus !== 'UNKNOWN' ? lvEstimatedStatus : 'UNKNOWN');
              const bgCol =
                lvAggStatus === 'GOOD' ? ('sq-tone-success') :
                lvAggStatus === 'WATCH' ? ('sq-tone-watch') :
                lvAggStatus === 'WARNING' ? ('sq-tone-warning') :
                lvAggStatus === 'CRITICAL' ? ('sq-tone-critical') :
                ('bg-muted/60');
              return (
                <div className={`rounded-lg px-5 py-4 mb-5 ${bgCol}`}>
                  {/* Estimated Battery Health — behaviour-derived 3-bar indicator. */}
                  <div className="flex items-center justify-between mb-2" title={lvEstimatedTooltip}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Estimated Battery Health</p>
                    <BatteryConditionBars status={lvEstimatedStatus} bars={lvEstimatedBars} size="md" />
                  </div>
                  {/* Resting Voltage — current rest/charge state, separate from health. */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>
                      Resting Voltage{lvBatteryTypeLabel ? ` · ${lvBatteryTypeLabel}` : ''}
                    </p>
                    {lvRestingValue != null ? (
                      <RestingVoltageBadge valueV={lvRestingValue} status={lvRestingStatus} />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground">Not available</span>
                    )}
                  </div>
                  <p className={`text-[9px] mt-2 leading-snug ${'text-muted-foreground/70'}`}>
                    {lvEstimatedTooltip}
                  </p>
                  {lvIsStabilizing && <p className={`text-[9px] mt-1.5 ${'text-[color:var(--status-watch)]/60'}`}>Estimate is stabilizing — may refine over the next few days</p>}
                </div>
              );
            })()}

            {/* Voltage Trend Chart */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <div className="flex justify-center mb-4">
                <div className={`inline-flex rounded-full p-0.5 ${'bg-muted'}`}>
                  <button onClick={() => setBatteryChartTab('woche')} className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${batteryChartTab === 'woche' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Week</button>
                  <button onClick={() => setBatteryChartTab('monat')} className={`px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${batteryChartTab === 'monat' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Month</button>
                </div>
              </div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-center text-muted-foreground`}>Voltage Trend</p>
              <div className="mt-1">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={batteryChartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                    <ReferenceArea y1={14} y2={18} fill="#ef4444" fillOpacity={0.15} />
                    <ReferenceArea y1={13} y2={14} fill="#f59e0b" fillOpacity={0.15} />
                    <ReferenceArea y1={11} y2={13} fill="#22c55e" fillOpacity={0.2} />
                    <ReferenceArea y1={9} y2={11} fill="#f59e0b" fillOpacity={0.15} />
                    <ReferenceArea y1={6} y2={9} fill="#ef4444" fillOpacity={0.15} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <YAxis domain={[6, 18]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: 'var(--muted-foreground)' }} label={{ value: 'Volt', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 9, fill: 'var(--muted-foreground)' } }} />
                    <Tooltip cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }} content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        const v = d.volt;
                        const st = v >= 11 && v <= 13 ? 'Good' : v >= 9 && v <= 14 ? 'Warning' : 'Critical';
                        const sc = st === 'Good' ? 'text-green-500' : st === 'Warning' ? 'text-amber-500' : 'text-red-500';
                        const sb = st === 'Good' ? 'sq-tone-success' : st === 'Warning' ? 'sq-tone-watch' : 'sq-tone-critical';
                        return (<div className="rounded-lg px-3 py-2.5 shadow-lg border border-border bg-popover text-popover-foreground"><div className="flex items-center gap-2 mb-1.5"><span className={`text-xs font-semibold text-foreground`}>{d.day}</span><span className={`text-[10px] text-muted-foreground`}>{d.time}</span></div><div className="flex items-baseline gap-1.5"><span className={`text-sm font-bold text-foreground`}>{v.toFixed(1)}</span><span className={`text-[10px] text-muted-foreground`}>V</span></div><div className={`mt-1.5 inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${sb} ${sc}`}>{st}</div></div>);
                      }
                      return null;
                    }} />
                    <Line type="monotone" dataKey="volt" stroke='var(--foreground)' strokeWidth={2.5} dot={{ r: 4, fill: 'var(--foreground)', stroke: 'var(--muted-foreground)', strokeWidth: 2 }} activeDot={{ r: 6, fill: 'var(--brand)', stroke: 'var(--card)', strokeWidth: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500" /><span className={`text-[10px] ${'text-muted-foreground'}`}>Good (11–13V)</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className={`text-[10px] ${'text-muted-foreground'}`}>Warning</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /><span className={`text-[10px] ${'text-muted-foreground'}`}>Critical</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Watchpoints */}
              {bSummary && bSummary.watchpoints.length > 0 && (
                <div className={`rounded-lg p-5 ${'sq-tone-watch border border-border'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${'text-[color:var(--status-watch)]'}`}>Watchpoints</p>
                  <div className="space-y-2">
                    {bSummary.watchpoints.map((w, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Icon name="alert-triangle" className={`w-3 h-3 mt-0.5 shrink-0 ${'text-[color:var(--status-watch)]'}`} />
                        <p className={`text-xs leading-relaxed text-foreground/80`}>{w}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {bSummary && bSummary.recommendations.length > 0 && (
                <div className={`rounded-lg p-5 ${'sq-tone-info border border-border'}`}>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 ${'text-[color:var(--status-info)]'}`}>Recommendations</p>
                  <div className="space-y-2">
                    {bSummary.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Icon name="check-circle" className={`w-3 h-3 mt-0.5 shrink-0 ${'text-[color:var(--status-info)]'}`} />
                        <p className={`text-xs leading-relaxed text-foreground/80`}>{r}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Factory Specification */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Specification</p>
              <div className={`divide-y divide-border`}>
                {[
                  { label: 'Battery Type', value: bSummary?.specs?.batteryType || '—' },
                  { label: 'Capacity', value: bSummary?.specs?.batteryAmpere ? `${bSummary.specs.batteryAmpere} Ah` : '—' },
                  { label: 'Nominal Voltage', value: bSummary?.specs?.batteryVolt ? `${bSummary.specs.batteryVolt} V` : '—' },
                  { label: 'Data Source', value: bSummary?.specs?.sourceType ? bSummary.specs.sourceType.toLowerCase() : '—' },
                ].map((spec) => (
                  <div key={spec.label} className="flex items-center justify-between py-2">
                    <span className={`text-xs ${'text-muted-foreground'}`}>{spec.label}</span>
                    <span className={`text-xs font-semibold capitalize text-foreground`}>{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Readings */}
            {(bSummary?.currentState.restingVoltage != null || bSummary?.currentState.crankingVoltage != null || bSummary?.currentState.chargingVoltage != null) && (
              <div className={`rounded-lg p-5 mb-5 bg-muted`}>
                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Detailed Readings</p>
                <div className={`divide-y divide-border`}>
                  {[
                    bSummary?.currentState.restingVoltage != null ? { l: 'Resting Voltage', v: `${bSummary.currentState.restingVoltage} V` } : null,
                    bSummary?.currentState.crankingVoltage != null ? { l: 'Cranking Voltage', v: `${bSummary.currentState.crankingVoltage} V` } : null,
                    bSummary?.currentState.chargingVoltage != null ? { l: 'Charging Voltage', v: `${bSummary.currentState.chargingVoltage} V` } : null,
                  ].filter(Boolean).map((r: any) => (
                    <div key={r.l} className="flex items-center justify-between py-2">
                      <span className={`text-xs ${'text-muted-foreground'}`}>{r.l}</span>
                      <span className={`text-xs font-semibold text-foreground`}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Battery History */}
            <div>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>History</p>
              {bSummary && bSummary.history.length > 0 ? (
                <div className="space-y-2">
                  {bSummary.history.slice(0, 15).map((h) => (
                    <div key={h.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${h.type === 'service' ? 'bg-blue-100' : 'bg-indigo-100'}`}>
                        {h.type === 'service' ? <Icon name="wrench" className="w-3 h-3 text-blue-600" /> : <Icon name="activity" className="w-3 h-3 text-indigo-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold text-foreground`}>
                          {h.type === 'service' ? 'Battery Service' : 'Measurement'}
                          {h.voltage != null && <span className={`ml-2 font-normal text-muted-foreground`}>{h.voltage.toFixed(1)} V</span>}
                          {h.soh != null && <span className={`ml-2 font-normal text-muted-foreground`}>SOH {Math.round(h.soh)}%</span>}
                        </p>
                        {h.workshopName && <p className={`text-[10px] text-muted-foreground`}>{h.workshopName}</p>}
                        {h.notes && <p className={`text-[10px] text-muted-foreground`}>{h.notes}</p>}
                      </div>
                      <span className={`text-[10px] shrink-0 text-muted-foreground/70`}>{new Date(h.date).toLocaleDateString('de-DE')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-xs text-muted-foreground/70`}>No battery history available yet</p>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* ─── Service Modal ─── */}
      {showService && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => closeModal(setShowService)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowService)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>
            <h2 className={`text-sm font-semibold tracking-tight mb-5 text-foreground`}>Service Info</h2>

            {/* Next Service */}
            {(() => {
              const si = serviceInfo;
              const overdue = si?.serviceOverdue === true;
              const imminent = si?.serviceDueImminently === true && !overdue;

              const panelBg = overdue
                ? 'sq-tone-critical'
                : imminent
                  ? 'sq-tone-watch'
                  : 'sq-tone-info';
              const headerText = overdue
                ? 'text-[color:var(--status-critical)]'
                : imminent
                  ? 'text-[color:var(--status-watch)]'
                  : 'text-[color:var(--status-info)]';
              const bodyText = overdue
                ? 'text-red-700 dark:text-red-300'
                : imminent
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-foreground';
              const headerLabel = overdue
                ? 'Nächster Service — ÜBERFÄLLIG'
                : imminent
                  ? 'Nächster Service — fällig'
                  : 'Nächster Service in';

              const bodyValue = (() => {
                if (!si) return '—';
                // Same source-precedence as the card: DB baseline OR HM stream
                // OR any remaining/overdue number we already know about.
                const hasAnySource =
                  si.hasServiceBaseline ||
                  si.hmServiceSource === true ||
                  si.serviceRemainingDays != null ||
                  si.serviceRemainingMonths != null ||
                  si.serviceRemainingKm != null ||
                  si.serviceOverdue === true;
                if (!hasAnySource) return '—';
                if (overdue) {
                  const parts: string[] = [];
                  if (si.serviceOverdueDays != null) parts.push(`${si.serviceOverdueDays} Tagen`);
                  if (si.serviceOverdueKm != null) parts.push(`${si.serviceOverdueKm.toLocaleString('de-DE')} km`);
                  return parts.length > 0 ? `Überfällig seit ${parts.join(' / ')}` : 'Überfällig';
                }
                const parts: string[] = [];
                if (si.serviceRemainingDays != null && si.serviceRemainingDays <= 90) {
                  parts.push(`${si.serviceRemainingDays} Tage`);
                } else if (si.serviceRemainingMonths != null) {
                  parts.push(`${si.serviceRemainingMonths} Monate`);
                }
                if (si.serviceRemainingKm != null && si.serviceRemainingKm >= 0) {
                  parts.push(`${si.serviceRemainingKm.toLocaleString('de-DE')} km`);
                }
                return parts.length > 0 ? parts.join(' oder ') : '—';
              })();

              return (
                <div className={`rounded-lg p-5 mb-5 ${panelBg}`}>
                  <p className={`text-sm font-semibold mb-2 ${headerText}`}>{headerLabel}</p>
                  <p className={`text-sm font-bold mb-1 ${bodyText}`}>{bodyValue}</p>
                  <p className={`text-xs mb-3 text-muted-foreground`}>whichever comes first</p>
                  {si?.serviceRemainingPercent != null && (
                    <div className={`w-full h-2 rounded-full overflow-hidden ${'bg-muted'}`}>
                      <div
                        className={`h-full rounded-full transition-all ${
                          overdue
                            ? 'bg-red-500'
                            : imminent
                              ? 'bg-amber-500'
                              : si.serviceRemainingPercent >= 50
                                ? 'bg-green-500'
                                : si.serviceRemainingPercent >= 25
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                        }`}
                        style={{ width: `${si.serviceRemainingPercent}%` }}
                      />
                    </div>
                  )}
                  {(overdue || imminent) && (
                    <p className={`text-[11px] mt-3 leading-relaxed font-medium ${overdue ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                      {overdue
                        ? 'Werkstatttermin sofort vereinbaren. Garantie- und Betriebssicherheit können gefährdet sein; bei einer laufenden Buchung bitte den Fahrer informieren.'
                        : 'Werkstatttermin planen — idealerweise vor der nächsten Buchung, um Stornos oder Pickup-Risiken zu vermeiden.'}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Active auto-tasks (V4.7.59) — materialized by the Insight→Task bridge */}
            {serviceAutoTasks.length > 0 && (
              <div className="rounded-lg p-4 mb-5 border border-amber-300/50 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
                <div className="flex items-center gap-2 mb-2.5">
                  <Icon name="list-todo" className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Automatisch erzeugte Tasks ({serviceAutoTasks.length})
                  </p>
                </div>
                <div className="space-y-1.5">
                  {serviceAutoTasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-amber-900 dark:text-amber-100 truncate">{t.title}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.priority === 'URGENT' ? 'bg-red-500/15 text-red-600 dark:text-red-300' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                        {t.priority === 'URGENT' ? 'Überfällig' : 'Bald fällig'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] mt-2.5 text-amber-700/80 dark:text-amber-300/70">
                  Sichtbar unter Task Management — wird automatisch geschlossen, sobald der Termin erledigt ist.
                </p>
              </div>
            )}

            {/* Manufacturer Interval */}
            <div className={`rounded-lg p-5 mb-5 bg-muted`}>
              <p className={`text-[10px] uppercase tracking-wider font-semibold mb-4 text-muted-foreground`}>Manufacturer Interval</p>
              <div className={`divide-y divide-border`}>
                {[
                  { l: 'Interval (km)', v: serviceInfo?.intervalKm ? `every ${serviceInfo.intervalKm.toLocaleString()} km` : '—' },
                  { l: 'Interval (months)', v: serviceInfo?.intervalMonths ? `every ${serviceInfo.intervalMonths} months` : '—' },
                ].map(s => (
                  <div key={s.l} className="flex items-center justify-between py-2.5"><span className={`text-xs ${'text-muted-foreground'}`}>{s.l}</span><span className={`text-xs font-semibold text-foreground`}>{s.v}</span></div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Service History */}
              <div>
                <h3 className={`text-sm font-semibold mb-4 text-foreground`}>Service History</h3>
                {serviceInfo && serviceInfo.serviceHistory.length > 0 ? (
                  <div className="space-y-4">
                    {serviceInfo.serviceHistory.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="shrink-0 min-w-0">
                          <p className={`text-sm font-semibold text-foreground`}>{item.eventType.replace(/_/g, ' ')}</p>
                          <p className={`text-xs text-muted-foreground`}>{new Date(item.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' })}</p>
                        </div>
                        {item.odometerKm != null && <div className="shrink-0 text-right"><p className={`text-xs text-muted-foreground`}>{item.odometerKm.toLocaleString()} km</p></div>}
                        {item.workshopName && <p className={`text-[10px] shrink-0 text-muted-foreground`}>{item.workshopName}</p>}
                        <span className="ml-auto px-3 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-700 shrink-0">Completed</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-xs text-muted-foreground/70`}>No service records yet</p>
                )}
              </div>

              {/* TÜV + BOKraft */}
              <div className="space-y-3">
                {/* TÜV */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 text-foreground`}>TÜV</h3>
                  <div className={`rounded-lg p-4 mb-4 border bg-muted border-border`}>
                    <div className="flex items-center gap-3">
                      <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Valid till</p><p className={`text-sm font-bold text-foreground`}>{serviceInfo?.tuvValidTill ? new Date(serviceInfo.tuvValidTill).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'}</p></div>
                      <div className="ml-auto text-right">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Remaining</p>
                        {(() => {
                          const days = serviceInfo?.tuvRemainingDays ?? null;
                          const months = serviceInfo?.tuvRemainingMonths ?? null;
                          const tuvOverdue = serviceInfo?.tuvOverdue === true;
                          const color = tuvOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : days != null && days <= 90
                              ? 'text-red-500'
                              : days != null && days <= 180
                                ? 'text-orange-500'
                                : 'text-[color:var(--status-positive)]';
                          const label = days == null
                            ? '—'
                            : tuvOverdue
                              ? `Abgelaufen seit ${Math.abs(days)} Tagen`
                              : days <= 60
                                ? `${days} Tage`
                                : `${months} Monate`;
                          return <p className={`text-sm font-bold ${color}`}>{label}</p>;
                        })()}
                      </div>
                    </div>
                  </div>
                  {serviceInfo && serviceInfo.tuvHistory.length > 0 && (
                    <>
                      <p className={`text-xs font-semibold mb-2 text-muted-foreground`}>History</p>
                      <div className="space-y-2">
                        {serviceInfo.tuvHistory.map((item) => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0"><p className={`text-xs font-semibold text-foreground`}>TÜV &bull; {new Date(item.date).toLocaleDateString('de-DE')}</p>{item.notes && <p className={`text-[10px] text-muted-foreground`}>{item.notes}</p>}</div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 shrink-0">Passed</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* BOKraft */}
                <div>
                  <h3 className={`text-sm font-semibold mb-3 text-foreground`}>BOKraft</h3>
                  <div className={`rounded-lg p-4 mb-4 border bg-muted border-border`}>
                    <div className="flex items-center gap-3">
                      <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Valid till</p><p className={`text-sm font-bold text-foreground`}>{serviceInfo?.bokraftValidTill ? new Date(serviceInfo.bokraftValidTill).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' }) : '—'}</p></div>
                      <div className="ml-auto text-right">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Remaining</p>
                        {(() => {
                          const days = serviceInfo?.bokraftRemainingDays ?? null;
                          const months = serviceInfo?.bokraftRemainingMonths ?? null;
                          const bokOverdue = serviceInfo?.bokraftOverdue === true;
                          const color = bokOverdue
                            ? 'text-red-600 dark:text-red-400'
                            : days != null && days <= 60
                              ? 'text-red-500'
                              : days != null && days <= 120
                                ? 'text-orange-500'
                                : 'text-[color:var(--status-positive)]';
                          const label = days == null
                            ? '—'
                            : bokOverdue
                              ? `Abgelaufen seit ${Math.abs(days)} Tagen`
                              : days <= 60
                                ? `${days} Tage`
                                : `${months} Monate`;
                          return <p className={`text-sm font-bold ${color}`}>{label}</p>;
                        })()}
                      </div>
                    </div>
                  </div>
                  {serviceInfo && serviceInfo.bokraftHistory.length > 0 && (
                    <>
                      <p className={`text-xs font-semibold mb-2 text-muted-foreground`}>History</p>
                      <div className="space-y-2">
                        {serviceInfo.bokraftHistory.map((item) => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0"><p className={`text-xs font-semibold text-foreground`}>BOKraft &bull; {new Date(item.date).toLocaleDateString('de-DE')}</p>{item.notes && <p className={`text-[10px] text-muted-foreground`}>{item.notes}</p>}</div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 shrink-0">Passed</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Brakes Modal V2 ─── */}
      {showBrakes && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!showBrakeEntry) closeModal(setShowBrakes); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowBrakes)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {(() => {
              const bhs = brakeHealthSummary;
              const bhd = brakeHealthDetail;
              const stateClass = bhs?.stateClass ?? 'NO_BASELINE';
              const v2 = stateClass === 'MEASURED' || stateClass === 'ESTIMATED';
              const cardBg = 'bg-muted';
              const hSec = 'text-xs font-bold uppercase tracking-wider mb-3 text-muted-foreground';
              const lbl = 'text-[10px] uppercase tracking-wider font-semibold text-muted-foreground';
              const val = 'text-sm font-bold text-foreground';
              const sub = 'text-[10px] text-muted-foreground';

              const mkBar = (pct: number) => {
                const c = pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-500';
                return <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1.5 'bg-muted'`}><div className={`h-full rounded-full transition-all ${c}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>;
              };

              const statusBadgeCls =
                stateClass === 'MEASURED'
                  ? 'sq-chip-success'
                  : stateClass === 'ESTIMATED'
                    ? 'sq-chip-info'
                    : stateClass === 'WARNING_ONLY'
                      ? 'sq-chip-watch'
                      : 'sq-chip-nodata';
              const statusLabel =
                stateClass === 'MEASURED'
                  ? 'Measured'
                  : stateClass === 'ESTIMATED'
                    ? 'Estimated'
                    : stateClass === 'WARNING_ONLY'
                      ? 'Warning only'
                      : 'No baseline';

              const axleCard = (label: string, est: any | null | undefined) => {
                if (!est) return null;
                const pct = est.healthPct ?? 0;
                const statusColor = pct >= 60 ? 'text-[color:var(--status-positive)]' : pct >= 30 ? 'text-[color:var(--status-watch)]' : 'text-[color:var(--status-critical)]';
                return (
                  <div className={`rounded-xl p-4 ${cardBg}`}>
                    <p className={`${lbl} mb-2`}>{label}</p>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={`text-xl font-bold text-foreground`}>{Math.round(pct)}%</span>
                      {est.estimatedMm != null && <span className={sub}>{est.estimatedMm} mm</span>}
                    </div>
                    {mkBar(pct)}
                    <div className="flex items-center justify-between mt-2">
                      <span className={sub}>~{(est.remainingKm ?? 0).toLocaleString('de-DE')} km left</span>
                      <span className={`text-[10px] font-semibold capitalize ${statusColor}`}>{pct >= 60 ? 'Good' : pct >= 30 ? 'Watch' : 'Replace'}</span>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {/* ── A) Header ── */}
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Brake Health</h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusBadgeCls}`}>{statusLabel}</span>
                    {bhs?.confidence && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        bhs.confidence.label === 'High' ? 'sq-chip-success'
                        : bhs.confidence.label === 'Medium' ? 'sq-chip-watch'
                        : 'sq-chip-nodata'
                      }`}>{bhs.confidence.label} confidence ({bhs.confidence.score})</span>
                    )}
                  </div>
                  <p className={`text-[10px] mb-4 text-muted-foreground/70`}>
                    {v2
                      ? 'Canonical V2 anchor-based brake wear model (pads + discs, limiting component aware).'
                      : stateClass === 'WARNING_ONLY'
                        ? 'No modeled baseline yet. Warning telemetry is shown as warning-only context.'
                        : 'Brake wear estimation starts after a documented baseline with odometer and thickness anchor.'}
                  </p>

                  {/* ── Canonical condition (evidence-based read model — measured vs estimated honesty) ── */}
                  {bhs && (bhs.overallCondition !== 'UNKNOWN' || bhs.reasons.length > 0 || bhs.openAlerts.length > 0) && (() => {
                    const overall = bhs.overallCondition ?? 'UNKNOWN';
                    const oStyle = brakeConditionStyle(overall);
                    const axleRow = (
                      title: string,
                      cond: string,
                      basis: string,
                      conf: string,
                      min: number | null,
                      max: number | null,
                    ) => {
                      const s = brakeConditionStyle(cond);
                      const range = formatBrakeKmRange(min, max);
                      return (
                        <div className={`rounded-xl p-3 ${cardBg}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className={lbl}>{title}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest ${s.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>
                          </div>
                          <p className={sub}>{BRAKE_BASIS_LABEL[basis] ?? 'Unknown'}{conf ? ` · ${BRAKE_CONFIDENCE_LABEL[conf] ?? 'Unknown'} confidence` : ''}</p>
                          <p className={`${val} mt-1`}>{range ? `${range} left` : 'Remaining life n/a'}</p>
                        </div>
                      );
                    };
                    return (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${oStyle.pill}`}><span className={`w-2 h-2 rounded-full ${oStyle.dot}`} />{oStyle.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold 'sq-chip-neutral'`}>{BRAKE_BASIS_LABEL[bhs.dataBasis] ?? 'Unknown'} basis</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold 'sq-chip-neutral'`}>{BRAKE_CONFIDENCE_LABEL[bhs.confidenceLevel] ?? 'Unknown'} confidence</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          {axleRow('Front Axle', bhs.frontAxleCondition, bhs.frontDataBasis, bhs.frontConfidence, bhs.estimatedFrontRemainingKmMin, bhs.estimatedFrontRemainingKmMax)}
                          {axleRow('Rear Axle', bhs.rearAxleCondition, bhs.rearDataBasis, bhs.rearConfidence, bhs.estimatedRearRemainingKmMin, bhs.estimatedRearRemainingKmMax)}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className={`rounded-xl p-3 ${cardBg}`}>
                            <p className={lbl}>Next inspection</p>
                            <p className={`${val} mt-1`}>{bhs.nextInspectionRecommendedInKm != null ? `${Math.round(bhs.nextInspectionRecommendedInKm).toLocaleString('de-DE')} km` : '—'}</p>
                          </div>
                          <div className={`rounded-xl p-3 ${cardBg}`}>
                            <p className={lbl}>Replacement due in</p>
                            <p className={`${val} mt-1`}>{bhs.estimatedReplacementDueInKm != null ? `${Math.round(bhs.estimatedReplacementDueInKm).toLocaleString('de-DE')} km` : '—'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className={`rounded-xl p-3 ${cardBg}`}>
                            <p className={lbl}>Last measurement</p>
                            <p className={`${val} mt-1`}>{bhs.lastMeasurementAt ? (formatMeasuredAgo(bhs.lastMeasurementAt) ?? new Date(bhs.lastMeasurementAt).toLocaleDateString('de-DE')) : '—'}</p>
                            {bhs.lastMeasurementMileageKm != null && <p className={sub}>@ {bhs.lastMeasurementMileageKm.toLocaleString('de-DE')} km</p>}
                          </div>
                          <div className={`rounded-xl p-3 ${cardBg}`}>
                            <p className={lbl}>Last service</p>
                            <p className={`${val} mt-1`}>{bhs.lastServiceAt ? (formatMeasuredAgo(bhs.lastServiceAt) ?? new Date(bhs.lastServiceAt).toLocaleDateString('de-DE')) : '—'}</p>
                            {bhs.lastServiceMileageKm != null && <p className={sub}>@ {bhs.lastServiceMileageKm.toLocaleString('de-DE')} km</p>}
                          </div>
                        </div>
                        {bhs.openAlerts.length > 0 && (
                          <div className="mb-3 space-y-1.5">
                            <h3 className={hSec}>Open Alerts</h3>
                            {bhs.openAlerts.map((a, i) => (
                              <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${a.severity === 'critical' ? 'sq-tone-critical' : a.severity === 'warning' ? 'sq-tone-watch' : 'sq-tone-info'}`}>
                                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                <p className="text-[11px] text-foreground">{a.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {bhs.recommendations.length > 0 && (
                          <div className="mb-3">
                            <h3 className={hSec}>Recommendations</h3>
                            <ul className="space-y-1">
                              {bhs.recommendations.map((r, i) => (<li key={i} className={sub}>• {r}</li>))}
                            </ul>
                          </div>
                        )}
                        {bhs.reasons.length > 0 && (
                          <div className="mb-4">
                            <h3 className={hSec}>Why this status</h3>
                            <ul className="space-y-1">
                              {bhs.reasons.map((r, i) => (<li key={i} className={sub}>• {r}</li>))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── NOT INITIALIZED STATE ── */}
                  {!v2 && (
                    <>
                      <div className={`rounded-xl p-4 mb-4 border 'sq-tone-watch border border-border'`}>
                        <h3 className={`text-sm font-bold mb-2 'text-[color:var(--status-watch)]'`}>Brake tracking not initialized</h3>
                        <p className={`text-xs leading-relaxed mb-3 'text-[color:var(--status-watch)]'`}>
                          Brake wear estimation starts after a documented brake service or confirmed workshop report. Without a known starting pad/disc thickness, no reliable estimation is possible. Pre-anchor driving data is being collected but will NOT be used retroactively — tracking starts clean from the service anchor odometer.
                        </p>
                        {(bhs?.baselineWarnings?.length ?? 0) > 0 && (
                          <div className="mb-3 space-y-1">
                            {bhs?.baselineWarnings?.slice(0, 3).map((w, idx) => (
                              <p key={idx} className={`text-[10px] 'text-[color:var(--status-watch)]'`}>- {w}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('manual'); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors 'sq-tone-ai hover:opacity-90'`}><Icon name="plus" className="w-3.5 h-3.5" /> Add Brake Service</button>
                          <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('upload'); }} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors 'sq-tone-info hover:opacity-90'`}><Icon name="upload" className="w-3.5 h-3.5" /> AI Upload Report</button>
                        </div>
                      </div>
                      <p className={`text-[10px] mb-4 text-muted-foreground/70`}>Driving and braking behavior is already being collected via the Driving Impact Engine and will be available once brake tracking is initialized.</p>
                    </>
                  )}

                  {/* ── INITIALIZED: B) Axle Health Visualization ── */}
                  {v2 && (
                    <div className="mb-4">
                      <h3 className={hSec}>Axle Health</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {axleCard('Brake Pads — Front', bhd?.frontPads)}
                        {axleCard('Brake Pads — Rear', bhd?.rearPads)}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {axleCard('Brake Discs — Front', bhd?.frontDiscs)}
                        {axleCard('Brake Discs — Rear', bhd?.rearDiscs)}
                      </div>
                      {bhd?.distanceSinceAnchorKm != null && (
                        <p className={`text-[10px] mt-2 text-muted-foreground/70`}>{bhd.distanceSinceAnchorKm.toLocaleString('de-DE')} km since anchor service</p>
                      )}
                    </div>
                  )}

                  {/* ── INITIALIZED: Alerts ── */}
                  {v2 && bhd?.alerts && bhd.alerts.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {bhd.alerts.map((a, i) => (
                        <div key={i} className={`rounded-lg px-4 py-2.5 flex items-start gap-2 ${
                          a.severity === 'critical' ? 'sq-tone-critical border border-border'
                          : a.severity === 'warning' ? 'sq-tone-watch border border-border'
                          : 'sq-tone-info border border-border'
                        }`}>
                          {a.severity === 'critical' ? <Icon name="shield-alert" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[color:var(--status-critical)]" /> : <Icon name="alert-triangle" className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.severity === 'warning' ? 'text-[color:var(--status-watch)]' : 'text-[color:var(--status-info)]'}`} />}
                          <span className={`text-xs 'text-foreground'`}>{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── C) Brake System Information ── */}
                  {(bhd?.specs || bhd?.brakeBiasInfo) && (
                    <div className="mb-4">
                      <h3 className={hSec}>Brake System Information</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`rounded-xl p-4 ${cardBg}`}>
                          <p className={`${lbl} mb-2.5`}>Front Axle</p>
                          <div className="space-y-2">
                            {[
                              { l: 'Rotor Diameter', v: bhd?.specs?.frontRotorDiameter },
                              { l: 'Rotor Width (NEW)', v: bhd?.specs?.frontRotorWidth },
                              { l: 'Pad Thickness', v: bhd?.specs?.frontPadThickness },
                            ].map(r => (
                              <div key={r.l} className="flex items-center justify-between">
                                <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                                <span className={val}>{r.v != null ? `${r.v} mm` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={`rounded-xl p-4 ${cardBg}`}>
                          <p className={`${lbl} mb-2.5`}>Rear Axle</p>
                          <div className="space-y-2">
                            {[
                              { l: 'Rotor Diameter', v: bhd?.specs?.rearRotorDiameter },
                              { l: 'Rotor Width (NEW)', v: bhd?.specs?.rearRotorWidth },
                              { l: 'Pad Thickness', v: bhd?.specs?.rearPadThickness },
                            ].map(r => (
                              <div key={r.l} className="flex items-center justify-between">
                                <span className={`text-xs text-muted-foreground`}>{r.l}</span>
                                <span className={val}>{r.v != null ? `${r.v} mm` : '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {bhd?.brakeBiasInfo && (
                        <div className={`rounded-xl p-3 mt-3 ${cardBg}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-xs text-muted-foreground`}>Brake Force Distribution</span>
                            <span className={val}>{bhd.brakeBiasInfo.front}% / {bhd.brakeBiasInfo.rear}%</span>
                          </div>
                          <p className={`text-[9px] mt-1 text-muted-foreground/70`}>{bhd.brakeBiasInfo.source}{bhd.brakeBiasInfo.source.includes('EBD') ? ' — actual distribution is managed by the vehicle EBD system; this is used as a modeling fallback' : ''}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── D) Brake History ── */}
                  <div className="mb-4">
                    <h3 className={hSec}>Brake History</h3>
                    {(bhd?.history ?? []).length > 0 ? (
                      <div className={`rounded-xl overflow-hidden 'bg-card'`}>
                        {(bhd?.history ?? []).map((item: any, i: number, arr: any[]) => (
                          <div key={item.id} className={`flex items-center px-4 py-3 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center mr-3 shrink-0 'sq-tone-success'`}>
                              <Icon name="wrench" className={`w-3 h-3 'text-[color:var(--status-positive)]'`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold text-foreground`}>{item.serviceKind ? String(item.serviceKind).replace(/_/g, ' ') : 'Brake Service'}</p>
                              <p className={`text-[10px] text-muted-foreground`}>{new Date(item.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}{item.workshopName ? ` · ${item.workshopName}` : ''}</p>
                              {item.notes && <p className={`text-[9px] mt-0.5 'text-muted-foreground'`}>{item.notes}</p>}
                            </div>
                            {item.odometerKm != null && <span className={`text-[10px] font-medium mr-2 text-muted-foreground`}>{item.odometerKm.toLocaleString('de-DE')} km</span>}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold 'sq-chip-success'`}>Serviced</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className={`rounded-xl p-5 text-center 'bg-card'`}>
                        <p className={`text-xs text-muted-foreground`}>No brake service events recorded yet.</p>
                      </div>
                    )}
                  </div>

                  {/* ── E) Actions ── */}
                  <div className="mb-4">
                    <h3 className={hSec}>Actions</h3>
                    {!showBrakeEntry && (
                      <div className="flex gap-2 mb-3">
                        <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('manual'); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors 'sq-tone-ai hover:opacity-90'`}><Icon name="plus" className="w-3 h-3" /> Add Brake Service</button>
                        <button onClick={() => { setShowBrakeEntry(true); setBrakeEntryMode('upload'); }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors 'sq-tone-info hover:opacity-90'`}><Icon name="upload" className="w-3 h-3" /> AI Upload Report</button>
                      </div>
                    )}
                    {showBrakeEntry && brakeEntryMode === 'manual' && (
                      <div className={`rounded-xl p-4 ${cardBg}`}>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div><label className={`block ${lbl} mb-1`}>Date *</label><input type="date" value={brakeForm.date} onChange={e => setBrakeForm(p => ({ ...p, date: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Odometer (km)</label><input type="number" value={brakeForm.odometerKm} onChange={e => setBrakeForm(p => ({ ...p, odometerKm: e.target.value }))} placeholder="Current mileage" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Workshop</label><input type="text" value={brakeForm.workshopName} onChange={e => setBrakeForm(p => ({ ...p, workshopName: e.target.value }))} placeholder="Optional" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Notes</label><input type="text" value={brakeForm.notes} onChange={e => setBrakeForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Front pads + discs" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                        </div>
                        <p className={`${lbl} mt-2 mb-2`}>New Component Specs (optional — enables V2 tracking)</p>
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          <div><label className={`block ${lbl} mb-1`}>Front Pad mm</label><input type="number" step="0.1" value={brakeForm.frontPadMm} onChange={e => setBrakeForm(p => ({ ...p, frontPadMm: e.target.value }))} placeholder="12" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Rear Pad mm</label><input type="number" step="0.1" value={brakeForm.rearPadMm} onChange={e => setBrakeForm(p => ({ ...p, rearPadMm: e.target.value }))} placeholder="10" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Front Rotor W mm</label><input type="number" step="0.1" value={brakeForm.frontRotorWidthMm} onChange={e => setBrakeForm(p => ({ ...p, frontRotorWidthMm: e.target.value }))} placeholder="28" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                          <div><label className={`block ${lbl} mb-1`}>Rear Rotor W mm</label><input type="number" step="0.1" value={brakeForm.rearRotorWidthMm} onChange={e => setBrakeForm(p => ({ ...p, rearRotorWidthMm: e.target.value }))} placeholder="22" className={`w-full px-3 py-2 rounded-lg text-xs border 'bg-background border border-border text-foreground placeholder:text-muted-foreground'`} /></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={handleLogBrakeChange} disabled={submittingBrake || !brakeForm.date} className="px-4 py-2 rounded-lg text-xs font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors">{submittingBrake ? 'Saving...' : 'Save Brake Service'}</button>
                          <button onClick={() => { setShowBrakeEntry(false); setBrakeEntryMode(null); }} className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors 'text-muted-foreground hover:text-foreground'`}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {showBrakeEntry && brakeEntryMode === 'upload' && (
                      <div className={`rounded-xl p-5 text-center ${cardBg}`}>
                        <Icon name="upload" className={`w-6 h-6 mx-auto mb-2 'text-[color:var(--status-info)]'`} />
                        <p className={`text-xs font-semibold mb-1 text-foreground`}>Upload Brake Service Document</p>
                        <p className={`text-[10px] mb-3 text-muted-foreground`}>Go to the AI Upload page to upload a brake service invoice or workshop report. Extracted data will be reviewed and confirmed before being applied.</p>
                        <button onClick={() => { setShowBrakeEntry(false); setBrakeEntryMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors 'text-muted-foreground hover:text-foreground'`}>Close</button>
                      </div>
                    )}
                  </div>

                  {/* ── F) Estimate Quality ── */}
                  {v2 && bhd && (
                    <div className="mb-2">
                      <h3 className={hSec}>Estimate Quality</h3>
                      <div className={`rounded-xl p-4 ${cardBg}`}>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className={lbl}>Confidence</p>
                            <p className={`text-lg font-bold mt-1 text-foreground`}>{bhs?.confidence?.score ?? 0}<span className={`text-xs font-normal text-muted-foreground`}>/100</span></p>
                          </div>
                          <div>
                            <p className={lbl}>DI Engine</p>
                            <p className={`text-xs font-semibold mt-1.5 ${bhd.drivingImpactAvailable ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground'}`}>{bhd.drivingImpactAvailable ? 'Connected' : 'No data'}</p>
                          </div>
                          <div>
                            <p className={lbl}>Model</p>
                            <p className={`text-xs font-semibold mt-1.5 'text-muted-foreground'`}>Anchor-based V2</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* ─── Tires Modal ─── */}
      {showTires && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { if (!showMeasurement && !showRotation && !showTireChange && !showEditSetup) closeModal(setShowTires); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-500 ease-out" style={{ opacity: isModalAnimating ? 1 : 0 }} />
          <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-xl p-5 shadow-lg transition-all duration-500 ease-out bg-card border border-border`} style={{ transform: isModalAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)', opacity: isModalAnimating ? 1 : 0 }}>
            <button onClick={() => closeModal(setShowTires)} className={`absolute top-5 right-5 p-1 rounded-full transition-colors z-10 ${'text-muted-foreground hover:text-foreground hover:bg-muted'}`}><Icon name="x" className="w-5 h-5" /></button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className={`text-sm font-semibold tracking-tight text-foreground`}>Tire Health</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-violet-500 to-purple-600 text-white">ML</span>
              {tireDetail?.factors.regressionActive && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-chip-info'}`}>Regression</span>}
              {tireDetail?.factors.isStaggered && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-chip-watch'}`}>Staggered</span>}
              {tireDetail && tireDetail.factors.regenBrakingFactorFront < 1 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-chip-success'}`}><Icon name="zap" className="w-3 h-3 inline -mt-0.5 mr-0.5" />Regen{tireDetail.factors.driveType ? ` (${tireDetail.factors.driveType})` : ''}</span>}
              {(tireDetail?.factors?.calibrationCount ?? 0) > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${'sq-tone-ai'}`}>{tireDetail?.factors?.calibrationCount}× calibrated</span>}
            </div>

            {/* Canonical Tire Status (single source of truth) */}
            {(() => {
              const cs = tireDetail?.summary ?? tireHealth;
              if (!cs?.overallStatus) return null;
              const style = tireStatusStyle(cs.overallStatus);
              const mm = cs.displayTreadMm ?? cs.lowestTreadMm ?? null;
              const mode = cs.displayMode ?? null;
              return (
                <div className={`rounded-xl p-3 mb-3 border ${'bg-muted/50 border border-border'}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${style.pill}`}>{style.label}</span>
                    {mm != null && (
                      <span className="text-xs text-foreground">
                        Lowest tread: <span className="font-bold">ca. {mm.toFixed(1)} mm</span>
                        {cs.lowestTreadPosition ? <span className="text-muted-foreground"> · {cs.lowestTreadPosition}</span> : null}
                      </span>
                    )}
                    {mode && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        mode === 'MEASURED'
                          ? ('sq-chip-info')
                          : ('sq-tone-ai')
                      }`}>
                        {mode === 'MEASURED' ? 'Measured' : mode === 'ESTIMATED' ? 'Estimated' : 'Unknown'}
                      </span>
                    )}
                    {cs.confidence && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${'sq-chip-neutral'}`}>
                        Confidence: {cs.confidence}
                      </span>
                    )}
                    {cs.estimatedRemainingKm != null && (
                      <span className="text-[10px] text-muted-foreground ml-auto">~{Math.floor(cs.estimatedRemainingKm).toLocaleString('de-DE')} km remaining</span>
                    )}
                  </div>
                  {(cs.lastMeasurementAt ?? cs.latestMeasurementAt) && (
                    <p className="text-[10px] mt-2 text-muted-foreground">Last measured: {formatMeasuredAgo(cs.lastMeasurementAt ?? cs.latestMeasurementAt) ?? '—'}</p>
                  )}
                  {(cs.recommendations ?? []).length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {(cs.recommendations ?? []).slice(0, 3).map((rec, i) => (
                        <li key={i} className="text-[11px] flex items-start gap-2 text-muted-foreground">
                          <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${'bg-[color:var(--status-info)]'}`} />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* Estimate Quality Badge */}
            {(() => {
              const conf = tireDetail?.summary ?? tireHealth;
              if (!conf) return null;
              const score = conf.confidenceScore ?? 0;
              const label = conf.confidenceLabel ?? 'Low';
              const bg = label === 'High' ? ('sq-tone-success border border-border') : label === 'Medium' ? ('sq-tone-watch border border-border') : ('sq-tone-critical border border-border');
              const tc = label === 'High' ? ('text-[color:var(--status-positive)]') : label === 'Medium' ? ('text-[color:var(--status-watch)]') : ('text-[color:var(--status-critical)]');
              return (
                <div className={`rounded-xl p-3 mb-5 border ${bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name="shield-alert" className={`w-4 h-4 ${tc}`} />
                      <span className={`text-xs font-semibold ${tc}`}>Estimate Quality: {label} ({score}%)</span>
                    </div>
                    {label !== 'High' && <span className={`text-[10px] text-muted-foreground`}>Manual measurement improves accuracy</span>}
                  </div>
                  <p className={`text-[10px] mt-1 text-muted-foreground`}>This is a modeled estimate based on tread baseline, mileage, trip profile, and driving behavior.</p>
                </div>
              );
            })()}

            {/* HM Tire Pressure Section */}
            {hmTirePressure && (
              <div className={`rounded-xl p-4 mb-5 border ${'sq-tone-ai border border-border'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">HM</span>
                  <h4 className="text-xs font-semibold text-foreground">Live Tire Pressure</h4>
                  {hmTirePressure.lastUpdatedAt && (
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {(() => {
                        const ms = Date.now() - new Date(hmTirePressure.lastUpdatedAt!).getTime();
                        const h = Math.floor(ms / 3600000);
                        return `aktualisiert vor ${h < 1 ? '<1h' : `${h}h`}`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Vorne Links', pressure: hmTirePressure.frontLeft, status: hmTirePressure.statusFrontLeft },
                    { label: 'Vorne Rechts', pressure: hmTirePressure.frontRight, status: hmTirePressure.statusFrontRight },
                    { label: 'Hinten Links', pressure: hmTirePressure.rearLeft, status: hmTirePressure.statusRearLeft },
                    { label: 'Hinten Rechts', pressure: hmTirePressure.rearRight, status: hmTirePressure.statusRearRight },
                  ].map(({ label, pressure, status }) => {
                    const isIssue = status && (status.toLowerCase().includes('low') || status.toLowerCase().includes('warn') || status === 'ALERT');
                    return (
                      <div key={label} className={`rounded-lg p-2.5 border ${isIssue ? ('border-border sq-tone-watch') : ('border-border bg-muted/30')}`}>
                        <p className="text-[10px] font-semibold text-muted-foreground mb-1">{label}</p>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-sm font-bold ${isIssue ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                            {pressure != null ? pressure.toFixed(1) : '—'}
                          </span>
                          {pressure != null && <span className="text-[10px] text-muted-foreground">{hmTirePressure.unit}</span>}
                        </div>
                        {isIssue && <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">{status}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alerts */}
            {(tireDetail?.alerts ?? tireHealth?.alerts ?? []).filter((a: TireAlert) => a.severity !== 'info').length > 0 && (
              <div className="space-y-2 mb-5">
                {(tireDetail?.alerts ?? tireHealth?.alerts ?? []).filter((a: TireAlert) => a.severity !== 'info').map((alert: TireAlert, i: number) => (
                  <div key={i} className={`rounded-xl px-3 py-2.5 flex items-center gap-2 ${alert.severity === 'critical' ? ('sq-tone-critical border border-border') : ('sq-tone-watch border border-border')}`}>
                    <Icon name="alert-triangle" className={`w-3.5 h-3.5 shrink-0 ${alert.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                    <span className={`text-xs ${alert.severity === 'critical' ? ('text-[color:var(--status-critical)]') : ('text-[color:var(--status-watch)]')}`}>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {tireHealth?.actionState && (
              <div className={`rounded-xl px-4 py-3 mb-5 ${'bg-muted/50 border border-border'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Operational Action</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    tireHealth.actionState === 'REPLACE'
                      ? 'sq-chip-critical'
                      : tireHealth.actionState === 'PLAN_SERVICE'
                      ? 'sq-chip-watch'
                      : tireHealth.actionState === 'CHECK_SOON'
                      ? 'sq-chip-info'
                      : 'sq-chip-success'
                  }`}>
                    {formatEnumLabel(tireHealth.actionState)}
                  </span>
                </div>
                {(tireHealth.actionReasons ?? []).length > 0 && (
                  <p className="text-[11px] mt-2 text-muted-foreground">{tireHealth.actionReasons?.[0]}</p>
                )}
                {(tireHealth.dataQualityWarnings ?? []).length > 0 && (
                  <p className={`text-[10px] mt-1 ${'text-[color:var(--status-watch)]'}`}>
                    Data warning: {tireHealth.dataQualityWarnings?.[0]}
                  </p>
                )}
              </div>
            )}

            {/* Tab navigation */}
            <div className={`flex gap-1 mb-5 p-1 rounded-xl ${'bg-muted/60'}`}>
              {(['overview', 'history', 'factors'] as const).map(tab => (
                <button key={tab} onClick={() => setTireModalTab(tab)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${tireModalTab === tab ? 'bg-card text-foreground shadow-sm' : ('text-muted-foreground hover:text-foreground')}`}>
                  {tab === 'overview' ? 'Overview' : tab === 'history' ? 'Rotation History' : 'Wear Factors'}
                </button>
              ))}
            </div>

            {tireDetailLoading && <SkeletonCard className="my-4" />}

            {/* ── OVERVIEW TAB ── */}
            {tireModalTab === 'overview' && !tireDetailLoading && (
              <>
                {/* Tire Setup Info */}
                {(() => {
                  const active = resolveActiveSetup(tiresData);
                  const hasIncomplete = active && (!active.brandModelFront || !active.frontDimension || !active.tireSeason);
                  if (!active) return (
                    <div className={`rounded-lg p-4 text-center mb-5 border-2 border-dashed ${'sq-tone-watch border border-border'}`}>
                      <Icon name="circle" className={`w-8 h-8 mx-auto mb-2 ${'text-[color:var(--status-watch)]/60'}`} />
                      <p className={`text-sm font-semibold mb-1 ${'text-[color:var(--status-watch)]'}`}>No active Tracking</p>
                      <p className={`text-xs text-muted-foreground`}>please provide Tire Information</p>
                      <button onClick={handleOpenEditSetup} className={`mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${'sq-tone-info hover:opacity-90'}`}>
                        <Icon name="pen-tool" className="w-3 h-3 inline -mt-0.5 mr-1" />Add Tire Setup
                      </button>
                    </div>
                  );
                  return (
                    <div className={`rounded-lg p-4 mb-5 bg-muted`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Icon name="circle" className={`w-4 h-4 text-muted-foreground`} />
                          <h3 className={`text-xs font-bold uppercase tracking-wider text-muted-foreground`}>Active Set</h3>
                          {active.tireSeason && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-info'}`}>{active.tireSeason.replace('_', ' ')}</span>}
                          {tireHealth?.totalKmOnSet ? <span className={`text-[10px] text-muted-foreground`}>{Math.round(tireHealth.totalKmOnSet).toLocaleString('de-DE')} km on set</span> : null}
                          {hasIncomplete && <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${'sq-chip-watch'}`}>Incomplete</span>}
                        </div>
                        <button onClick={handleOpenEditSetup} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors ${'text-[color:var(--status-info)] hover:bg-muted'}`}>
                          <Icon name="pen-tool" className="w-3 h-3" />Edit
                        </button>
                      </div>
                      {!showEditSetup ? (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div><p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground`}>Front</p><p className={`text-xs font-semibold text-foreground`}>{active.brandModelFront || '—'}</p><p className={`text-[10px] text-muted-foreground`}>{active.frontDimension || '—'}</p></div>
                            <div><p className={`text-[10px] uppercase tracking-wider mb-0.5 text-muted-foreground`}>Rear</p><p className={`text-xs font-semibold text-foreground`}>{active.brandModelRear || active.brandModelFront || '—'}</p><p className={`text-[10px] text-muted-foreground`}>{active.rearDimension || active.frontDimension || '—'}</p></div>
                          </div>
                          {active.installedAt && <p className={`text-[10px] mt-2 text-muted-foreground/60`}>Installed {new Date(active.installedAt).toLocaleDateString('de-DE')}{active.installedOdometerKm ? ` at ${Math.round(active.installedOdometerKm).toLocaleString('de-DE')} km` : ''}</p>}
                        </>
                      ) : (
                        <div className="space-y-3 mt-1">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Front Brand / Model</label>
                              <input type="text" value={editSetupForm.brandModelFront} onChange={e => setEditSetupForm(p => ({ ...p, brandModelFront: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. Continental PremiumContact 6" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Rear Brand / Model</label>
                              <input type="text" value={editSetupForm.brandModelRear} onChange={e => setEditSetupForm(p => ({ ...p, brandModelRear: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="Same as front if identical" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Front Dimension</label>
                              <input type="text" value={editSetupForm.frontDimension} onChange={e => setEditSetupForm(p => ({ ...p, frontDimension: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. 225/45 R17" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Rear Dimension</label>
                              <input type="text" value={editSetupForm.rearDimension} onChange={e => setEditSetupForm(p => ({ ...p, rearDimension: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="Same as front if identical" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Load Index</label>
                              <input type="text" value={editSetupForm.loadIndex} onChange={e => setEditSetupForm(p => ({ ...p, loadIndex: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. 94" />
                            </div>
                            <div>
                              <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Speed Index</label>
                              <input type="text" value={editSetupForm.speedIndex} onChange={e => setEditSetupForm(p => ({ ...p, speedIndex: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="e.g. V" />
                            </div>
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Season</label>
                            <div className="flex gap-2">
                              {[{ val: 'SUMMER', label: 'Summer', icon: Sun }, { val: 'WINTER', label: 'Winter', icon: Snowflake }, { val: 'ALL_SEASON', label: 'All Season', icon: Wind }].map(opt => (
                                <button key={opt.val} onClick={() => setEditSetupForm(p => ({ ...p, tireSeason: p.tireSeason === opt.val ? '' : opt.val }))} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${editSetupForm.tireSeason === opt.val ? 'border-[color:var(--brand)] sq-tone-brand' : 'border-border text-muted-foreground hover:border-border/80'}`}>
                                  <opt.icon className="w-3.5 h-3.5" />{opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1.5 text-muted-foreground`}>Tire Condition</label>
                            <div className="flex gap-2">
                              {[{ val: 'NEW_INSTALLED' as const, label: 'Newly Installed' }, { val: 'ALREADY_MOUNTED' as const, label: 'Already Mounted (Used)' }].map(opt => (
                                <button key={opt.val} onClick={() => setEditSetupForm(p => ({ ...p, tireCondition: p.tireCondition === opt.val ? '' : opt.val }))} className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${editSetupForm.tireCondition === opt.val ? 'border-[color:var(--brand)] sq-tone-brand' : 'border-border text-muted-foreground hover:border-border/80'}`}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {editSetupForm.tireCondition === 'ALREADY_MOUNTED' && (
                              <p className={`text-[9px] mt-1 ${'text-[color:var(--status-watch)]'}`}>Used tires: please enter current per-wheel tread depths below for accurate estimates.</p>
                            )}
                          </div>
                          <div>
                            <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1.5 text-muted-foreground`}>Current Tread Depth (mm){editSetupForm.tireCondition === 'ALREADY_MOUNTED' ? ' — recommended' : ' — optional'}</label>
                            <div className="grid grid-cols-4 gap-2">
                              {[{ key: 'treadFL', label: 'FL' }, { key: 'treadFR', label: 'FR' }, { key: 'treadBL', label: 'RL' }, { key: 'treadBR', label: 'RR' }].map(f => (
                                <div key={f.key}>
                                  <span className={`text-[9px] font-semibold block mb-0.5 text-center text-muted-foreground/60`}>{f.label}</span>
                                  <input type="number" step="0.1" min="0" max="12" value={(editSetupForm as any)[f.key]} onChange={e => setEditSetupForm(p => ({ ...p, [f.key]: e.target.value }))} className={`w-full px-2 py-1.5 rounded-lg text-xs text-center font-medium border transition-colors outline-none ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'}`} placeholder="mm" />
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* ── AI Tire Spec Fetch ─────────────────────────────── */}
                          <div className={`rounded-xl p-3 border bg-muted border-border`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Icon name="bot" className={`w-4 h-4 ${'text-[color:var(--status-ai)]'}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-wider text-muted-foreground`}>AI Tire Intelligence</span>
                              </div>
                              {!aiTireLoading && !aiTireResult && (
                                <div className="relative group">
                                  <button
                                    onClick={handleFetchAiTireSpec}
                                    disabled={!aiTireSpecFieldsReady || aiTireLoading}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${
                                      aiTireSpecFieldsReady
                                        ? 'bg-purple-500 hover:bg-purple-600 text-white'
                                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                                    }`}
                                  >
                                    <Icon name="sparkles" className="w-3 h-3" />Fetch AI Tire Spec
                                  </button>
                                  {!aiTireSpecFieldsReady && (
                                    <div className={`absolute bottom-full right-0 mb-1 px-2 py-1 rounded text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 ${'bg-popover text-popover-foreground'}`}>
                                      Fill Brand/Model, Dimension, Load &amp; Speed Index first
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Status: Loading with countdown */}
                            {aiTireLoading && (
                              <div className={`rounded-lg p-3 bg-muted`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon name="loader-2" className="w-4 h-4 animate-spin text-purple-500" />
                                  <span className={`text-xs font-semibold ${'text-[color:var(--status-ai)]'}`}>
                                    {aiTireCountdown > 0 ? 'Fetching AI Tire Spec...' : 'Taking longer than expected...'}
                                  </span>
                                </div>
                                {aiTireCountdown > 0 && (
                                  <p className={`text-[10px] mb-2 text-muted-foreground`}>Estimated time remaining: {aiTireCountdown}s</p>
                                )}
                                {aiTireCountdown === 0 && aiTireLoading && (
                                  <p className={`text-[10px] mb-2 ${'text-[color:var(--status-watch)]'}`}>Still processing — please wait...</p>
                                )}
                                <div className={`w-full h-1.5 rounded-full overflow-hidden bg-muted`}>
                                  <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, aiTireCountdown > 0 ? ((30 - aiTireCountdown) / 30) * 90 : 95)}%` }} />
                                </div>
                                {aiTireLiveStep && <p className={`text-[9px] mt-1.5 text-muted-foreground/60`}>{aiTireLiveStep}</p>}
                                {aiTireSteps.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {aiTireSteps.map((s, i) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        {s.status === 'done' ? <Icon name="check-circle" className="w-3 h-3 text-green-500" /> : s.status === 'error' ? <Icon name="alert-triangle" className="w-3 h-3 text-red-500" /> : <Icon name="loader-2" className="w-3 h-3 animate-spin text-purple-400" />}
                                        <span className={`text-[9px] text-muted-foreground`}>{s.step}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Error state */}
                            {!aiTireLoading && aiTireError && (
                              <div className={`rounded-lg p-3 ${'sq-tone-critical border border-border'}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon name="alert-triangle" className="w-3.5 h-3.5 text-red-500" />
                                  <span className={`text-xs font-semibold ${'text-[color:var(--status-critical)]'}`}>Fetch failed</span>
                                </div>
                                <p className={`text-[10px] mb-2 ${'text-[color:var(--status-critical)]'}`}>{aiTireError}</p>
                                <div className="flex gap-2">
                                  <button onClick={handleFetchAiTireSpec} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors">Retry</button>
                                  <button onClick={handleDiscardAiTireSpec} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Dismiss</button>
                                </div>
                              </div>
                            )}

                            {/* Result preview */}
                            {!aiTireLoading && aiTireResult && (
                              <div className={`rounded-lg p-3 bg-muted border border-border`}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Icon name="sparkles" className={`w-3.5 h-3.5 ${'text-[color:var(--status-ai)]'}`} />
                                    <span className={`text-xs font-semibold ${'text-[color:var(--status-ai)]'}`}>AI Tire Spec Result</span>
                                  </div>
                                  {(() => {
                                    const conf = typeof aiTireResult.confidenceScore === 'number' ? aiTireResult.confidenceScore : null;
                                    if (conf == null) return null;
                                    const isLow = conf < 50;
                                    return (
                                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${isLow ? 'sq-chip-watch' : 'sq-chip-success'}`}>
                                        {isLow ? 'Low Confidence' : 'Matched'} ({conf}%)
                                      </span>
                                    );
                                  })()}
                                </div>
                                {aiTireDegraded && (
                                  <p className={`text-[9px] mb-2 ${'text-[color:var(--status-watch)]'}`}>Partial result — some fields could not be determined.</p>
                                )}
                                {typeof aiTireResult.confidenceScore === 'number' && (aiTireResult.confidenceScore as number) < 50 && (
                                  <p className={`text-[9px] mb-2 ${'text-[color:var(--status-watch)]'}`}>Low confidence match — review carefully before applying.</p>
                                )}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  {[
                                    { key: 'matchedBrand', label: 'Brand' },
                                    { key: 'matchedModel', label: 'Model' },
                                    { key: 'matchedVariant', label: 'Variant' },
                                    { key: 'seasonType', label: 'Season' },
                                    { key: 'newTreadDepthMm', label: 'New Tread (mm)' },
                                    { key: 'recommendedReplacementDepthMm', label: 'Rec. Replace (mm)' },
                                    { key: 'operationalReplacementDepthMm', label: 'Op. Replace (mm)' },
                                    { key: 'intendedUse', label: 'Intended Use' },
                                    { key: 'aggressiveDrivingSensitivity', label: 'Aggr. Sensitivity' },
                                    { key: 'underinflationSensitivity', label: 'Underinfl. Sens.' },
                                    { key: 'heatSensitivity', label: 'Heat Sensitivity' },
                                    { key: 'confidenceScore', label: 'Confidence' },
                                  ].map(({ key, label }) => {
                                    const val = (aiTireResult as any)[key];
                                    return (
                                      <div key={key} className="flex justify-between py-0.5">
                                        <span className={`text-[9px] text-muted-foreground`}>{label}</span>
                                        <span className={`text-[9px] font-semibold text-foreground/80`}>{val != null ? String(val) : '—'}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                {Boolean(aiTireResult.manufacturerSourceUrl || aiTireResult.labelSourceUrl) && (
                                  <div className={`mt-2 pt-2 border-t border-border`}>
                                    {Boolean(aiTireResult.manufacturerSourceUrl) && <a href={String(aiTireResult.manufacturerSourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500 hover:underline block truncate">Manufacturer source</a>}
                                    {Boolean(aiTireResult.labelSourceUrl) && <a href={String(aiTireResult.labelSourceUrl)} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500 hover:underline block truncate">Label source</a>}
                                  </div>
                                )}
                                <div className="flex gap-2 mt-3">
                                  <button onClick={handleApplyAiTireSpec} disabled={aiTireApplying} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-green-500 hover:bg-green-600 text-white transition-colors disabled:opacity-50">
                                    {aiTireApplying ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="check-circle" className="w-3 h-3" />}Apply Spec
                                  </button>
                                  <button onClick={handleFetchAiTireSpec} disabled={aiTireLoading} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-purple-500 hover:bg-purple-600 text-white transition-colors">
                                    <Icon name="refresh-cw" className="w-3 h-3 inline -mt-0.5 mr-1" />Retry
                                  </button>
                                  <button onClick={handleDiscardAiTireSpec} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Discard</button>
                                </div>
                              </div>
                            )}

                            {/* Idle hint when no action taken yet */}
                            {!aiTireLoading && !aiTireResult && !aiTireError && (
                              <p className={`text-[9px] text-muted-foreground/60`}>
                                Fetch model-specific tire intelligence for accurate wear modeling.
                              </p>
                            )}
                          </div>

                          <div className="flex gap-2 justify-end pt-1">
                            <button onClick={() => setShowEditSetup(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                            <button onClick={handleSaveEditSetup} disabled={submittingEditSetup} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">
                              {submittingEditSetup && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}Save Setup
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Overall + Wheel Grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {/* Overall */}
                  {(() => {
                    const pct = tireDetail?.summary.overallPercent ?? tireWear?.overallPercent ?? null;
                    const remKm = tireDetail?.summary.overallRemainingKm ?? tireWear?.estimatedRemainingKm ?? null;
                    const barBg = pct != null ? (pct >= 50 ? ('sq-tone-success') : pct >= 25 ? ('sq-tone-watch') : ('sq-tone-critical')) : ('bg-muted/60');
                    const barFg = pct != null ? (pct >= 50 ? 'bg-green-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500') : 'bg-gray-300';
                    return (
                      <div className={`rounded-lg p-4 ${barBg}`}>
                        {pct != null ? (<>
                          <p className={`text-2xl font-bold mb-1 text-foreground`}>{pct}%</p>
                          <div className={`w-full h-2 rounded-full overflow-hidden mb-2 bg-muted`}><div className={`h-full ${barFg} rounded-full transition-all`} style={{ width: `${pct}%` }} /></div>
                          <p className={`text-xs font-semibold ${'text-muted-foreground'}`}>Estimated Tread Life</p>
                          {remKm != null && <p className={`text-[11px] text-muted-foreground`}>ca. {remKm.toLocaleString('de-DE')} km remaining</p>}
                          {tireDetail?.summary.wearRateMmPer1000km != null && <p className={`text-[10px] mt-1 text-muted-foreground/60`}>Wear: {tireDetail.summary.wearRateMmPer1000km.toFixed(2)} mm / 1000 km</p>}
                          {tireWear && <div className="mt-3 flex gap-3">
                            <div className="text-center flex-1"><p className={`text-lg font-bold text-foreground`}>{tireWear.frontPercent}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Front</p></div>
                            <div className={`w-px bg-muted`} />
                            <div className="text-center flex-1"><p className={`text-lg font-bold text-foreground`}>{tireWear.rearPercent}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Rear</p></div>
                          </div>}
                        </>) : (<div className="text-center py-3"><p className={`text-xs font-semibold text-muted-foreground`}>No wear analysis yet</p></div>)}
                      </div>
                    );
                  })()}

                  {/* Wheel position grid */}
                  <div className={`rounded-lg p-4 bg-muted`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Tread Depth per Wheel</p>
                    <div className="relative mx-auto" style={{ width: '240px', height: '150px' }}>
                      {(tireDetail?.wheels ?? [
                        { position: 'FL', treadMm: tireWear?.frontLeftMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                        { position: 'FR', treadMm: tireWear?.frontRightMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                        { position: 'RL', treadMm: tireWear?.rearLeftMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                        { position: 'RR', treadMm: tireWear?.rearRightMm ?? 0, wearPercent: 0, healthStatus: 'EXCELLENT' },
                      ]).map((w: any) => {
                        const top = w.position.startsWith('F');
                        const left = w.position.endsWith('L');
                        const mm = w.treadMm;
                        const treadColor = mm >= 4 ? ('text-[color:var(--status-positive)]') : mm >= 2.5 ? ('text-[color:var(--status-watch)]') : ('text-[color:var(--status-critical)]');
                        return (
                          <div key={w.position} className={`absolute flex flex-col items-center ${top ? 'top-0' : 'bottom-0'} ${left ? 'left-0' : 'right-0'}`}>
                            {top && <svg width="22" height="32" viewBox="0 0 24 36" fill="none"><rect x="2" y="2" width="20" height="32" rx="4" className={'stroke-muted-foreground'} strokeWidth="1.5" /><line x1="6" y1="10" x2="18" y2="10" className={'stroke-border'} strokeWidth="1" /><line x1="6" y1="18" x2="18" y2="18" className={'stroke-border'} strokeWidth="1" /><line x1="6" y1="26" x2="18" y2="26" className={'stroke-border'} strokeWidth="1" /></svg>}
                            <p className={`text-sm font-bold ${treadColor}`}>{mm > 0 ? `${mm.toFixed(1)} mm` : '—'}</p>
                            <p className={`text-[9px] font-medium text-muted-foreground`}>{w.position}</p>
                            {w.wearPercent != null && <p className={`text-[8px] text-muted-foreground/60`}>{w.wearPercent}%</p>}
                            {!top && <svg width="22" height="32" viewBox="0 0 24 36" fill="none"><rect x="2" y="2" width="20" height="32" rx="4" className={'stroke-muted-foreground'} strokeWidth="1.5" /><line x1="6" y1="10" x2="18" y2="10" className={'stroke-border'} strokeWidth="1" /><line x1="6" y1="18" x2="18" y2="18" className={'stroke-border'} strokeWidth="1" /><line x1="6" y1="26" x2="18" y2="26" className={'stroke-border'} strokeWidth="1" /></svg>}
                          </div>
                        );
                      })}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
                        <div className="flex gap-2">
                          <button onClick={() => setShowRotation(true)} className="px-3 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-semibold transition-colors">Rotate</button>
                          <button onClick={() => setShowTireChange(true)} className="px-3 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold transition-colors">Change</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Usage Split */}
                {tireDetail && tireDetail.usageSplit && (tireDetail.usageSplit.city > 0 || tireDetail.usageSplit.highway > 0 || tireDetail.usageSplit.rural > 0) && (
                  <div className={`rounded-lg p-4 mb-5 bg-muted`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Usage Distribution</p>
                    <div className="flex gap-1 mb-3 h-2 rounded-full overflow-hidden">
                      {tireDetail.usageSplit.city > 0 && <div className={`${'bg-[color:var(--status-watch)]'} rounded-full`} style={{ width: `${tireDetail.usageSplit.city}%` }} />}
                      {tireDetail.usageSplit.highway > 0 && <div className={`${'bg-[color:var(--status-info)]'} rounded-full`} style={{ width: `${tireDetail.usageSplit.highway}%` }} />}
                      {tireDetail.usageSplit.rural > 0 && <div className={`${'bg-[color:var(--status-positive)]'} rounded-full`} style={{ width: `${tireDetail.usageSplit.rural}%` }} />}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><p className={`text-sm font-bold ${'text-[color:var(--status-watch)]'}`}>{tireDetail.usageSplit.city}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>City</p></div>
                      <div><p className={`text-sm font-bold ${'text-[color:var(--status-info)]'}`}>{tireDetail.usageSplit.highway}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Highway</p></div>
                      <div><p className={`text-sm font-bold ${'text-[color:var(--status-positive)]'}`}>{tireDetail.usageSplit.rural}%</p><p className={`text-[10px] uppercase tracking-wider text-muted-foreground`}>Rural</p></div>
                    </div>
                  </div>
                )}

                {/* Action Error Banner */}
                {tireActionError && (
                  <div className={`rounded-xl px-4 py-3 mb-4 flex items-center gap-2 ${'sq-tone-critical border border-border'}`}>
                    <Icon name="alert-triangle" className="w-4 h-4 text-red-500 shrink-0" />
                    <span className={`text-xs ${'text-[color:var(--status-critical)]'}`}>{tireActionError}</span>
                    <button onClick={() => setTireActionError(null)} className={`ml-auto p-0.5 rounded ${'text-muted-foreground hover:text-foreground'}`}><Icon name="x" className="w-3 h-3" /></button>
                  </div>
                )}

                {/* Actions: Measurement */}
                <div className={`rounded-lg p-5 mb-5 bg-muted`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>Manual Measurement</h3>
                    {!showMeasurement && <button onClick={() => { setShowMeasurement(true); setMeasurementMode(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors"><Icon name="plus" className="w-3.5 h-3.5" /> Record</button>}
                  </div>
                  {showMeasurement && !measurementMode && (
                    <div className="flex gap-3">
                      <button onClick={() => setMeasurementMode('manual')} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all hover:scale-[1.02] ${'border-border hover:border-[color:var(--brand)] hover:bg-muted/50'}`}>
                        <Icon name="ruler" className={`w-6 h-6 ${'text-[color:var(--status-info)]'}`} /><p className={`text-xs font-semibold text-foreground`}>Manual Entry</p><p className={`text-[10px] text-center text-muted-foreground`}>Enter measured tread values</p>
                      </button>
                      <button onClick={() => setMeasurementMode('upload')} className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition-all hover:scale-[1.02] ${'border-border hover:border-[color:var(--status-ai)] hover:bg-muted/50'}`}>
                        <Icon name="upload" className={`w-6 h-6 ${'text-[color:var(--status-ai)]'}`} /><p className={`text-xs font-semibold text-foreground`}>AI Upload</p><p className={`text-[10px] text-center text-muted-foreground`}>Upload checkup sheet</p>
                      </button>
                    </div>
                  )}
                  {showMeasurement && measurementMode === 'manual' && (
                    <div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {[{ key: 'fl', label: 'Front Left (mm)' }, { key: 'fr', label: 'Front Right (mm)' }, { key: 'rl', label: 'Rear Left (mm)' }, { key: 'rr', label: 'Rear Right (mm)' }].map(f => (
                          <div key={f.key}><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>{f.label}</label><input type="number" step="0.1" min="0" max="12" value={(manualMeasurement as any)[f.key]} onChange={e => setManualMeasurement(prev => ({ ...prev, [f.key]: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'} outline-none`} placeholder="e.g. 5.2" /></div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label><input type="number" value={manualMeasurement.odometer} onChange={e => setManualMeasurement(prev => ({ ...prev, odometer: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'} outline-none`} placeholder="Current odometer" /></div>
                        <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Workshop</label><input type="text" value={manualMeasurement.workshop} onChange={e => setManualMeasurement(prev => ({ ...prev, workshop: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${'bg-background border border-border text-foreground focus:border-[color:var(--brand)]'} outline-none`} placeholder="Workshop name (optional)" /></div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowMeasurement(false); setMeasurementMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                        <button onClick={handleSubmitMeasurement} disabled={submittingMeasurement} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5">{submittingMeasurement && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}Confirm & Calibrate</button>
                      </div>
                    </div>
                  )}
                  {showMeasurement && measurementMode === 'upload' && (
                    <div className={`text-center py-6 border-2 border-dashed rounded-xl ${'border-border'}`}>
                      <Icon name="upload" className={`w-8 h-8 mx-auto mb-2 text-muted-foreground`} />
                      <p className={`text-xs font-semibold mb-1 text-foreground`}>Use Document Upload for AI extraction</p>
                      <p className={`text-[10px] mb-3 text-muted-foreground`}>This tire modal no longer performs direct file upload.</p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={() => { setShowMeasurement(false); setMeasurementMode(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground`}>Cancel</button>
                        <button onClick={() => setMeasurementMode('manual')} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-500 hover:bg-purple-600 text-white">Back to Manual</button>
                      </div>
                    </div>
                  )}
                  {!showMeasurement && <p className={`text-[10px] text-muted-foreground/60`}>Manual measurement improves prediction accuracy through Bayesian calibration.</p>}
                </div>

                {/* Rotation Dialog */}
                {showRotation && (
                  <div className={`rounded-lg p-5 mb-5 border-2 ${'bg-card border border-border'}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${'text-[color:var(--status-info)]'}`}>Rotate Tires</h3>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { val: 'front_to_rear', label: 'Front ↔ Rear', desc: 'Swap front and rear axles' },
                        { val: 'cross', label: 'Cross Rotation', desc: 'Diagonal swap pattern' },
                        { val: 'side_swap', label: 'Side Swap', desc: 'Left ↔ Right per axle' },
                        { val: 'full_rotation', label: 'Full Rotation', desc: 'Circular 4-position rotation' },
                      ].map(opt => (
                        <button key={opt.val} onClick={() => setRotationTemplate(opt.val)} className={`p-3 rounded-xl border-2 text-left transition-all ${rotationTemplate === opt.val ? ('border-[color:var(--brand)] sq-tone-brand') : ('border-border hover:border-border/80')}`}>
                          <p className={`text-xs font-semibold text-foreground`}>{opt.label}</p>
                          <p className={`text-[10px] text-muted-foreground`}>{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label><input type="number" value={rotationOdometer} onChange={e => setRotationOdometer(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Current odometer" /></div>
                      <div><label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Notes</label><input type="text" value={rotationNotes} onChange={e => setRotationNotes(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Optional notes" /></div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowRotation(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                      <button onClick={handleRotateTires} disabled={submittingRotation} className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1.5">{submittingRotation && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}Confirm Rotation</button>
                    </div>
                  </div>
                )}

                {/* Tire Change Dialog */}
                {showTireChange && (
                  <div className={`rounded-lg p-5 mb-5 border-2 ${'bg-card border border-border'}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${'text-[color:var(--status-critical)]'}`}>Tire Replacement & Stored Sets</h3>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {([
                        { key: 'single', label: 'Single', desc: 'One wheel' },
                        { key: 'axle', label: 'Axle', desc: 'Front or rear' },
                        { key: 'full_set', label: 'Full set', desc: 'All wheels' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            setTireChangeScope(opt.key);
                            setTireChangePositions([]);
                          }}
                          className={`p-2 rounded-lg border text-left ${
                            tireChangeScope === opt.key
                              ? 'border-red-400 bg-red-500/10'
                              : 'border-border hover:border-border/80'
                          }`}
                        >
                          <p className="text-[11px] font-semibold text-foreground">{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                        </button>
                      ))}
                    </div>

                    {tireChangeScope === 'single' && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {['FL', 'FR', 'RL', 'RR'].map((pos) => (
                          <button
                            key={pos}
                            onClick={() => {
                              setTireChangePositions([pos]);
                            }}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                              tireChangePositions.includes(pos)
                                ? 'border-red-400 bg-red-500/10 text-red-300'
                                : 'border-border text-foreground'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    )}

                    {tireChangeScope === 'axle' && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                          onClick={() => setTireChangePositions(['FRONT_AXLE'])}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                            tireChangePositions.includes('FRONT_AXLE')
                              ? 'border-red-400 bg-red-500/10 text-red-300'
                              : 'border-border text-foreground'
                          }`}
                        >
                          Front axle
                        </button>
                        <button
                          onClick={() => setTireChangePositions(['REAR_AXLE'])}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                            tireChangePositions.includes('REAR_AXLE')
                              ? 'border-red-400 bg-red-500/10 text-red-300'
                              : 'border-border text-foreground'
                          }`}
                        >
                          Rear axle
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Odometer (km)</label>
                        <input type="number" value={tireChangeOdometer} onChange={e => setTireChangeOdometer(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Current odometer" />
                      </div>
                      <div>
                        <label className={`text-[10px] uppercase tracking-wider font-semibold block mb-1 text-muted-foreground`}>Notes</label>
                        <input type="text" value={tireChangeNotes} onChange={e => setTireChangeNotes(e.target.value)} className={`w-full px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`} placeholder="Optional workshop notes" />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end mb-5">
                      <button onClick={() => setShowTireChange(false)} className={`px-3 py-1.5 rounded-lg text-xs font-medium ${'text-muted-foreground hover:bg-muted'}`}>Cancel</button>
                      <button
                        onClick={handleConfirmTireChange}
                        disabled={
                          submittingTireChange ||
                          (tireChangeScope === 'single' && tireChangePositions.length !== 1) ||
                          (tireChangeScope === 'axle' && tireChangePositions.length !== 1)
                        }
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {submittingTireChange && <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />}
                        Confirm Replacement
                      </button>
                    </div>

                    {(() => {
                      const setups = Array.isArray(tiresData) ? tiresData : [];
                      const storedSetups = setups.filter((s: any) => s?.status === 'STORED');
                      if (storedSetups.length === 0) return null;
                      return (
                        <div className={`pt-4 border-t ${'border-border'}`}>
                          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground">Activate Stored Set</p>
                          <div className="space-y-2 mb-3">
                            {storedSetups.map((s: any) => (
                              <button
                                key={s.id}
                                onClick={() => setActivatingStoredSetId(s.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg border text-xs ${
                                  activatingStoredSetId === s.id
                                    ? 'border-blue-400 bg-blue-500/10'
                                    : 'border-border'
                                }`}
                              >
                                <p className="font-semibold text-foreground">{s.name ?? s.brandModelFront ?? 'Stored set'}</p>
                                <p className="text-[10px] text-muted-foreground">{s.tireSeason ?? 'Season n/a'} · {s.removedAt ? `stored since ${new Date(s.removedAt).toLocaleDateString('de-DE')}` : 'stored'}</p>
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={storedActivationOdometer}
                              onChange={(e) => setStoredActivationOdometer(e.target.value)}
                              className={`flex-1 px-3 py-2 rounded-lg text-xs border ${'bg-background border border-border text-foreground'} outline-none`}
                              placeholder="Odometer for activation"
                            />
                            <button
                              onClick={handleActivateStoredSet}
                              disabled={!activatingStoredSetId || submittingTireChange}
                              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
                            >
                              Activate
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {/* ── ROTATION HISTORY TAB ── */}
            {tireModalTab === 'history' && !tireDetailLoading && (
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-5 text-muted-foreground`}>Tire Movement History</h3>
                {(tireDetail?.rotationHistory ?? []).length > 0 ? (
                  <div className="space-y-0">
                    {(tireDetail?.rotationHistory ?? []).map((entry: any, i: number) => (
                      <div key={entry.id} className="relative flex items-start gap-3 py-4">
                        {i < (tireDetail?.rotationHistory?.length ?? 0) - 1 && <div className={`absolute left-[9px] w-px bg-muted`} style={{ top: 'calc(50% + 4px)', height: '100%' }} />}
                        <div className="relative z-10 mt-1 shrink-0">
                          {entry.changeType === 'ROTATION' ? <Icon name="refresh-cw" className="w-[18px] h-[18px] text-blue-500" /> : entry.changeType === 'TIRE_CHANGE' ? <Icon name="circle" className="w-[18px] h-[18px] text-red-500" /> : <Icon name="plus" className="w-[18px] h-[18px] text-green-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold text-foreground`}>{new Date(entry.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: '2-digit' })}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${entry.changeType === 'ROTATION' ? ('sq-chip-info') : entry.changeType === 'TIRE_CHANGE' ? ('sq-chip-critical') : ('sq-chip-success')}`}>{entry.changeType.replace('_', ' ')}</span>
                            {entry.odometerKm != null && <span className={`text-[10px] text-muted-foreground`}>{entry.odometerKm.toLocaleString()} km</span>}
                          </div>
                          {entry.rotationTemplate && <p className={`text-xs mt-0.5 text-muted-foreground`}>Pattern: {entry.rotationTemplate.replace(/_/g, ' ')}</p>}
                          {entry.notes && <p className={`text-[10px] mt-0.5 text-muted-foreground`}>{entry.notes}</p>}
                          {entry.createdBy && <p className={`text-[9px] mt-0.5 text-muted-foreground/60`}>by {entry.createdBy}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground/70`}>
                    <Icon name="refresh-cw" className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No rotation or change events recorded</p>
                    <p className="text-xs mt-1 opacity-60">Use the Rotate or Change actions to log tire movements</p>
                  </div>
                )}

                {/* Measurement History */}
                {(tireDetail?.measurements ?? []).length > 0 && (
                  <div className={`mt-6 pt-5 border-t border-border`}>
                    <h4 className={`text-xs font-semibold uppercase tracking-wider mb-4 text-muted-foreground`}>Measurement History</h4>
                    <div className="space-y-3">
                      {(tireDetail?.measurements ?? []).map((m: any) => (
                        <div key={m.id} className={`rounded-xl p-3 bg-muted`}>
                          <div className="flex items-center gap-2 mb-2">
                            <Icon name="ruler" className={`w-3.5 h-3.5 ${'text-[color:var(--status-info)]'}`} />
                            <span className={`text-xs font-semibold text-foreground`}>{new Date(m.date).toLocaleDateString('de-DE')}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${'sq-chip-neutral'}`}>{m.source}</span>
                            {m.odometerKm != null && <span className={`text-[10px] text-muted-foreground`}>{m.odometerKm.toLocaleString()} km</span>}
                            {m.workshopName && <span className={`text-[10px] text-muted-foreground`}>{m.workshopName}</span>}
                          </div>
                          <div className="flex gap-3">
                            {m.values.map((v: any) => (
                              <span key={v.position} className={`text-xs text-foreground/80`}><span className="font-semibold">{v.position}</span>: {v.mm.toFixed(1)} mm</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── WEAR FACTORS TAB ── */}
            {tireModalTab === 'factors' && !tireDetailLoading && tireDetail && (
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-4 text-muted-foreground`}>Wear Factor Analysis</h3>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  {[
                    { icon: Activity, label: 'Axle (Front)', val: tireDetail.factors.axleFactorFront, desc: (v: number) => v <= 1.0 ? 'Low load' : v <= 1.1 ? 'Normal' : 'High load', warn: (v: number) => v > 1.15 },
                    { icon: Activity, label: 'Axle (Rear)', val: tireDetail.factors.axleFactorRear, desc: (v: number) => v <= 1.0 ? 'Low load' : v <= 1.1 ? 'Normal' : 'High load', warn: (v: number) => v > 1.15 },
                    { icon: Wind, label: 'Usage Mix', val: tireDetail.factors.usageFactor, desc: (v: number) => v < 0.97 ? 'Highway-heavy' : v > 1.08 ? 'City-heavy' : 'Balanced', warn: (v: number) => v > 1.10 },
                    { icon: Gauge, label: 'Behavior', val: tireDetail.factors.behaviorFactor, desc: (v: number) => v <= 1.0 ? 'Smooth' : v <= 1.08 ? 'Normal' : 'Aggressive', warn: (v: number) => v > 1.10 },
                    { icon: Thermometer, label: 'Heat Stress', val: tireDetail.factors.temperatureFactor, desc: (v: number) => v <= 1.0 ? 'Optimal' : v <= 1.03 ? 'Mild' : 'Elevated', warn: (v: number) => v > 1.03 },
                    ...(tireDetail.factors.pressureFactorFront != null ? [{ icon: Gauge, label: 'Pressure (F)', val: tireDetail.factors.pressureFactorFront, desc: (v: number) => v <= 1.01 ? 'Normal' : v <= 1.06 ? 'Mild deviation' : 'Significant', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.pressureFactorRear != null ? [{ icon: Gauge, label: 'Pressure (R)', val: tireDetail.factors.pressureFactorRear, desc: (v: number) => v <= 1.01 ? 'Normal' : v <= 1.06 ? 'Mild deviation' : 'Significant', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.loadFactor != null ? [{ icon: Activity, label: 'Load', val: tireDetail.factors.loadFactor, desc: (v: number) => v <= 1.01 ? 'Normal weight' : v <= 1.06 ? 'Above avg' : 'Heavy', warn: (v: number) => v > 1.06 }] : []),
                    ...(tireDetail.factors.seasonMismatchFactor != null && tireDetail.factors.seasonMismatchFactor > 1.01 ? [{ icon: AlertTriangle, label: 'Season Match', val: tireDetail.factors.seasonMismatchFactor, desc: () => 'Mismatch detected', warn: () => true }] : []),
                    ...(tireDetail.factors.interactionPenaltyFront != null && tireDetail.factors.interactionPenaltyFront > 1.01 ? [{ icon: AlertTriangle, label: 'Multi-Stress', val: tireDetail.factors.interactionPenaltyFront, desc: () => 'Combined stressors', warn: () => true }] : []),
                    { icon: Zap, label: 'Regen Front', val: tireDetail.factors.regenBrakingFactorFront, desc: (v: number) => v < 0.85 ? 'Strong regen' : v < 1 ? 'Moderate regen' : 'No regen', warn: () => false },
                    { icon: Zap, label: 'Regen Rear', val: tireDetail.factors.regenBrakingFactorRear, desc: (v: number) => v < 0.85 ? 'Strong regen' : v < 1 ? 'Moderate regen' : 'No regen', warn: () => false },
                  ].map(f => (
                    <div key={f.label} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${f.warn(f.val) ? ('sq-tone-watch') : ('sq-tone-info')}`}>
                        <f.icon className={`w-4 h-4 ${f.warn(f.val) ? 'text-amber-500' : 'text-blue-500'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>{f.label}</p>
                        <p className={`text-sm font-bold text-foreground`}>{f.val.toFixed(2)}x</p>
                        <p className={`text-[10px] text-muted-foreground`}>{f.desc(f.val)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Staggered Life Adjustments */}
                {tireDetail.factors.isStaggered && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Staggered Setup Adjustments</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className={`text-[10px] text-muted-foreground`}>Front Life Adj.</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.staggeredLifeAdjustmentFront.toFixed(3)}x</p></div>
                      <div><p className={`text-[10px] text-muted-foreground`}>Rear Life Adj.</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.staggeredLifeAdjustmentRear.toFixed(3)}x</p></div>
                    </div>
                  </div>
                )}

                <div className={`mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3`}>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>k-Factor Front</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.kFactorFront.toFixed(3)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>k-Factor Rear</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.kFactorRear.toFixed(3)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Wear Rate</p><p className={`text-xs font-bold text-foreground`}>{tireDetail.effectiveWearRate.front.toLocaleString()} / {tireDetail.effectiveWearRate.rear.toLocaleString()} km/mm</p></div>
                </div>

                {/* Regression & Calibration Status */}
                <div className={`mt-4 pt-3 border-t border-border grid grid-cols-3 gap-3`}>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Model</p>
                    <p className={`text-xs font-bold ${tireDetail.factors.regressionActive ? ('text-[color:var(--status-info)]') : 'text-foreground'}`}>
                      {tireDetail.factors.regressionActive ? `Regression (R²: ${tireDetail.factors.regressionConfidence.toFixed(2)})` : 'Formula-based'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Calibrations</p>
                    <p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.calibrationCount}</p>
                  </div>
                  {tireDetail.factors.driveType && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Drivetrain</p>
                      <p className={`text-xs font-bold text-foreground`}>{tireDetail.factors.driveType}</p>
                    </div>
                  )}
                  {tireDetail.factors.tireArchetype && (
                    <div>
                      <p className={`text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`}>Tire Archetype</p>
                      <p className={`text-xs font-bold capitalize text-foreground`}>{(tireDetail.factors.tireArchetype as string).replace(/_/g, ' ')}</p>
                    </div>
                  )}
                </div>

                {/* Explainability / Source Transparency */}
                {tireDetail.explainability && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-3 text-muted-foreground`}>Data Sources & Intelligence</p>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Tread Source</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.currentTreadSource.replace(/_/g, ' ')}</p></div>
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Ref. New Tread</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.referenceNewTreadSource.replace(/_/g, ' ')}</p></div>
                      <div><p className={`text-[9px] uppercase text-muted-foreground/70`}>Replace Threshold</p><p className={`text-[10px] font-semibold capitalize text-foreground/80`}>{tireDetail.explainability.replacementThresholdSource.replace(/_/g, ' ')}</p></div>
                    </div>
                    {tireDetail.explainability.topWearDrivers.length > 0 && (
                      <div className="mb-2"><p className={`text-[9px] uppercase text-muted-foreground/70`}>Top Wear Drivers</p><p className={`text-[10px] font-semibold capitalize ${'text-[color:var(--status-watch)]'}`}>{tireDetail.explainability.topWearDrivers.join(', ')}</p></div>
                    )}
                    {tireDetail.explainability.possibleCauseHints.length > 0 && (
                      <div className={`rounded-lg p-2.5 mt-2 ${'sq-tone-watch'}`}>
                        {tireDetail.explainability.possibleCauseHints.map((h, i) => (
                          <p key={i} className={`text-[10px] ${'text-[color:var(--status-watch)]'}`}>• {h}</p>
                        ))}
                      </div>
                    )}
                    {tireDetail.factors.tireSpecMatched && (
                      <p className={`text-[9px] mt-2 ${'text-[color:var(--status-info)]'}`}>AI Tire Spec matched — model-aware intelligence active (confidence: {tireDetail.explainability.tireSpecConfidence}%)</p>
                    )}
                  </div>
                )}

                {/* Confidence Dimensions */}
                {(tireDetail.summary.tireSpecConfidence != null || tireDetail.summary.dataCompletenessConfidence != null || tireDetail.summary.modelConfidence != null) && (
                  <div className={`mt-4 pt-3 border-t border-border`}>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-2 text-muted-foreground`}>Confidence Breakdown</p>
                    <div className="grid grid-cols-3 gap-3">
                      {tireDetail.summary.tireSpecConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Tire Spec</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${tireDetail.summary.tireSpecConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.tireSpecConfidence}%</p>
                        </div>
                      )}
                      {tireDetail.summary.dataCompletenessConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Data Quality</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${tireDetail.summary.dataCompletenessConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.dataCompletenessConfidence}%</p>
                        </div>
                      )}
                      {tireDetail.summary.modelConfidence != null && (
                        <div>
                          <p className={`text-[9px] uppercase text-muted-foreground/70`}>Model</p>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden mt-1 bg-muted`}>
                            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${tireDetail.summary.modelConfidence}%` }} />
                          </div>
                          <p className={`text-[9px] font-semibold mt-0.5 text-muted-foreground`}>{tireDetail.summary.modelConfidence}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════ HV Battery Detail Modal (EV) ═══════════ */}
      {showHvBattery && isEv && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6" onClick={() => closeModal(setShowHvBattery)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div onClick={e => e.stopPropagation()} className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-lg border bg-card border-border`}>
            <div className={`sticky top-0 z-10 px-5 py-4 rounded-t-xl border-b bg-card border-border`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Icon name="battery-charging" className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">HV Battery Health</h2>
                    <p className={`text-xs text-muted-foreground`}>Traction Battery Intelligence</p>
                  </div>
                </div>
                <button onClick={() => closeModal(setShowHvBattery)} className={`p-2 rounded-xl transition-colors ${'hover:bg-muted text-muted-foreground'}`}><Icon name="x" className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* SOH Overview */}
              <div className={`rounded-lg p-5 bg-muted`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-semibold text-foreground`}>State of Health</h3>
                  {hvBatteryStatus?.publicationState && (
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      hvBatteryStatus.publicationState === 'INITIAL_CALIBRATION' ? 'bg-blue-100 text-blue-700' :
                      hvBatteryStatus.publicationState === 'STABILIZING' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>{hvBatteryStatus.publicationState === 'INITIAL_CALIBRATION' ? 'Calibrating' : hvBatteryStatus.publicationState === 'STABILIZING' ? 'Stabilizing' : 'Stable'}</span>
                  )}
                </div>
                {hvBatteryStatus?.publicationState === 'INITIAL_CALIBRATION' ? (
                  <div className={`rounded-xl p-4 ${'sq-tone-info'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-semibold ${'text-[color:var(--status-info)]'}`}>Initial calibration in progress</span>
                      <span className="inline-flex">{[0,1,2].map(i => <span key={i} className={`inline-block w-1.5 h-1.5 rounded-full mx-0.5 ${'bg-[color:var(--status-info)]'}`} style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }} />)}</span>
                    </div>
                    <p className={`text-[10px] ${'text-[color:var(--status-info)]/60'}`}>Collecting charge and discharge data for accurate battery health estimation</p>
                    <p className={`text-[9px] mt-1 ${'text-[color:var(--status-info)]'}`}>No reliable HV SOH data yet — SOH is only reported from provider, capacity measurement or a workshop report.</p>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="text-center">
                        <div className={`text-2xl font-black text-foreground`}>{hvBatteryStatus?.currentSocPercent != null ? `${formatMaxDecimals(hvBatteryStatus.currentSocPercent)}%` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Current SoC</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-black text-foreground`}>{hvBatteryStatus?.estimatedRangeKm != null ? `${Math.round(hvBatteryStatus.estimatedRangeKm)}` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Est. Range (km)</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <div className={`text-3xl font-black ${
                          hvBatteryStatus?.sohPercent == null ? 'text-muted-foreground' :
                          hvBatteryStatus.sohPercent >= 80 ? 'text-green-500' :
                          hvBatteryStatus.sohPercent >= 70 ? 'text-amber-500' :
                          hvBatteryStatus.sohPercent >= 60 ? 'text-orange-500' : 'text-red-500'
                        }`}>{hvBatteryStatus?.sohPercent != null ? `${hvBatteryStatus.publicationState === 'STABILIZING' ? '~' : ''}${formatMaxDecimals(hvBatteryStatus.sohPercent)}%` : 'N/A'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>{hvBatteryStatus?.sohPercent == null ? 'No reliable SOH' : hvBatteryStatus?.publicationState === 'STABILIZING' ? 'Estimated SOH' : 'SOH'}</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-3xl font-black text-foreground`}>{hvBatteryStatus?.currentSocPercent != null ? `${formatMaxDecimals(hvBatteryStatus.currentSocPercent)}%` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Current SoC</p>
                      </div>
                      <div className="text-center">
                        <div className={`text-3xl font-black text-foreground`}>{hvBatteryStatus?.estimatedRangeKm != null ? `${Math.round(hvBatteryStatus.estimatedRangeKm)}` : '—'}</div>
                        <p className={`text-xs mt-1 text-muted-foreground`}>Est. Range (km)</p>
                      </div>
                    </div>
                    {/* Maturity / method info */}
                    {hvBatteryStatus?.publicationMethod && (
                      <div className={`flex items-center gap-3 mt-3 text-muted-foreground`}>
                        <span className="text-[10px]">Method: <strong className={'text-muted-foreground'}>{hvBatteryStatus.publicationMethod.replace(/_/g, ' ')}</strong></span>
                        {hvBatteryStatus.maturityConfidence && <span className="text-[10px]">Confidence: <strong className={'text-muted-foreground'}>{hvBatteryStatus.maturityConfidence}</strong></span>}
                        {hvBatteryStatus.validEstimateCount != null && <span className="text-[10px]">Estimates: <strong className={'text-muted-foreground'}>{hvBatteryStatus.validEstimateCount}</strong></span>}
                      </div>
                    )}
                  </>
                )}
                {hvBatteryStatus?.publicationState !== 'INITIAL_CALIBRATION' && hvBatteryStatus?.sohInterpretation && (
                  <div className={`mt-4 rounded-xl p-3 ${
                    hvBatteryStatus.sohInterpretation.color === 'green' ? ('sq-tone-success') :
                    hvBatteryStatus.sohInterpretation.color === 'amber' ? ('sq-tone-watch') :
                    hvBatteryStatus.sohInterpretation.color === 'orange' ? ('sq-tone-warning') :
                    hvBatteryStatus.sohInterpretation.color === 'red' ? ('sq-tone-critical') :
                    ('bg-muted')
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${
                        hvBatteryStatus.sohInterpretation.color === 'green' ? 'text-green-500' :
                        hvBatteryStatus.sohInterpretation.color === 'amber' ? 'text-amber-500' :
                        hvBatteryStatus.sohInterpretation.color === 'orange' ? 'text-orange-500' :
                        hvBatteryStatus.sohInterpretation.color === 'red' ? 'text-red-500' :
                        ('text-muted-foreground')
                      }`}>{hvBatteryStatus.sohInterpretation.label}</span>
                      <span className={`text-[10px] text-muted-foreground/70`}>via {hvBatteryStatus.sohMethod?.replace(/_/g, ' ')}</span>
                    </div>
                    <p className={`text-xs ${'text-muted-foreground'}`}>{hvBatteryStatus.sohInterpretation.description}</p>
                  </div>
                )}
              </div>

              {/* Capacity */}
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-sm font-semibold mb-3 text-foreground`}>Battery Capacity</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>Nominal</p>
                    <p className={`text-lg font-bold text-foreground`}>{hvBatteryStatus?.nominalCapacityKwh != null ? `${formatMaxDecimals(hvBatteryStatus.nominalCapacityKwh)} kWh` : '—'}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground`}>Estimated Current</p>
                    <p className={`text-lg font-bold text-foreground`}>{hvBatteryStatus?.estimatedCurrentCapacityKwh != null ? `${formatMaxDecimals(hvBatteryStatus.estimatedCurrentCapacityKwh)} kWh` : '—'}</p>
                  </div>
                </div>
              </div>

              {/* Charging Sessions */}
              <div className={`rounded-lg p-5 bg-muted`}>
                <h3 className={`text-sm font-semibold mb-4 text-foreground`}>Charging Sessions</h3>
                {(hvBatteryStatus?.chargingSessions?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {hvBatteryStatus?.chargingSessions?.map((s: any, i: number) => (
                      <div key={i} className={`rounded-xl p-3 bg-muted`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Icon name="battery-charging" className={`w-3.5 h-3.5 ${'text-[color:var(--status-positive)]'}`} />
                            <span className={`text-xs font-semibold text-foreground`}>
                              {new Date(s.startTime).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
                            </span>
                            <span className={`text-[10px] text-muted-foreground`}>
                              {new Date(s.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${'text-[color:var(--status-positive)]'}`}>
                            {formatMaxDecimals(s.startSoc)}% → {formatMaxDecimals(s.endSoc)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {s.energyChargedKwh != null && (
                            <div><p className={`text-[10px] text-muted-foreground/70`}>Energy</p><p className={`text-xs font-semibold text-foreground`}>{s.energyChargedKwh.toFixed(1)} kWh</p></div>
                          )}
                          {s.maxChargingPowerKw != null && (
                            <div><p className={`text-[10px] text-muted-foreground/70`}>Max Power</p><p className={`text-xs font-semibold text-foreground`}>{s.maxChargingPowerKw} kW</p></div>
                          )}
                          <div><p className={`text-[10px] text-muted-foreground/70`}>Duration</p><p className={`text-xs font-semibold text-foreground`}>{s.durationMinutes} min</p></div>
                          {s.rangeGainedKm != null && (
                            <div><p className={`text-[10px] text-muted-foreground/70`}>Range Gained</p><p className={`text-xs font-semibold text-foreground`}>+{s.rangeGainedKm} km</p></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-col items-center justify-center py-10 text-muted-foreground/70`}>
                    <Icon name="battery-charging" className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No charging sessions recorded</p>
                    <p className="text-xs mt-1 opacity-60">Charging data will appear as telemetry is collected</p>
                  </div>
                )}
              </div>

              {/* SOH Trend */}
              {(hvBatteryStatus?.recentTrend?.length ?? 0) > 0 && (
                <div className={`rounded-lg p-5 bg-muted`}>
                  <h3 className={`text-sm font-semibold mb-4 text-foreground`}>SOH Trend</h3>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={hvBatteryStatus?.recentTrend?.map((t: any) => ({
                        date: new Date(t.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
                        soh: t.sohPercent,
                        soc: t.socPercent,
                      }))}>
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke='var(--muted-foreground)' />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke='var(--muted-foreground)' />
                        <Tooltip contentStyle={{ background: 'var(--card)', border: 'none', borderRadius: 12, fontSize: 11 }} />
                        <Line type="monotone" dataKey="soh" stroke="#10b981" strokeWidth={2} dot={false} name="SOH %" />
                        <Line type="monotone" dataKey="soc" stroke="#6366f1" strokeWidth={1.5} dot={false} name="SoC %" strokeDasharray="4 2" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
