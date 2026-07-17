/**
 * Vehicle Forecast Engine
 *
 * Generates upcoming planning items for the Vehicle Insights card.
 *
 * Data trust hierarchy (in order of preference):
 *   A. Explicit remaining km/months pre-computed by backend (service, TÜV, BOKraft, oil)
 *   B. V2 wear-model outputs — brake pads estimatedLifetimeKm, tire overallRemainingKm
 *   C. Heuristic estimation from wear-% when V2 model is unavailable
 *
 * Time estimation:
 *   Derived from the best available mileage trend source (90-day trip total preferred).
 *   Time estimates are suppressed when trend confidence is low to avoid misleading estimates.
 *   All values are humanized to readable ranges — never exact decimal values.
 */

import type {
  ServiceInfoStatus,
  TireHealthSummaryResponse,
  BatteryHealthSummary,
  OilChangeStatus,
  BrakeHealthSummary,
} from '../../lib/api';

// ── Engine input ──────────────────────────────────────────────────────────────

export interface ForecastEngineInput {
  service: ServiceInfoStatus | null;
  tires: TireHealthSummaryResponse | null;
  /** V2 brake model — provides model-derived remaining km for pads */
  brakeHealth: BrakeHealthSummary | null;
  battery: BatteryHealthSummary | null;
  oil: OilChangeStatus | null;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type PlanningEventType =
  | 'service_due'
  | 'oil_service'
  | 'brake_inspection'
  | 'tire_check'
  | 'inspection_due'
  | 'battery_check';

export type PlanningUrgency = 'overdue' | 'due' | 'soon' | 'normal';

/**
 * A single upcoming planning item, ready for direct rendering.
 * displayKm and displayTime are pre-humanized strings — no further formatting needed.
 */
export interface PlanningItem {
  type: PlanningEventType;
  /** Short operational label, e.g. "Service check", "Brake inspection" */
  title: string;
  urgency: PlanningUrgency;
  /** Raw numeric km remaining (null if time-only item) */
  kmUntil: number | null;
  /** Raw numeric days remaining (null if km-only and low confidence) */
  daysUntil: number | null;
  /** Suggested target odometer reading, e.g. 192,000 km */
  targetOdometer: number | null;
  /** Humanized km string for display, e.g. "~2.5k km", "Due soon", "Overdue". null = omit. */
  displayKm: string | null;
  /** Humanized time string for display, e.g. "~3 weeks", "~2 months". null = omit. */
  displayTime: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'explicit_interval' | 'wear_model' | 'wear_heuristic' | 'time_only' | 'hm_oem';
}

// ── Internal ──────────────────────────────────────────────────────────────────

interface MileageTrend {
  /** Estimated average daily km for this vehicle */
  dailyKm: number;
  confidence: 'high' | 'medium' | 'low';
  /** Debug label — not shown in UI */
  sourceName: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_DAILY_KM = 5;
const MAX_DAILY_KM = 450;
/** Conservative fleet default when no mileage trend is derivable (~250 km/week) */
const FLEET_FALLBACK_DAILY_KM = 36;

/** Max items surfaced in the card */
const MAX_ITEMS = 4;
/** Show service items up to 12,000 km or 180 days out */
const HORIZON_KM = 12_000;
const HORIZON_DAYS = 180;
/** Oil/service items considered "near" each other when within this km gap */
const SERVICE_OIL_MERGE_GAP_KM = 1_000;
// ── Mileage trend estimation ──────────────────────────────────────────────────

/**
 * Derives the vehicle's average daily km from available data sources.
 *
 * Priority:
 *  1. Brake V2 model coverage distance / days since anchor
 *  2. TireHealth.totalKmOnSet + installedAt — km accumulated since install date
 *  3. OilChangeStatus.kmSinceChange + monthsSinceChange — km/months since last oil change
 *  4. Fleet fallback at ~250 km/week when no other signal is available
 */
function deriveMileageTrend(input: ForecastEngineInput): MileageTrend {
  // ── Source 1: brake V2 anchor span ──
  if (
    input.brakeHealth?.modelCoverage?.distanceSinceAnchorKm != null &&
    input.brakeHealth.lastChangeAt
  ) {
    const dist = input.brakeHealth.modelCoverage.distanceSinceAnchorKm;
    const anchorTs = new Date(input.brakeHealth.lastChangeAt).getTime();
    const days = (Date.now() - anchorTs) / 86_400_000;
    if (dist > 150 && days >= 14) {
      const daily = dist / days;
      if (daily >= MIN_DAILY_KM && daily <= MAX_DAILY_KM) {
        const conf: MileageTrend['confidence'] =
          (input.brakeHealth.modelCoverage.coverageRatio ?? 0) >= 0.75
            ? 'high'
            : 'medium';
        return { dailyKm: daily, confidence: conf, sourceName: 'brake_v2_anchor_span' };
      }
    }
  }

  // ── Source 2: tire set km / days since install ──
  if (input.tires?.totalKmOnSet && input.tires.installedAt) {
    const daysSince = (Date.now() - new Date(input.tires.installedAt).getTime()) / 86_400_000;
    if (daysSince >= 14 && input.tires.totalKmOnSet > 100) {
      const daily = input.tires.totalKmOnSet / daysSince;
      if (daily >= MIN_DAILY_KM && daily <= MAX_DAILY_KM) {
        const conf: MileageTrend['confidence'] = daysSince >= 60 ? 'high' : 'medium';
        return { dailyKm: daily, confidence: conf, sourceName: 'tire_km_on_set' };
      }
    }
  }

  // ── Source 3: km since oil change / months since change ──
  const { oil } = input;
  if (
    oil?.kmSinceChange != null &&
    oil.monthsSinceChange != null &&
    oil.monthsSinceChange > 0.5 &&
    oil.kmSinceChange > 50
  ) {
    const days = oil.monthsSinceChange * 30.5;
    const daily = oil.kmSinceChange / days;
    if (daily >= MIN_DAILY_KM && daily <= MAX_DAILY_KM) {
      return { dailyKm: daily, confidence: 'medium', sourceName: 'oil_since_change' };
    }
  }

  // ── Fallback ──
  return { dailyKm: FLEET_FALLBACK_DAILY_KM, confidence: 'low', sourceName: 'fleet_default' };
}

// ── Humanization helpers ──────────────────────────────────────────────────────

/** Converts remaining km to an operator-readable string. */
export function humanizePlanningKm(km: number | null): string | null {
  if (km == null) return null;
  if (km <= -300) return 'Overdue';
  if (km <= 0) return 'Due now';
  if (km <= 300) return 'Due soon';
  if (km <= 999) return `~${Math.ceil(km / 100) * 100} km`;
  const k = km / 1_000;
  if (k < 5) return `~${k.toFixed(1)}k km`;
  if (k < 10) return `~${Math.round(k * 2) / 2}k km`; // round to 0.5k
  return `~${Math.round(k)}k km`;
}

/**
 * Converts estimated days until event to a readable range string.
 * @param days         Numeric days estimate
 * @param trendConf    Mileage trend confidence (suppresses time if 'low' for km-derived items)
 * @param isExplicit   True for time-based items (TÜV, BOKraft) — always show regardless of trend confidence
 */
export function humanizePlanningDays(
  days: number | null,
  trendConf: MileageTrend['confidence'],
  isExplicit: boolean,
): string | null {
  if (days == null) return null;
  if (!isExplicit && trendConf === 'low') return null;
  if (days <= 0) return 'Now';
  if (days <= 10) return '~1 week';
  if (days <= 18) return '~2 weeks';
  if (days <= 35) return '~3–4 weeks';
  if (days <= 60) return '~2 months';
  if (days <= 90) return '~3 months';
  if (days <= 150) return '~4–5 months';
  return null;
}

function toUrgency(kmUntil: number | null, daysUntil: number | null): PlanningUrgency {
  const km = kmUntil ?? Infinity;
  const days = daysUntil ?? Infinity;
  if (km <= 0 || days <= 0) return 'overdue';
  if (km <= 300 || days <= 7) return 'due';
  if (km <= 2_500 || days <= 42) return 'soon';
  return 'normal';
}

function withinHorizon(kmUntil: number | null, daysUntil: number | null): boolean {
  if (kmUntil != null && kmUntil <= 0) return true;
  if (daysUntil != null && daysUntil <= 0) return true;
  if (kmUntil != null && kmUntil <= HORIZON_KM) return true;
  if (daysUntil != null && daysUntil <= HORIZON_DAYS) return true;
  return false;
}

// ── Item builders ─────────────────────────────────────────────────────────────

function buildOilItem(input: ForecastEngineInput, trend: MileageTrend): PlanningItem | null {
  const { oil } = input;
  if (!oil?.hasBaseline) return null;

  // Derive remaining km (km-based is most precise)
  let kmUntil: number | null = null;
  if (oil.intervalKm != null && oil.kmSinceChange != null) {
    kmUntil = oil.intervalKm - oil.kmSinceChange;
  } else if (oil.remainingPercent != null && oil.intervalKm != null) {
    kmUntil = (oil.remainingPercent / 100) * oil.intervalKm;
  }

  // Derive remaining months
  let monthsUntil: number | null = null;
  if (oil.intervalMonths != null && oil.monthsSinceChange != null) {
    monthsUntil = oil.intervalMonths - oil.monthsSinceChange;
  }

  const daysFromKm = kmUntil != null && kmUntil > 0 ? kmUntil / trend.dailyKm : null;
  const daysFromMonths = monthsUntil != null ? monthsUntil * 30.5 : null;

  // Use the sooner (binding) constraint
  let daysUntil: number | null;
  let bindingIsMonths = false;
  if (daysFromKm != null && daysFromMonths != null) {
    bindingIsMonths = daysFromMonths < daysFromKm;
    daysUntil = bindingIsMonths ? daysFromMonths : daysFromKm;
  } else {
    daysUntil = daysFromKm ?? daysFromMonths;
    bindingIsMonths = daysFromKm == null && daysFromMonths != null;
  }

  if (kmUntil == null && daysUntil == null) return null;
  if (!withinHorizon(kmUntil, daysUntil)) return null;

  const displayKm = bindingIsMonths ? null : humanizePlanningKm(kmUntil);
  const displayTime = humanizePlanningDays(daysUntil, trend.confidence, bindingIsMonths);
  const targetOdometer =
    oil.currentOdometerKm != null && kmUntil != null && kmUntil > 0
      ? Math.round(oil.currentOdometerKm + kmUntil)
      : null;

  return {
    type: 'oil_service',
    title: 'Oil service',
    urgency: toUrgency(bindingIsMonths ? null : kmUntil, daysUntil != null ? Math.round(daysUntil) : null),
    kmUntil: kmUntil != null ? Math.round(kmUntil) : null,
    daysUntil: daysUntil != null ? Math.round(daysUntil) : null,
    targetOdometer,
    displayKm,
    displayTime,
    confidence: kmUntil != null ? trend.confidence : 'medium',
    source: 'explicit_interval',
  };
}

function buildServiceItem(input: ForecastEngineInput, trend: MileageTrend): PlanningItem | null {
  const { service } = input;
  const tracked = service?.nextService?.trackingStatus === 'TRACKED';
  if (!service || !tracked) return null;

  const kmUntil = service.nextService?.distanceToNextServiceKm ?? service.serviceRemainingKm ?? null;
  const daysUntilDirect = service.nextService?.timeToNextServiceDays ?? service.serviceRemainingDays ?? null;

  const daysFromKm = kmUntil != null && kmUntil > 0 ? kmUntil / trend.dailyKm : null;
  const daysFromHm = daysUntilDirect != null && daysUntilDirect > 0 ? daysUntilDirect : null;
  const bindingIsMonths = false;
  const daysUntil =
    [daysFromKm, daysFromHm]
      .filter((d): d is number => d != null)
      .reduce((min, d) => (min == null || d < min ? d : min), null as number | null) ?? null;

  if (kmUntil == null && daysUntil == null) return null;
  if (!withinHorizon(kmUntil, daysUntil)) return null;

  return {
    type: 'service_due',
    title: 'Service check',
    urgency: toUrgency(bindingIsMonths ? null : kmUntil, daysUntil != null ? Math.round(daysUntil) : null),
    kmUntil: kmUntil != null ? Math.round(kmUntil) : null,
    daysUntil: daysUntil != null ? Math.round(daysUntil) : null,
    targetOdometer: null,
    displayKm: bindingIsMonths ? null : humanizePlanningKm(kmUntil),
    displayTime: humanizePlanningDays(daysUntil, trend.confidence, bindingIsMonths),
    confidence: trend.confidence,
    source: 'hm_oem',
  };
}

function buildInspectionItems(input: ForecastEngineInput): PlanningItem[] {
  const items: PlanningItem[] = [];
  const { service } = input;

  // TÜV (time-only — date is known exactly)
  const tuvMonths = service?.tuvRemainingMonths ?? null;
  if (tuvMonths != null && tuvMonths < 7) {
    const days = Math.round(tuvMonths * 30.5);
    if (withinHorizon(null, days)) {
      items.push({
        type: 'inspection_due',
        title: 'TÜV inspection',
        urgency: toUrgency(null, days),
        kmUntil: null,
        daysUntil: days,
        targetOdometer: null,
        displayKm: null,
        displayTime: humanizePlanningDays(days, 'high', true),
        confidence: 'high',
        source: 'time_only',
      });
    }
  }

  // BOKraft (time-only)
  const bokMonths = service?.bokraftRemainingMonths ?? null;
  if (bokMonths != null && bokMonths < 7) {
    const days = Math.round(bokMonths * 30.5);
    if (withinHorizon(null, days)) {
      items.push({
        type: 'inspection_due',
        title: 'BOKraft inspection',
        urgency: toUrgency(null, days),
        kmUntil: null,
        daysUntil: days,
        targetOdometer: null,
        displayKm: null,
        displayTime: humanizePlanningDays(days, 'high', true),
        confidence: 'high',
        source: 'time_only',
      });
    }
  }

  return items;
}

function buildBrakeItem(input: ForecastEngineInput, trend: MileageTrend): PlanningItem | null {
  // ── Tier A: V2 brake model (estimatedLifetimeKm = remaining km from model) ──
  if (
    input.brakeHealth?.isInitialized &&
    (input.brakeHealth.stateClass === 'MEASURED' || input.brakeHealth.stateClass === 'ESTIMATED')
  ) {
    const kmUntil =
      input.brakeHealth.estimatedReplacementDueInKm ??
      input.brakeHealth.estimatedFrontRemainingKmMin ??
      null;
    if (kmUntil == null) return null;
    if (!Number.isFinite(kmUntil)) return null;

    const daysUntil = kmUntil > 0 ? Math.round(kmUntil / trend.dailyKm) : 0;
    if (!withinHorizon(kmUntil, daysUntil)) return null;

    // Degrade confidence when brake model confidence is low
    const modelConfScore = input.brakeHealth.confidence?.score ?? 1;
    const conf: MileageTrend['confidence'] =
      modelConfScore >= 70 ? trend.confidence : modelConfScore >= 45 ? 'medium' : 'low';

    return {
      type: 'brake_inspection',
      title: 'Brake inspection',
      urgency: toUrgency(kmUntil, daysUntil),
      kmUntil: Math.round(kmUntil),
      daysUntil,
      targetOdometer: null,
      displayKm: humanizePlanningKm(kmUntil),
      displayTime: humanizePlanningDays(daysUntil, conf, false),
      confidence: conf,
      source: 'wear_model',
    };
  }

  return null;
}

function buildTireItem(input: ForecastEngineInput, trend: MileageTrend): PlanningItem | null {
  const { tires } = input;
  const remaining = tires?.evidencePresentation?.remainingKm;
  const kmRaw = remaining?.exactKm ?? remaining?.bandMinKm ?? tires?.estimatedRemainingKm ?? tires?.overallRemainingKm;
  if (!tires || kmRaw == null || !remaining?.reliable && remaining?.bandMinKm == null && tires.estimatedRemainingKm == null) {
    if (!tires?.predictionCapable) return null;
  }
  if (kmRaw == null) return null;

  const kmUntil = Math.max(0, Math.round(kmRaw));
  const daysUntil = kmUntil > 0 ? Math.round(kmUntil / trend.dailyKm) : 0;
  if (!withinHorizon(kmUntil, daysUntil)) return null;

  const tireConf: MileageTrend['confidence'] =
    tires.confidence === 'HIGH' ? trend.confidence
    : tires.confidence === 'MEDIUM' ? 'medium'
    : 'low';

  const ui = tires.evidencePresentation?.uiStatus ?? tires.overallStatus;
  const isReplacement =
    tires.actionState === 'REPLACE' || ui === 'CRITICAL';

  return {
    type: 'tire_check',
    title: isReplacement ? 'Tire replacement' : 'Tire check',
    urgency: toUrgency(kmUntil, daysUntil),
    kmUntil,
    daysUntil,
    targetOdometer: null,
    displayKm: humanizePlanningKm(kmUntil),
    displayTime: humanizePlanningDays(daysUntil, tireConf, false),
    confidence: tireConf,
    source: 'wear_model',
  };
}

function buildBatteryItem(input: ForecastEngineInput): PlanningItem | null {
  const { battery } = input;
  const condition = battery?.lv?.condition ?? battery?.condition;
  const status = battery?.lv?.status ?? null;
  if (!battery || condition !== 'attention') return null;
  if (status === 'calibrating' || status === 'estimate_unavailable') return null;

  return {
    type: 'battery_check',
    title: 'Battery check',
    urgency: 'due',
    kmUntil: null,
    daysUntil: null,
    targetOdometer: null,
    displayKm: null,
    displayTime: 'Soon',
    confidence: 'medium',
    source: 'wear_model',
  };
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Merges oil service and general service into a single item when their
 * km-until values are within SERVICE_OIL_MERGE_GAP_KM of each other.
 * This prevents showing "Service check ~2,000 km" AND "Oil service ~2,200 km"
 * as separate items when they would realistically be done together.
 */
function deduplicateItems(items: PlanningItem[]): PlanningItem[] {
  const oilIdx = items.findIndex((i) => i.type === 'oil_service');
  const svcIdx = items.findIndex((i) => i.type === 'service_due');

  if (oilIdx === -1 || svcIdx === -1) return items;

  const oil = items[oilIdx];
  const svc = items[svcIdx];
  const oilKm = oil.kmUntil ?? Infinity;
  const svcKm = svc.kmUntil ?? Infinity;

  if (Math.abs(oilKm - svcKm) < SERVICE_OIL_MERGE_GAP_KM) {
    // Keep the sooner item, merge title
    const primary = oilKm <= svcKm ? oil : svc;
    const merged: PlanningItem = { ...primary, title: 'Service + oil change' };
    return [merged, ...items.filter((_, i) => i !== oilIdx && i !== svcIdx)];
  }

  return items;
}

// ── Urgency sort ──────────────────────────────────────────────────────────────

const URGENCY_RANK: Record<PlanningUrgency, number> = {
  overdue: 0, due: 1, soon: 2, normal: 3,
};

// ── Main engine entry point ───────────────────────────────────────────────────

export function runForecastEngine(input: ForecastEngineInput): PlanningItem[] {
  const trend = deriveMileageTrend(input);

  const candidates = [
    buildOilItem(input, trend),
    buildServiceItem(input, trend),
    ...buildInspectionItems(input),
    buildBrakeItem(input, trend),
    buildTireItem(input, trend),
    buildBatteryItem(input),
  ].filter((item): item is PlanningItem => item != null);

  const deduplicated = deduplicateItems(candidates);

  deduplicated.sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rankDiff !== 0) return rankDiff;
    return (a.daysUntil ?? 9_999) - (b.daysUntil ?? 9_999);
  });

