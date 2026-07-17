import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CanonicalBatteryHealthService } from '../vehicle-intelligence/battery-health/canonical-battery-health.service';
import { TireHealthService, TireHealthSummary } from '../vehicle-intelligence/tires/tire-health.service';
import { TireHealthObservabilityService } from '../vehicle-intelligence/tires/tire-health-observability.service';
import { BrakeHealthService, BrakeHealthSummaryDto } from '../vehicle-intelligence/brakes/brake-health.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import { HmSignalUsageService } from '../high-mobility/high-mobility-signal-usage.service';
import type { ServiceComplianceEvaluation } from '../vehicle-intelligence/service-compliance/service-compliance.types';
import { ServiceComplianceService } from '../vehicle-intelligence/service-compliance/service-compliance.service';
import {
  dtcBandToHealthState,
  isSafetyCriticalDtcBand,
  type DtcSeverityBand,
} from '../vehicle-intelligence/dtc/dtc-severity.util';
import {
  HealthState,
  ModuleHealth,
  VehicleHealth,
  computeOverallState,
  maxSeverity,
  isStale,
  toIso,
} from './rental-health.types';
import {
  buildTireModuleHealth,
  isTireRentalHardBlocked,
} from './tire-rental-health.policy';
import { TireRentalHealthReviewService } from './tire-rental-health-review.service';
import type { TireRentalHealthModuleHealth } from './tire-rental-health.types';
import {
  buildBrakeModuleHealth,
  isBrakeRentalHardBlocked,
} from './brake-rental-health.policy';
import { BrakeRentalHealthReviewService } from './brake-rental-health-review.service';
import type { BrakeRentalHealthModuleHealth } from './brake-rental-health.types';

export type RentalHealthGateStatus = 'OK' | 'BLOCKED' | 'UNAVAILABLE' | 'UNKNOWN';

export interface RentalHealthGateResult {
  blocked: boolean;
  reasons: string[];
  healthGateStatus: RentalHealthGateStatus;
  healthGateWarning: string | null;
  manualReviewRequired: boolean;
}


/**
 * Lifecycle statuses that keep a complaint "open" for rental-health purposes.
 * ACTIVE is the legacy status (≈ OPEN) kept for backwards-compat. IN_REVIEW
 * and CONFIRMED are the new V1 statuses. RESOLVED and REJECTED are ignored.
 */
const OPEN_COMPLAINT_STATUSES = ['ACTIVE', 'OPEN', 'IN_REVIEW', 'CONFIRMED', 'NEW'] as const;

/**
 * Rental Health V1 — consumption-only aggregation layer.
 *
 * This service NEVER writes back to any health domain. It reads the DTOs
 * that Battery/Tires/Brakes/DTC/Service-Info/HM already produce, applies
 * the canonical Health-State mapping from the V1 spec, combines the seven
 * modules to an overall state and the `rental_blocked` gate.
 *
 * Core contract:
 *   - unknown is NEVER silently promoted to good
 *   - n_a and unknown are strictly distinguished
 *   - every module returns a reason, a timestamp and a data_stale flag
 *   - rental_blocked is an independent boolean, not derived from overall_state
 */
@Injectable()
export class RentalHealthService {
  private readonly logger = new Logger(RentalHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly battery: CanonicalBatteryHealthService,
    private readonly tires: TireHealthService,
    private readonly brakes: BrakeHealthService,
    private readonly dtc: DtcService,
    private readonly hm: HmSignalUsageService,
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly tireRentalReview: TireRentalHealthReviewService,
    private readonly brakeRentalReview: BrakeRentalHealthReviewService,
    @Optional() private readonly tireObservability?: TireHealthObservabilityService,
  ) {}

