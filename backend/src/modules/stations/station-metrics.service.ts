import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  normalizeStationBookingRuleOutcome,
  normalizeStationCapacityStatus,
  normalizeStationHttpRoute,
  normalizeStationMetricsOutcome,
  type StationAssignmentKind,
  type StationBookingRuleSurface,
  type StationTransferCommand,
} from './station-metrics.labels';

/**
 * Stations V2 Prometheus metrics — low-cardinality labels only.
 * Metric names use synqdrive_station_* / synqdrive_stations_* prefix.
 */
@Injectable()
export class StationMetricsService {
  readonly stationsTotal: Gauge<string>;
  readonly scopeDeniedTotal: Counter<string>;
  readonly summaryRequestsTotal: Counter<string>;
  readonly summaryPartialTotal: Counter<string>;
  readonly assignmentTotal: Counter<string>;
  readonly assignmentConflictTotal: Counter<string>;
  readonly currentStationCorrectionTotal: Counter<string>;
  readonly transferTotal: Counter<string>;
  readonly bookingRuleTotal: Counter<string>;
  readonly bookingRuleBlockedTotal: Counter<string>;
  readonly bookingOverrideTotal: Counter<string>;
  readonly capacityStatusTotal: Counter<string>;
  readonly archiveTotal: Counter<string>;
  readonly restoreTotal: Counter<string>;
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.stationsTotal = this.tripMetrics.stationsTotal;

    this.scopeDeniedTotal = new Counter({
      name: 'synqdrive_station_scope_denied_total',
      help: 'Stations scope or permission denials',
      labelNames: ['gate', 'reason'],
      registers: [register],
    });

    this.summaryRequestsTotal = new Counter({
      name: 'synqdrive_station_summary_requests_total',
      help: 'Station summary read-model requests',
      labelNames: ['surface'],
      registers: [register],
    });

    this.summaryPartialTotal = new Counter({
      name: 'synqdrive_station_summary_partial_total',
      help: 'Station summary responses with partial or incomplete KPI data',
      labelNames: ['surface', 'reason'],
      registers: [register],
    });

    this.assignmentTotal = new Counter({
      name: 'synqdrive_station_assignment_total',
      help: 'Vehicle-to-station assignment command outcomes',
      labelNames: ['kind', 'outcome'],
      registers: [register],
    });

    this.assignmentConflictTotal = new Counter({
      name: 'synqdrive_station_assignment_conflict_total',
      help: 'Optimistic concurrency conflicts on station assignments',
      labelNames: ['kind', 'reason'],
      registers: [register],
    });

    this.currentStationCorrectionTotal = new Counter({
      name: 'synqdrive_current_station_correction_total',
      help: 'Manual current-station correction command outcomes',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.transferTotal = new Counter({
      name: 'synqdrive_station_transfer_total',
      help: 'Vehicle station transfer command outcomes',
      labelNames: ['command', 'outcome'],
      registers: [register],
    });

    this.bookingRuleTotal = new Counter({
      name: 'synqdrive_station_booking_rule_total',
      help: 'Station booking rule evaluations by surface and outcome',
      labelNames: ['surface', 'outcome'],
      registers: [register],
    });

    this.bookingRuleBlockedTotal = new Counter({
      name: 'synqdrive_station_booking_rule_blocked_total',
      help: 'Station booking rule evaluations ending in BLOCKED',
      labelNames: ['surface', 'reason'],
      registers: [register],
    });

    this.bookingOverrideTotal = new Counter({
      name: 'synqdrive_station_booking_override_total',
      help: 'Manual station booking rule overrides applied',
      labelNames: ['reference_type'],
      registers: [register],
    });

    this.capacityStatusTotal = new Counter({
      name: 'synqdrive_station_capacity_status_total',
      help: 'Observed station capacity status values from summary KPI assembly',
      labelNames: ['status'],
      registers: [register],
    });

    this.archiveTotal = new Counter({
      name: 'synqdrive_station_archive_total',
      help: 'Station archive command outcomes',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.restoreTotal = new Counter({
      name: 'synqdrive_station_restore_total',
      help: 'Station restore command outcomes',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.httpRequestsTotal = new Counter({
      name: 'synqdrive_station_http_requests_total',
      help: 'Stations HTTP requests by route template, method, and status class',
      labelNames: ['route', 'method', 'status_class'],
      registers: [register],
    });

    this.httpRequestDuration = new Histogram({
      name: 'synqdrive_station_http_request_duration_seconds',
      help: 'Stations HTTP request duration',
      labelNames: ['route', 'method', 'status_class'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [register],
    });
  }

  recordScopeDenied(input: { gate: 'scope' | 'permission'; reason: string }): void {
    this.scopeDeniedTotal.inc({
      gate: input.gate,
      reason: input.reason,
    });
  }

  recordSummaryRequest(surface: 'station' | 'organization'): void {
    this.summaryRequestsTotal.inc({ surface });
  }

  recordSummaryPartial(input: {
    surface: 'station' | 'organization';
    reason: 'incomplete_kpis' | 'aggregation_cap' | 'page_size_capped';
  }): void {
    this.summaryPartialTotal.inc({
      surface: input.surface,
      reason: input.reason,
    });
  }

  recordAssignment(input: { kind: StationAssignmentKind; outcome: string }): void {
    this.assignmentTotal.inc({
      kind: input.kind,
      outcome: normalizeStationMetricsOutcome(input.outcome),
    });
  }

  recordAssignmentConflict(input: { kind: StationAssignmentKind; reason: string }): void {
    this.assignmentConflictTotal.inc({
      kind: input.kind,
      reason: input.reason,
    });
  }

  recordCurrentStationCorrection(outcome: string): void {
    this.currentStationCorrectionTotal.inc({
      outcome: normalizeStationMetricsOutcome(outcome),
    });
  }

  recordTransfer(input: { command: StationTransferCommand; outcome: string }): void {
    this.transferTotal.inc({
      command: input.command,
      outcome: normalizeStationMetricsOutcome(input.outcome),
    });
  }

  recordBookingRule(input: {
    surface: StationBookingRuleSurface;
    outcome: string;
    blockedReason?: string | null;
  }): void {
    const normalized = normalizeStationBookingRuleOutcome(input.outcome);
    this.bookingRuleTotal.inc({
      surface: input.surface,
      outcome: normalized,
    });
    if (normalized === 'blocked') {
      this.bookingRuleBlockedTotal.inc({
        surface: input.surface,
        reason: input.blockedReason?.trim() || 'blocked',
      });
    }
  }

  recordBookingOverride(referenceType: string): void {
    this.bookingOverrideTotal.inc({
      reference_type: referenceType.toLowerCase(),
    });
  }

  recordCapacityStatus(status: string | null | undefined): void {
    this.capacityStatusTotal.inc({
      status: normalizeStationCapacityStatus(status),
    });
  }

  recordArchive(outcome: string): void {
    this.archiveTotal.inc({
      outcome: normalizeStationMetricsOutcome(outcome),
    });
  }

  recordRestore(outcome: string): void {
    this.restoreTotal.inc({
      outcome: normalizeStationMetricsOutcome(outcome),
    });
  }

  recordHttp(input: {
    route: string | undefined;
    method: string;
    statusCode: number;
    durationSeconds: number;
  }): void {
    const route = normalizeStationHttpRoute(input.route);
    const statusClass = `${Math.floor(input.statusCode / 100)}xx`;
    const labels = {
      route,
      method: input.method.toUpperCase(),
      status_class: statusClass,
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDuration.observe(labels, input.durationSeconds);
  }
}
