import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CanonicalBatteryHealthService } from '../vehicle-intelligence/battery-health/canonical-battery-health.service';
import { TireHealthService, TireHealthSummary } from '../vehicle-intelligence/tires/tire-health.service';
import { BrakeHealthService, BrakeHealthSummaryDto } from '../vehicle-intelligence/brakes/brake-health.service';
import { DtcService } from '../vehicle-intelligence/dtc/dtc.service';
import { HmSignalUsageService } from '../high-mobility/high-mobility-signal-usage.service';
import {
  HealthState,
  ModuleHealth,
  VehicleHealth,
  computeOverallState,
  maxSeverity,
  isStale,
  toIso,
} from './rental-health.types';

// ── Thresholds ───────────────────────────────────────────────────────────────

/** Days remaining on TÜV / BOKraft below which we flip the module to warning. */
const COMPLIANCE_WARNING_DAYS = 60;

/**
 * Lifecycle statuses that keep a complaint "open" for rental-health purposes.
 * ACTIVE is the legacy status (≈ OPEN) kept for backwards-compat. IN_REVIEW
 * and CONFIRMED are the new V1 statuses. RESOLVED and REJECTED are ignored.
 */
const OPEN_COMPLAINT_STATUSES = ['ACTIVE', 'OPEN', 'IN_REVIEW', 'CONFIRMED'] as const;

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
        nextServiceDueDate: true,
        serviceIntervalManufacturerKm: true,
        serviceIntervalManufacturerMonths: true,
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
      currentOdoRes,
      complaintsRes,
    ] = await Promise.allSettled([
      this.battery.getSummary(vehicleId),
      this.tires.getSummary(vehicleId),
      this.brakes.getSummary(vehicleId),
      this.dtc.getSummary(vehicleId),
      this.hm.getAiHealthCareSignals(vehicleId).catch(() => null),
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
    ]);

    const batterySummary = unwrap(batteryRes);
    const tireSummary = unwrap(tiresRes) as TireHealthSummary | null;
    const brakeSummary = unwrap(brakesRes) as BrakeHealthSummaryDto | null;
    const dtcSummary = unwrap(dtcRes);
    const hmAi = unwrap(hmAiRes);
    const currentOdometer = unwrap(currentOdoRes)?.odometerKm ?? null;
    const openComplaints = unwrap(complaintsRes) ?? [];

    const modules = {
      battery: this.evaluateBattery(batterySummary, hmAi),
      tires: this.evaluateTires(tireSummary),
      brakes: this.evaluateBrakes(brakeSummary),
      error_codes: this.evaluateErrorCodes(dtcSummary),
      service_compliance: this.evaluateServiceCompliance({
        vehicle,
        currentOdometer,
      }),
      complaints: this.evaluateComplaints(openComplaints),
      vehicle_alerts: this.evaluateVehicleAlerts(hmAi),
    } as const;

    const overall_state = computeOverallState(Object.values(modules));
    const blocking_reasons = this.collectBlockingReasons(
      modules,
      openComplaints,
      hmAi,
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
  ): Promise<{ blocked: boolean; reasons: string[] }> {
    try {
      const health = await this.getVehicleHealth(orgId, vehicleId);
      return { blocked: health.rental_blocked, reasons: health.blocking_reasons };
    } catch (err) {
      // Fail-open: a broken health pipeline must NOT be able to block the
      // whole bookings system. The UI still shows whatever surface it has.
      this.logger.warn(
        `Rental-health gate skipped for ${vehicleId}: ${(err as Error).message}`,
      );
      return { blocked: false, reasons: [] };
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

    const voltageNote =
      restingVoltage != null ? ` (Ruhespannung ${restingVoltage.toFixed(2)} V)` : '';
    switch (lv?.healthStatus) {
      case 'GOOD':
        state = 'good';
        reason = `Batteriezustand gut${voltageNote}`;
        break;
      case 'WATCH':
        state = 'warning';
        reason = `Batterie beobachten${voltageNote}`;
        break;
      case 'WARNING':
        state = 'warning';
        reason = `Batterie auffällig — Nachladen/Prüfen empfohlen${voltageNote}`;
        break;
      case 'CRITICAL':
        state = 'critical';
        reason = `Batterie kritisch${voltageNote}`;
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
    };
  }

  /**
   * Tires — reads {@link TireHealthService.getSummary}. Wear-state is
   * derived from `overallPercent` (remaining usability, NOT worn percent).
   * Pressure-state is read from `pressureContext.overallStatus` plus any
   * TPMS-related warning hints. The final state is the higher severity
   * of the two; TPMS `n_a` only applies when there's truly no pressure
   * data of any kind.
   */
  private evaluateTires(summary: TireHealthSummary | null): ModuleHealth {
    if (!summary) {
      return {
        state: 'unknown',
        reason: 'Keine Reifendaten verfügbar',
        last_updated_at: null,
        data_stale: true,
      };
    }

    // Wear state — prefer canonical overallStatus from tire-status.ts; fall back
    // to overallPercent buckets only when the canonical status is unavailable.
    const canonicalWear = this.mapTireStatusToHealth(summary.overallStatus);
    let wearState: HealthState;
    let wearReason: string;
    if (canonicalWear != null) {
      wearState = canonicalWear.state;
      wearReason = canonicalWear.reason;
    } else {
      const remaining = summary.overallPercent;
      if (remaining == null || !Number.isFinite(remaining)) {
        wearState = 'unknown';
        wearReason = 'Kein Reifenverschleiß-Signal';
      } else if (remaining <= 10) {
        wearState = 'critical';
        wearReason = `Restnutzbarkeit ${Math.round(remaining)} %`;
      } else if (remaining <= 30) {
        wearState = 'warning';
        wearReason = `Restnutzbarkeit ${Math.round(remaining)} %`;
      } else {
        wearState = 'good';
        wearReason = `Restnutzbarkeit ${Math.round(remaining)} %`;
      }
    }

    // Pressure state — pressureContext is always present on a summary.
    const pressure = summary.pressureContext;
    let pressureState: HealthState;
    let pressureReason: string;
    switch (pressure.overallStatus) {
      case 'OK':
        pressureState = 'good';
        pressureReason = 'Reifendruck normal';
        break;
      case 'ISSUE':
        // Distinguish "pressure low" (critical) from TPMS warning only
        // (warning). The TireHealthService surfaces both via warningHints.
        {
          const hasLowPressure = pressure.warningHints.some((h) =>
            /niedrig|low|under|alert/i.test(h),
          );
          pressureState = hasLowPressure ? 'critical' : 'warning';
          pressureReason = pressure.warningHints[0] ?? 'Druckanomalie erkannt';
        }
        break;
      case 'STALE':
        pressureState = 'unknown';
        pressureReason = 'Reifendruck-Daten veraltet';
        break;
      case 'UNKNOWN':
      default:
        // No TPMS source at all ⇒ n_a for this vehicle (not unknown).
        pressureState = pressure.source === 'NONE' ? 'n_a' : 'unknown';
        pressureReason =
          pressureState === 'n_a'
            ? 'Kein TPMS verbaut'
            : 'Kein Reifendruck-Signal verfügbar';
        break;
    }

    // Explicit TPMS-alert-from-critical-alerts escalation — TireHealth
    // already flags these; mirror their severity into pressure-state.
    const criticalTpmsAlert = summary.alerts.some(
      (a) => a.severity === 'critical' && /tpms|druck|pressure/i.test(a.type),
    );
    if (criticalTpmsAlert) {
      pressureState = 'critical';
      pressureReason =
        summary.alerts.find((a) => a.severity === 'critical')?.message ??
        pressureReason;
    }

    const state = maxSeverity(wearState, pressureState);
    const reason = state === wearState ? wearReason : pressureReason;

    return {
      state,
      reason,
      last_updated_at: toIso(summary.latestMeasurementAt),
      data_stale: isStale(summary.latestMeasurementAt),
    };
  }

  /**
   * Brakes — reads {@link BrakeHealthService.getSummary}. The service
   * already exposes `hasAlert` and `status` ("healthy" | "attention" |
   * "critical"), so we mostly trust that. Restnutzbarkeit comes from
   * `pads.healthPercent` and `discs.healthPercent` (min of both).
   */
  private evaluateBrakes(summary: BrakeHealthSummaryDto | null): ModuleHealth {
    const updatedAt = summary?.lastRecalculatedAt ?? summary?.updatedAt ?? null;

    if (!summary) {
      return {
        state: 'unknown',
        reason: 'Keine Bremsen-Baseline hinterlegt',
        last_updated_at: toIso(updatedAt),
        data_stale: isStale(updatedAt),
      };
    }

    // Single canonical truth: BrakeHealthService.overallCondition. A purely
    // ESTIMATED condition caps at WARNING; only a real safety signal (measured
    // critical pad, brake DTC, critical fluid, immediate-replacement) is
    // CRITICAL. We never re-derive a parallel state from raw health-percent.
    const condition = summary.overallCondition ?? 'UNKNOWN';
    let state: HealthState;
    switch (condition) {
      case 'CRITICAL':
        state = 'critical';
        break;
      case 'WARNING':
      case 'WATCH':
        state = 'warning';
        break;
      case 'GOOD':
        state = 'good';
        break;
      default:
        state = 'unknown';
    }

    // Build the human reason from the canonical read model.
    let reason: string;
    if (state === 'unknown') {
      reason = summary.reasons?.[0] ?? summary.message ?? 'Keine belastbare Bremsen-Datenbasis';
    } else {
      const front = summary.estimatedFrontRemainingKmMin;
      const rear = summary.estimatedRearRemainingKmMin;
      const lowest = [front, rear].filter((v): v is number => v != null);
      reason =
        summary.recommendations?.[0] ??
        (lowest.length > 0
          ? `Geschätzte Restnutzung ab ~${Math.min(...lowest).toLocaleString('de-DE')} km`
          : `Bremszustand: ${condition}`);
    }

    // Pad pre-warning sensor (hasAlert) escalates to at least warning.
    if (summary.hasAlert) {
      state = maxSeverity(state, 'warning');
    }

    return {
      state,
      reason,
      last_updated_at: toIso(updatedAt),
      data_stale: isStale(updatedAt),
    };
  }

  /**
   * Error Codes — reads {@link DtcService.getSummary}. V1 "red / yellow"
   * pragmatic mapping: any fault at CRITICAL severity is treated as a
   * red MIL and sets rental_blocked via the alerts path.
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
      };
    }

    const lastAt = summary.lastSuccessfulCheckAt ?? summary.lastCheckedAt ?? null;

    if (summary.status === 'unavailable') {
      return {
        state: 'unknown',
        reason: 'Noch keine DTC-Prüfung durchgeführt',
        last_updated_at: toIso(lastAt),
        data_stale: true,
      };
    }

    if (summary.status === 'stale') {
      return {
        state: 'unknown',
        reason: 'DTC-Status veraltet',
        last_updated_at: toIso(lastAt),
        data_stale: true,
      };
    }

    if (summary.status === 'clean') {
      return {
        state: 'good',
        reason: 'Keine aktiven Fehlercodes',
        last_updated_at: toIso(lastAt),
        data_stale: isStale(lastAt),
      };
    }

    // Active faults — pick the max severity from the preview.
    const hasCritical = summary.activeFaultPreview.some(
      (f: any) => f.severity === 'high',
    );
    const state: HealthState = hasCritical ? 'critical' : 'warning';
    const reason = hasCritical
      ? `${summary.activeFaultCount} aktive Fehlercodes — sicherheitsrelevant`
      : `${summary.activeFaultCount} aktive Fehlercodes`;

    return {
      state,
      reason,
      last_updated_at: toIso(lastAt),
      data_stale: isStale(lastAt),
    };
  }

  /**
   * Service & Compliance — mirrors the `service-info-status` endpoint
   * logic but only for the fields that drive the health state:
   *   - TÜV overdue/due-soon
   *   - BOKraft overdue/due-soon
   *   - Service overdue (based on nextServiceDueDate or km threshold)
   *
   * Spec: TÜV and BOKraft lapsed → critical + rental_blocked.
   * Inspection overdue → warning (maintenance, not compliance).
   */
  private evaluateServiceCompliance(ctx: {
    vehicle: {
      lastTuvDate: Date | null;
      nextTuvDate: Date | null;
      lastBokraftDate: Date | null;
      nextBokraftDate: Date | null;
      lastServiceDate: Date | null;
      lastServiceOdometerKm: number | null;
      nextServiceDueDate: Date | null;
      serviceIntervalManufacturerKm: number | null;
      serviceIntervalManufacturerMonths: number | null;
    };
    currentOdometer: number | null;
  }): ModuleHealth {
    const now = new Date();
    const MS_PER_DAY = 86_400_000;

    const tuvDays =
      ctx.vehicle.nextTuvDate != null
        ? Math.floor((ctx.vehicle.nextTuvDate.getTime() - now.getTime()) / MS_PER_DAY)
        : null;
    const bokraftDays =
      ctx.vehicle.nextBokraftDate != null
        ? Math.floor((ctx.vehicle.nextBokraftDate.getTime() - now.getTime()) / MS_PER_DAY)
        : null;

    // Service remaining — replicates the logic of the service-info-status
    // endpoint. We derive days + km based on last service and interval.
    const { serviceOverdue, serviceMessage } = computeServiceOverdue(
      ctx.vehicle,
      ctx.currentOdometer,
      now,
    );

    // Hard-compliance (TÜV / BOKraft lapsed) takes priority.
    if (tuvDays != null && tuvDays < 0) {
      return {
        state: 'critical',
        reason: `TÜV abgelaufen seit ${Math.abs(tuvDays)} Tag${Math.abs(tuvDays) === 1 ? '' : 'en'}`,
        last_updated_at: toIso(ctx.vehicle.lastTuvDate ?? ctx.vehicle.nextTuvDate),
        data_stale: false,
      };
    }
    if (bokraftDays != null && bokraftDays < 0) {
      return {
        state: 'critical',
        reason: `BOKraft abgelaufen seit ${Math.abs(bokraftDays)} Tag${Math.abs(bokraftDays) === 1 ? '' : 'en'}`,
        last_updated_at: toIso(
          ctx.vehicle.lastBokraftDate ?? ctx.vehicle.nextBokraftDate,
        ),
        data_stale: false,
      };
    }

    // Soft warnings next — due soon or service overdue.
    if (tuvDays != null && tuvDays <= COMPLIANCE_WARNING_DAYS) {
      return {
        state: 'warning',
        reason: `TÜV läuft in ${tuvDays} Tag${tuvDays === 1 ? '' : 'en'} ab`,
        last_updated_at: toIso(ctx.vehicle.nextTuvDate),
        data_stale: false,
      };
    }
    if (bokraftDays != null && bokraftDays <= COMPLIANCE_WARNING_DAYS) {
      return {
        state: 'warning',
        reason: `BOKraft läuft in ${bokraftDays} Tag${bokraftDays === 1 ? '' : 'en'} ab`,
        last_updated_at: toIso(ctx.vehicle.nextBokraftDate),
        data_stale: false,
      };
    }
    if (serviceOverdue) {
      return {
        state: 'warning',
        reason: serviceMessage ?? 'Inspektion überfällig',
        last_updated_at: toIso(ctx.vehicle.lastServiceDate),
        data_stale: false,
      };
    }

    // All green — but we need some data at all to even claim "good".
    const hasAnyData =
      ctx.vehicle.nextTuvDate != null ||
      ctx.vehicle.nextBokraftDate != null ||
      ctx.vehicle.lastServiceDate != null ||
      ctx.vehicle.nextServiceDueDate != null;
    if (!hasAnyData) {
      return {
        state: 'unknown',
        reason: 'Keine Termine hinterlegt',
        last_updated_at: null,
        data_stale: true,
      };
    }

    return {
      state: 'good',
      reason: 'Alle Termine gültig',
      last_updated_at: toIso(
        ctx.vehicle.lastServiceDate ?? ctx.vehicle.nextTuvDate ?? ctx.vehicle.nextBokraftDate,
      ),
      data_stale: false,
    };
  }

  /**
   * Complaints — reads the `vehicle_complaints` table for open statuses.
   * Only complaints with impact=SAFETY set rental_blocked (handled in the
   * blocking-reasons collector, not here). DRIVABILITY/ENVIRONMENT at
   * open status → critical severity. COMFORT → warning.
   *
   * The health module itself already returns critical for SAFETY so that
   * the overall state reflects the open safety complaint even before the
   * rental_blocked flag is considered.
   */
  private evaluateComplaints(
    complaints: Array<{
      id: string;
      description: string;
      urgency: string;
      status: string;
      impact: string | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ): ModuleHealth {
    if (complaints.length === 0) {
      return {
        state: 'good',
        reason: 'Keine offenen Reklamationen',
        last_updated_at: null,
        data_stale: false,
      };
    }

    const newest = complaints[0]; // ordered by createdAt desc in the query
    const newestIso = newest.updatedAt.toISOString();

    const safety = complaints.find((c) => c.impact === 'SAFETY');
    if (safety) {
      return {
        state: 'critical',
        reason: `Offene Sicherheits-Reklamation vom ${formatDate(safety.createdAt)}`,
        last_updated_at: safety.updatedAt.toISOString(),
        data_stale: false,
      };
    }

    const drivability = complaints.find(
      (c) => c.impact === 'DRIVABILITY' || c.impact === 'ENVIRONMENT',
    );
    if (drivability) {
      return {
        state: 'critical',
        reason:
          drivability.impact === 'DRIVABILITY'
            ? `Offene Reklamation zur Fahrfunktion vom ${formatDate(drivability.createdAt)}`
            : `Offene Umwelt-Reklamation vom ${formatDate(drivability.createdAt)}`,
        last_updated_at: drivability.updatedAt.toISOString(),
        data_stale: false,
      };
    }

    // All remaining opens are COMFORT or unclassified — warning only.
    return {
      state: 'warning',
      reason:
        complaints.length === 1
          ? `Offene Reklamation vom ${formatDate(newest.createdAt)}`
          : `${complaints.length} offene Reklamationen`,
      last_updated_at: newestIso,
      data_stale: false,
    };
  }

  /**
   * Vehicle Alerts (OEM) — reads {@link HmSignalUsageService.getAiHealthCareSignals}.
   * V1 covers the strictly structured HM signals only: Limp Mode, oil
   * level, brake-lining pre-warning, tire-pressure warning, battery
   * warning light.
   *
   * IMPORTANT: warnings that already feed another module (tires, brakes,
   * battery) are NOT double-counted here — the spec demands each warning
   * lands in exactly one place. We intentionally ignore `brakeLining`
   * (→ brakes), `tirePressureWarning` (→ tires), and `battery_low_warning`
   * (→ battery) in this evaluator. What remains:
   *   - Limp Mode         → critical + rental_blocked
   *   - Oil level LOW     → critical + rental_blocked
   *   - Oil level HIGH    → warning
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
      };
    }

    const lastUpdated = hmAi.lastUpdatedAt ?? null;

    if (hmAi.limpModeActive === true) {
      return {
        state: 'critical',
        reason: 'Limp Mode aktiv',
        last_updated_at: lastUpdated,
        data_stale: isStale(lastUpdated),
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

    // Nothing triggered — the OEM cluster is quiet.
    return {
      state: 'good',
      reason: 'Keine OEM-Warnleuchten aktiv',
      last_updated_at: lastUpdated,
      data_stale: isStale(lastUpdated),
    };
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
    openComplaints: Array<{ impact: string | null }>,
    hmAi: { limpModeActive: boolean | null; oilLevel: { status: string | null } | null } | null,
  ): string[] {
    const reasons: string[] = [];

    // Compliance first — lapsed TÜV / BOKraft. service_compliance already
    // sets critical + a precise reason.
    if (
      modules.service_compliance.state === 'critical' &&
      /abgelaufen/i.test(modules.service_compliance.reason)
    ) {
      reasons.push(modules.service_compliance.reason);
    }

    // Safety complaints — impact=SAFETY on any open complaint.
    const safety = openComplaints.find((c) => c.impact === 'SAFETY');
    if (safety) {
      reasons.push('Offene Sicherheits-Reklamation');
    }

    // Limp Mode always blocks.
    if (hmAi?.limpModeActive === true) {
      reasons.push('Limp Mode aktiv');
    }

    // Brakes critical blocks.
    if (modules.brakes.state === 'critical') {
      reasons.push(`Bremsen: ${modules.brakes.reason}`);
    }

    // Tires critical blocks (covers both wear and low-pressure paths).
    if (modules.tires.state === 'critical') {
      reasons.push(`Reifen: ${modules.tires.reason}`);
    }

    // Safety-relevant DTC (critical severity).
    if (modules.error_codes.state === 'critical') {
      reasons.push(`Fehlercodes: ${modules.error_codes.reason}`);
    }

    // Oil minimum blocks.
    const oilStatus = (hmAi?.oilLevel?.status ?? '').toUpperCase();
    if (oilStatus === 'LOW' || oilStatus === 'MINIMUM') {
      reasons.push('Motoröl Minimum');
    }

    return reasons;
  }

  /** Maps canonical TireStatus → Rental-Health HealthState. */
  private mapTireStatusToHealth(
    status: string | null | undefined,
  ): { state: HealthState; reason: string } | null {
    switch (status) {
      case 'CRITICAL':
        return { state: 'critical', reason: 'Reifenverschleiß kritisch' };
      case 'WARNING':
        return { state: 'warning', reason: 'Reifenverschleiß Warnung' };
      case 'WATCH':
        return { state: 'warning', reason: 'Reifen beobachten' };
      case 'GOOD':
        return { state: 'good', reason: 'Reifen in Ordnung' };
      case 'UNKNOWN':
        return { state: 'unknown', reason: 'Reifenstatus unbekannt' };
      default:
        return null;
    }
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

/**
 * Mirrors the logic in `vehicle-intelligence.controller.ts::getServiceInfoStatus`
 * for the service-overdue flag. Only the boolean + a short message is
 * needed here; the full payload stays with the canonical endpoint.
 */
function computeServiceOverdue(
  vehicle: {
    lastServiceDate: Date | null;
    lastServiceOdometerKm: number | null;
    serviceIntervalManufacturerKm: number | null;
    serviceIntervalManufacturerMonths: number | null;
    nextServiceDueDate: Date | null;
  },
  currentOdometer: number | null,
  now: Date,
): { serviceOverdue: boolean; serviceMessage: string | null } {
  const MS_PER_DAY = 86_400_000;
  const DAYS_PER_MONTH = 30.44;

  // Preferred path: explicit nextServiceDueDate (operator-entered override).
  if (vehicle.nextServiceDueDate != null) {
    const daysLeft = Math.floor(
      (vehicle.nextServiceDueDate.getTime() - now.getTime()) / MS_PER_DAY,
    );
    if (daysLeft < 0) {
      return {
        serviceOverdue: true,
        serviceMessage: `Inspektion seit ${Math.abs(daysLeft)} Tag${Math.abs(daysLeft) === 1 ? '' : 'en'} überfällig`,
      };
    }
  }

  if (vehicle.lastServiceDate == null) {
    return { serviceOverdue: false, serviceMessage: null };
  }

  const daysElapsed = Math.floor(
    (now.getTime() - vehicle.lastServiceDate.getTime()) / MS_PER_DAY,
  );

  if (
    vehicle.serviceIntervalManufacturerMonths != null &&
    vehicle.serviceIntervalManufacturerMonths > 0
  ) {
    const intervalDays = Math.round(
      vehicle.serviceIntervalManufacturerMonths * DAYS_PER_MONTH,
    );
    if (daysElapsed - intervalDays > 0) {
      return {
        serviceOverdue: true,
        serviceMessage: `Inspektion seit ${daysElapsed - intervalDays} Tag${daysElapsed - intervalDays === 1 ? '' : 'en'} überfällig`,
      };
    }
  }

  if (
    vehicle.lastServiceOdometerKm != null &&
    currentOdometer != null &&
    vehicle.serviceIntervalManufacturerKm != null &&
    vehicle.serviceIntervalManufacturerKm > 0
  ) {
    const kmSince = Math.round(currentOdometer - vehicle.lastServiceOdometerKm);
    const overKm = kmSince - vehicle.serviceIntervalManufacturerKm;
    if (overKm > 0) {
      return {
        serviceOverdue: true,
        serviceMessage: `Inspektion seit ${overKm} km überfällig`,
      };
    }
  }

  return { serviceOverdue: false, serviceMessage: null };
}