  /**
   * Compute the full {@link VehicleHealth} for a single vehicle. Throws
   * NotFoundException if the vehicle does not belong to the organization.
   */
  async getVehicleHealth(orgId: string, vehicleId: string): Promise<VehicleHealth> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        fuelType: true,
        lastTuvDate: true,
        nextTuvDate: true,
        lastBokraftDate: true,
        nextBokraftDate: true,
        lastServiceDate: true,
        lastServiceOdometerKm: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found for org ${orgId}`);
    }

    // Fan out module reads in parallel — each module owns its own error
    // budget so a single slow/failing path never pins the whole endpoint.
    const [
      batteryRes,
      tiresRes,
      brakesRes,
      dtcRes,
      hmAiRes,
      tireReviewOverrideRes,
      brakeReviewOverrideRes,
      currentOdoRes,
      complaintsRes,
      complianceRes,
    ] = await Promise.allSettled([
      this.battery.getSummary(vehicleId),
      this.hm.getTirePressureSignals(vehicleId).then((hmTirePressure) =>
        this.tires.getSummary(vehicleId, { hmTirePressure }),
      ),
      this.brakes.getSummary(vehicleId),
      this.dtc.getSummary(vehicleId),
      this.hm.getAiHealthCareSignals(vehicleId).catch(() => null),
      this.tireRentalReview.findActiveOverride(orgId, vehicleId),
      this.brakeRentalReview.findActiveOverride(orgId, vehicleId),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { odometerKm: true },
      }),
      this.prisma.vehicleComplaint.findMany({
        where: {
          vehicleId,
          organizationId: orgId,
          status: { in: OPEN_COMPLAINT_STATUSES as any },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.serviceCompliance.evaluateCompliance(vehicleId, {
        lastTuvDate: vehicle.lastTuvDate,
        nextTuvDate: vehicle.nextTuvDate,
        lastBokraftDate: vehicle.lastBokraftDate,
        nextBokraftDate: vehicle.nextBokraftDate,
      }),
    ]);

    const batterySummary = unwrap(batteryRes);
    const tireSummary = unwrap(tiresRes) as TireHealthSummary | null;
    const tireReviewOverride = unwrap(tireReviewOverrideRes);
    const brakeReviewOverride = unwrap(brakeReviewOverrideRes);
    const brakesLoadError =
      brakesRes.status === 'rejected'
        ? (brakesRes.reason as Error)?.message ?? 'Brake health unavailable'
        : null;
    const brakeSummary =
      brakesRes.status === 'fulfilled'
        ? (brakesRes.value as BrakeHealthSummaryDto)
        : null;
    const dtcSummary = unwrap(dtcRes);
    const hmAi = unwrap(hmAiRes);
    const complaintsLoaded = complaintsRes.status === 'fulfilled';
    const openComplaints = complaintsLoaded ? (unwrap(complaintsRes) ?? []) : [];
    const complianceEval = unwrap(complianceRes);
    const serviceComplianceModule = complianceEval
      ? this.serviceCompliance.toRentalModuleHealth(
          complianceEval,
          vehicle.lastServiceDate,
          vehicle.nextTuvDate,
          vehicle.nextBokraftDate,
          vehicle.lastTuvDate,
          vehicle.lastBokraftDate,
        )
      : {
          state: 'unknown' as const,
          reason: 'Service-Compliance konnte nicht geladen werden',
          last_updated_at: null,
          data_stale: true,
          source: 'service_compliance',
          evidence_type: 'unknown' as const,
        };

    const modules = {
      battery: this.evaluateBattery(batterySummary, hmAi),
      tires: this.evaluateTires(tireSummary, tireReviewOverride),
      brakes: this.evaluateBrakes(brakeSummary, {
        moduleLoadError: brakesLoadError,
        activeReviewOverride: brakeReviewOverride,
      }),
      error_codes: this.evaluateErrorCodes(dtcSummary),
      service_compliance: {
        ...serviceComplianceModule,
        source: 'service_compliance',
        evidence_type: this.serviceComplianceEvidenceType(complianceEval),
      },
      complaints: this.evaluateComplaints(openComplaints, complaintsLoaded),
      vehicle_alerts: this.evaluateVehicleAlerts(hmAi),
    } as const;

    const overall_state = computeOverallState(Object.values(modules));
    const blocking_reasons = this.collectBlockingReasons(
      modules,
      openComplaints,
      hmAi,
      complianceEval,
      dtcSummary,
      brakeSummary,
    );

    return {
      vehicle_id: vehicleId,
      organization_id: orgId,
      overall_state,
      rental_blocked: blocking_reasons.length > 0,
      blocking_reasons,
      modules,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Lean check for the bookings gate. Resolves `true` iff the vehicle is
   * currently rental-blocked. Internally reuses {@link getVehicleHealth}
   * — we deliberately do not expose a side-door that could drift from
   * the UI signal, so UI and gate always agree on "why blocked".
   */
  async isRentalBlocked(
    orgId: string,
    vehicleId: string,
  ): Promise<RentalHealthGateResult> {
    try {
      const health = await this.getVehicleHealth(orgId, vehicleId);
      if (health.rental_blocked) {
        return {
          blocked: true,
          reasons: health.blocking_reasons,
          healthGateStatus: 'BLOCKED',
          healthGateWarning: null,
          manualReviewRequired: false,
        };
      }
      return {
        blocked: false,
        reasons: [],
        healthGateStatus: 'OK',
        healthGateWarning: null,
        manualReviewRequired: false,
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(
        `Rental-health gate unavailable for ${vehicleId}: ${message}`,
      );
      return {
        blocked: true,
        reasons: ['Fahrzeug-Gesundheit konnte nicht geprüft werden'],
        healthGateStatus: 'UNAVAILABLE',
        healthGateWarning:
          'Fahrzeug-Gesundheit konnte nicht vollständig geprüft werden. Manuelle Bestätigung erforderlich.',
        manualReviewRequired: true,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Module evaluators — one per VehicleHealth.modules key
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Battery — reads the canonical LV battery status from
   * {@link CanonicalBatteryHealthService.getSummary}. This module no longer
   * re-derives a state from the raw voltage (which could be a charging
   * voltage); it consumes the aggregated `lv.healthStatus` (Estimated Battery
   * Health + battery-spec resting-voltage bands) so there is a single source
   * of truth. The HM battery warning light still escalates to at least
   * warning when streamed.
   */
  private evaluateBattery(
    summary: Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>> | null,
    hmAi: any | null,
  ): ModuleHealth {
    if (!summary) {
      return {
        state: 'unknown',
        reason: 'Keine Batterie-Daten verfügbar',
        last_updated_at: null,
        data_stale: true,
        source: 'canonical_battery',
        evidence_type: 'unknown',
      };
    }

    const lv = summary.lv;
    const restingVoltage = lv?.restingVoltage?.valueV ?? null;
    const observedAt =
      lv?.freshness?.observedAt ??
      summary.currentState?.lastChecked ??
      summary.generatedAt ??
      null;

    // HM battery warning light (dashboard_lights.battery_low_warning).
    // We parse it defensively — the field only exists on Mercedes fleet-
    // clearance payloads today, most other OEMs don't stream it.
    const warningLightActive = readBatteryWarningLight(hmAi);

    let state: HealthState;
    let reason: string;

    // The resting-voltage value carried here is guaranteed to be a genuine
    // open-circuit reading (resting snapshot or engine-off) by the canonical
    // service — a live/charging voltage lives in `lv.telemetry.voltageV` and is
    // never relabeled as "Ruhespannung". `measurementContext === 'RESTING'`
    // re-asserts that contract defensively.
    const restingStatus = lv?.restingVoltage?.status ?? null;
    const restingIsGenuine =
      restingVoltage != null && lv?.restingVoltage?.measurementContext === 'RESTING';
    // A genuine resting note is only attached when the resting voltage is itself
    // the concern (WARNING/CRITICAL) or to confirm a healthy battery. It must
    // never be glued onto an alert that came from the behaviour score / warning
    // light — otherwise a good 12.84 V reading would read as the reason to watch.
    const restingNote = restingIsGenuine
      ? ` (Ruhespannung ${restingVoltage.toFixed(2)} V)`
      : '';
    const restingIsConcern = restingStatus === 'WARNING' || restingStatus === 'CRITICAL';

    switch (lv?.healthStatus) {
      case 'GOOD':
        state = 'good';
        reason = `Batteriezustand gut${restingNote}`;
        break;
      case 'WATCH':
        // WATCH is a soft, non-alertable signal (battery-status#isAlertableStatus
        // is false for WATCH). It must not surface as an operational battery
        // warning: a mid-band behaviour score or a 12.84 V resting voltage stays
        // "good" with a neutral note — no "Batterie beobachten" alert, no
        // preventsReady, no dashboard health risk downstream.
        state = 'good';
        reason = `Batteriezustand unauffällig${restingNote}`;
        break;
      case 'WARNING':
        state = 'warning';
        reason = restingIsConcern
          ? `Batterie auffällig — Nachladen/Prüfen empfohlen${restingNote}`
          : 'Geschätzte Batteriegesundheit niedrig — Prüfen empfohlen';
        break;
      case 'CRITICAL':
        state = 'critical';
        reason = restingIsConcern
          ? `Batterie kritisch${restingNote}`
          : 'Geschätzte Batteriegesundheit kritisch — Austausch prüfen';
        break;
      default:
        state = 'unknown';
        reason = 'Keine belastbare Batteriebewertung verfügbar';
    }

    if (warningLightActive) {
      state = maxSeverity(state, 'warning');
      reason = 'Batterie-Warnleuchte aktiv';
    }

    return {
      state,
      reason,
      last_updated_at: toIso(observedAt),
      data_stale: isStale(observedAt),
      source: warningLightActive ? 'hm_oem' : 'canonical_battery',
      evidence_type:
        lv?.estimatedHealth?.displayMode === 'BARS' && lv?.healthStatus
          ? 'estimated'
          : restingVoltage != null
            ? 'measured'
            : 'provider',
    };
  }

  /**
   * Tires — evidence-aware policy via {@link buildTireModuleHealth}.
   * Estimated tread never hard-blocks; measured tread ≤ legal minimum does.
   */
  private evaluateTires(
    summary: TireHealthSummary | null,
    activeReviewOverride: import('./tire-rental-health.types').TireRentalReviewOverrideSummary | null,
  ): TireRentalHealthModuleHealth {
    const moduleHealth = buildTireModuleHealth({
      summary,
      activeReviewOverride,
    });
    const block = moduleHealth.tire_read_model?.rentalBlockingEvidence;
    if (block) {
      this.tireObservability?.recordRentalBlock({
        level: block.action,
        reasonCode: block.reasonCode,
      });
    }
    return moduleHealth;
  }

  /**
   * Brakes — evidence-aware policy via {@link buildBrakeModuleHealth}.
   * Wear, safety, and data quality are evaluated separately; hard blocks
   * require measured wear or active safety evidence.
   */
  private evaluateBrakes(
    summary: BrakeHealthSummaryDto | null,
    options?: {
      moduleLoadError?: string | null;
      activeReviewOverride?: import('./brake-rental-health.types').BrakeRentalReviewOverrideSummary | null;
    },
  ): BrakeRentalHealthModuleHealth {
    return buildBrakeModuleHealth({
      summary,
      moduleLoadError: options?.moduleLoadError ?? null,
      activeReviewOverride: options?.activeReviewOverride ?? null,
    });
  }

  /**
   * Error Codes — reads {@link DtcService.getSummary}. Active faults use
   * normalized severity bands; safety-critical bands block rental.
   */
  private evaluateErrorCodes(
    summary: Awaited<ReturnType<DtcService['getSummary']>> | null,
  ): ModuleHealth {
    if (!summary) {
      return {
        state: 'unknown',
        reason: 'Keine DTC-Daten verfügbar',
        last_updated_at: null,
        data_stale: true,
        source: 'dtc_poll',
        evidence_type: 'unknown',
      };
    }

    const lastAt = summary.lastSuccessfulCheckAt ?? summary.lastCheckedAt ?? null;

    if (summary.status === 'unavailable') {
      return {
        state: 'unknown',
        reason: 'Noch keine DTC-Prüfung durchgeführt',
        last_updated_at: toIso(lastAt),
        data_stale: true,
        source: 'dtc_poll',
        evidence_type: 'unknown',
      };
    }

    if (summary.status === 'stale') {
      return {
        state: 'unknown',
        reason: 'DTC-Status veraltet',
        last_updated_at: toIso(lastAt),
        data_stale: true,
        source: 'dtc_poll',
        evidence_type: 'unknown',
      };
    }

    if (summary.status === 'clean') {
      return {
        state: 'good',
        reason: 'Keine aktiven Fehlercodes',
        last_updated_at: toIso(lastAt),
        data_stale: isStale(lastAt),
        source: 'dtc_poll',
        evidence_type: 'provider',
      };
    }

    const worstBand: DtcSeverityBand =
      summary.worstSeverityBand ??
      ('unknown' as DtcSeverityBand);
    const state = dtcBandToHealthState(worstBand);
    const safetyCritical = isSafetyCriticalDtcBand(worstBand);
    const reason = safetyCritical
      ? `${summary.activeFaultCount} aktive Fehlercodes — sicherheitsrelevant`
      : `${summary.activeFaultCount} aktive Fehlercodes`;

    return {
      state,
      reason,
      last_updated_at: toIso(lastAt),
      data_stale: isStale(lastAt),
      source: 'dtc_poll',
      evidence_type: 'provider',
    };
  }

  /**
   * Technical observations (vehicle_complaints) — canonical intake/evidence layer.
   *
   * Module state:
   *   - good: no active observations
   *   - warning: active low/medium/high without blocksRental
   *   - critical: active critical severity OR blocksRental true
   *
   * Rental blocking is handled separately in collectBlockingReasons and only
   * when blocksRental is explicitly true — severity alone never blocks rental.
   */
  private evaluateComplaints(
    complaints: Array<{
      id: string;
      description: string;
      urgency: string;
      status: string;
      impact: string | null;
      blocksRental?: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>,
    loaded: boolean,
  ): ModuleHealth {
    if (!loaded) {
      return {
        state: 'unknown',
        reason: 'Technische Beobachtungen konnten nicht geladen werden',
        last_updated_at: null,
        data_stale: true,
        source: 'complaints',
        evidence_type: 'unknown',
      };
    }

    if (complaints.length === 0) {
      return {
        state: 'good',
        reason: 'Keine aktiven technischen Beobachtungen',
        last_updated_at: null,
        data_stale: false,
        source: 'complaints',
        evidence_type: 'complaint',
      };
    }

    const newest = complaints[0];
    const newestIso = newest.updatedAt.toISOString();

    const critical = complaints.find(
      (c) => c.urgency === 'CRITICAL' || c.blocksRental === true,
    );
    if (critical) {
      return {
        state: 'critical',
        reason: critical.blocksRental
          ? `Vermietungsblockierende Beobachtung vom ${formatDate(critical.createdAt)}`
          : `Kritische technische Beobachtung vom ${formatDate(critical.createdAt)}`,
        last_updated_at: critical.updatedAt.toISOString(),
        data_stale: false,
        source: 'complaints',
        evidence_type: 'complaint',
      };
    }

    return {
      state: 'warning',
      reason:
        complaints.length === 1
          ? `Aktive technische Beobachtung vom ${formatDate(newest.createdAt)}`
          : `${complaints.length} aktive technische Beobachtungen`,
      last_updated_at: newestIso,
      data_stale: false,
      source: 'complaints',
      evidence_type: 'complaint',
    };
  }

  /**
   * Vehicle Alerts (OEM) — reads {@link HmSignalUsageService.getAiHealthCareSignals}.
   *
   * V1 covers limp mode + oil level only (brake/tire/battery routed to sibling modules).
   *
   * TODO(V2): consume {@link DashboardWarningLightsService} as single canonical truth
   * instead of parallel HM boolean parsing — `rentalHealthReady` flag is set on the
   * telltale read model for this migration.
   */
  private evaluateVehicleAlerts(
    hmAi: {
      oilLevel: { value: unknown; unit: string | null; status: string | null } | null;
      limpModeActive: boolean | null;
      lastUpdatedAt: string | null;
    } | null,
  ): ModuleHealth {
    if (!hmAi) {
      return {
        state: 'n_a',
        reason: 'Keine OEM-Warnleuchten-Quelle aktiv',
        last_updated_at: null,
        data_stale: false,
        source: 'hm_oem',
        evidence_type: 'unknown',
      };
    }

    const lastUpdated = hmAi.lastUpdatedAt ?? null;

    if (hmAi.limpModeActive === true) {
      return {
        state: 'critical',
        reason: 'Limp Mode aktiv',
        last_updated_at: lastUpdated,
        data_stale: isStale(lastUpdated),
        source: 'hm_oem',
        evidence_type: 'provider',
      };
    }

    const oilStatus = (hmAi.oilLevel?.status ?? '').toUpperCase();
    if (oilStatus === 'LOW' || oilStatus === 'MINIMUM') {
      return {
        state: 'critical',
        reason: 'Motoröl Minimum',
        last_updated_at: lastUpdated,
        data_stale: isStale(lastUpdated),
      };
    }
    if (oilStatus === 'HIGH' || oilStatus === 'MAXIMUM') {
      return {
        state: 'warning',
        reason: 'Motoröl über Maximum',
        last_updated_at: lastUpdated,
        data_stale: isStale(lastUpdated),
      };
    }

    const limpUnknown = hmAi.limpModeActive === null;
    const oilUnknown = !oilStatus || oilStatus === 'UNKNOWN';
    if (limpUnknown && oilUnknown) {
      return {
        state: 'unknown',
        reason: 'Noch kein verwertbarer OEM-Warnleuchten-Status',
        last_updated_at: lastUpdated,
        data_stale: isStale(lastUpdated),
      };
    }

    // Explicit quiet signals only — never infer "good" from missing data.
    return {
      state: 'good',
      reason: 'Keine OEM-Warnleuchten aktiv',
      last_updated_at: lastUpdated,
      data_stale: isStale(lastUpdated),
      source: 'hm_oem',
      evidence_type: 'provider',
    };
  }

  private serviceComplianceEvidenceType(
    evaluation: ServiceComplianceEvaluation | null,
  ): ModuleHealth['evidence_type'] {
    if (!evaluation) return 'unknown';
    if (evaluation.nextService.trackingStatus === 'TRACKED') return 'provider';
    if (
      evaluation.tuvBokraft.tuvValidTill ||
      evaluation.tuvBokraft.bokraftValidTill
    ) {
      return 'manual';
    }
    return 'unknown';
  }

  private isBrakeBlockWorthy(modules: VehicleHealth['modules']): boolean {
    const brakeModule = modules.brakes as BrakeRentalHealthModuleHealth;
    return (
      !!brakeModule.brake_read_model &&
      isBrakeRentalHardBlocked(brakeModule.brake_read_model)
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Rental-blocked reasons collector
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Produce the human-readable `blocking_reasons[]` list according to the
   * V1 spec. Order matches the spec table so the UI renders a predictable
   * blocking banner (compliance first, then safety/operational).
   */
  private collectBlockingReasons(
    modules: VehicleHealth['modules'],
    openComplaints: Array<{ impact: string | null; description?: string; blocksRental?: boolean }>,
    hmAi: { limpModeActive: boolean | null; oilLevel: { status: string | null } | null } | null,
    complianceEval: ServiceComplianceEvaluation | null,
    dtcSummary: Awaited<ReturnType<DtcService['getSummary']>> | null,
    brakeSummary: BrakeHealthSummaryDto | null,
  ): string[] {
    const reasons: string[] = [];

    if (complianceEval?.tuvBokraft.tuvOverdue) {
      const days = complianceEval.tuvBokraft.tuvRemainingDays;
      reasons.push(
        days != null
          ? `TÜV abgelaufen seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'}`
          : 'TÜV abgelaufen',
      );
    }
    if (complianceEval?.tuvBokraft.bokraftOverdue) {
      const days = complianceEval.tuvBokraft.bokraftRemainingDays;
      reasons.push(
        days != null
          ? `BOKraft abgelaufen seit ${Math.abs(days)} Tag${Math.abs(days) === 1 ? '' : 'en'}`
          : 'BOKraft abgelaufen',
      );
    }

    const rentalBlockingObservation = openComplaints.find((c) => c.blocksRental === true);
    if (rentalBlockingObservation) {
      reasons.push('Technische Beobachtung blockiert Vermietung');
    }

    if (hmAi?.limpModeActive === true) {
      reasons.push('Limp Mode aktiv');
    }

    if (this.isBrakeBlockWorthy(modules)) {
      const brakeModule = modules.brakes as BrakeRentalHealthModuleHealth;
      const evidence = brakeModule.brake_read_model.rentalBlockingEvidence!;
      reasons.push(`Bremsen: ${evidence.message}`);
    }

    const tireModule = modules.tires as TireRentalHealthModuleHealth;
    if (
      tireModule.tire_read_model &&
      isTireRentalHardBlocked(tireModule.tire_read_model)
    ) {
      const evidence = tireModule.tire_read_model.rentalBlockingEvidence!;
      reasons.push(`Reifen: ${evidence.message}`);
    }

    const dtcBand = dtcSummary?.worstSeverityBand;
    if (
      modules.error_codes.state === 'critical' &&
      (dtcBand ? isSafetyCriticalDtcBand(dtcBand) : true)
    ) {
      reasons.push(`Fehlercodes: ${modules.error_codes.reason}`);
    }

    const oilStatus = (hmAi?.oilLevel?.status ?? '').toUpperCase();
    if (oilStatus === 'LOW' || oilStatus === 'MINIMUM') {
      reasons.push('Motoröl Minimum');
    }

    return reasons;
  }
}

// ── Utility helpers (pure functions) ─────────────────────────────────────────

function unwrap<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === 'fulfilled' ? (r.value as T) : null;
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.`;
}

/**
 * Read the Mercedes-style battery warning light from HM dashboard lights.
 * Returns `true` only if we have a concrete positive signal; all other
 * cases (missing field, unknown OEM) → false so we don't fabricate a
 * warning where none exists.
 */
function readBatteryWarningLight(hmAi: any | null): boolean {
  if (!hmAi?.dashboardLights) return false;
  const raw = hmAi.dashboardLights;
  // dashboardLights can be an array of { name, state } or a map.
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const name = String(entry?.name ?? '').toLowerCase();
      const state = String(entry?.state ?? '').toLowerCase();
      if (
        /battery|batterie/.test(name) &&
        (state === 'on' || state === 'active' || state === 'warning')
      ) {
        return true;
      }
    }
  } else if (typeof raw === 'object') {
    for (const [name, state] of Object.entries(raw)) {
      if (
        /battery|batterie/i.test(name) &&
        /on|active|warning|true|1/i.test(String(state))
      ) {
        return true;
      }
    }
  }
  return false;
}