  return deduplicated.slice(0, MAX_ITEMS);
}

// ── UI helpers (for component rendering) ─────────────────────────────────────

/**
 * Left border accent class based on urgency — applied to each forecast row.
 */
export function planningUrgencyBorder(urgency: PlanningUrgency): string {
  switch (urgency) {
    case 'overdue': return 'border-l-red-500';
    case 'due':     return 'border-l-red-400';
    case 'soon':    return 'border-l-amber-400';
    case 'normal':  return 'border-l-blue-300';
  }
}

/**
 * Returns true when the displayKm value represents an overdue or due-now state,
 * used to apply urgent color styling to the km badge.
 */
export function kmDisplayIsUrgent(displayKm: string | null): boolean {
  return displayKm === 'Overdue' || displayKm === 'Due now' || displayKm === 'Due soon';
}

/**
 * Engine metadata for populating confidence note in the insights card.
 */
export interface ForecastMeta {
  mileageTrendSource: string;
  mileageConfidence: 'high' | 'medium' | 'low';
  hasOilData: boolean;
  hasBrakeV2: boolean;
}

export function getForecastMeta(input: ForecastEngineInput): ForecastMeta {
  const trend = deriveMileageTrend(input);
  return {
    mileageTrendSource: trend.sourceName,
    mileageConfidence: trend.confidence,
    hasOilData: input.oil?.hasBaseline ?? false,
    hasBrakeV2: input.brakeHealth?.isInitialized ?? false,
  };
}

// TODO: When odometer history endpoint becomes available (e.g. daily snapshots),
//       replace the mileage trend heuristics above with a rolling 30-day
//       regression over actual odometer readings for higher accuracy.
//
// TODO: Booking intensity (from bookings module) could weight time estimates for
//       high-utilization periods — e.g. a vehicle running 5 bookings/week should
//       use a higher km/day rate than the fleet fallback.
