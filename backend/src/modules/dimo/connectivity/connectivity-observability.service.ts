import { Injectable, Logger } from '@nestjs/common';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordConnectivityAlert,
  recordConnectivityBindingChanged,
  recordConnectivityDeviceState,
  recordConnectivityEpisodeFalseOpen,
  recordConnectivityEpisodeOpened,
  recordConnectivityEpisodeResolved,
  recordConnectivityProviderLinkState,
  recordConnectivityProviderReachableObservationRecovered,
  recordConnectivityProviderReachableObservationStale,
  recordConnectivityReconciliationConflict,
  recordConnectivityRecoverySnapshot,
  recordConnectivityRecoveryTelemetry,
  recordConnectivityRuntimeState,
  recordConnectivityStateConflict,
  recordConnectivityTelemetryState,
  recordConnectivityWebhookDeadLetter,
  recordConnectivityWebhookProcessingFailed,
  recordConnectivityWebhookReceived,
  setConnectivityCoverageRatio,
} from './connectivity-prometheus.metrics';

export type ConnectivityLogEvent =
  | 'webhook_received'
  | 'webhook_processing'
  | 'episode_opened'
  | 'episode_resolved'
  | 'snapshot_recovery'
  | 'telemetry_recovery'
  | 'binding_changed'
  | 'runtime_state_calculated'
  | 'diagnostic_state_transition'
  | 'state_conflict'
  | 'alert_created'
  | 'alert_resolved'
  | 'provider_authorization'
  | 'coverage_calculation'
  | 'reconciliation';

export interface ConnectivityObservabilityContext {
  provider?: string;
  eventType?: string;
  outcome?: string;
  method?: string;
  reason?: string;
  classification?: string;
  overallState?: string;
  telemetryState?: string;
  providerLinkState?: string;
  physicalDeviceState?: string;
  coverageState?: string;
  coverageRatio?: number;
  alertType?: string;
  surface?: string;
  operation?: string;
  /** Connectivity diagnostic dimension state (provider reachability vs. observation). */
  diagnosticState?: string;
  /** Previous diagnostic state — set only on transitions. */
  previousDiagnosticState?: string;
  /** Coarse observation-age bucket. Never a raw per-vehicle age. */
  observationAgeBucket?: string;
}

/**
 * Structured connectivity observability — no PII (no vehicleId, VIN, token, episode id).
 * Low-cardinality labels only for Prometheus.
 */
@Injectable()
export class ConnectivityObservabilityService {
  private readonly logger = new Logger(ConnectivityObservabilityService.name);

  constructor(private readonly metrics: TripMetricsService) {}

  log(event: ConnectivityLogEvent, ctx: ConnectivityObservabilityContext = {}): void {
    this.logger.log({
      msg: `connectivity.${event}`,
      ...ctx,
    });
    this.recordMetrics(event, ctx);
  }

  logWarn(event: ConnectivityLogEvent, ctx: ConnectivityObservabilityContext = {}): void {
    this.logger.warn({
      msg: `connectivity.${event}`,
      ...ctx,
    });
    this.recordMetrics(event, ctx);
  }

  private recordMetrics(event: ConnectivityLogEvent, ctx: ConnectivityObservabilityContext): void {
    const provider = ctx.provider ?? 'unknown';
    switch (event) {
      case 'webhook_received':
        recordConnectivityWebhookReceived(this.metrics, {
          provider,
          event_type: ctx.eventType ?? 'unknown',
        });
        break;
      case 'webhook_processing':
        if (ctx.outcome === 'failed') {
          recordConnectivityWebhookProcessingFailed(this.metrics, {
            provider,
            reason: ctx.reason ?? 'unknown',
          });
        } else if (ctx.outcome === 'dead_letter') {
          recordConnectivityWebhookDeadLetter(this.metrics, {
            provider,
            reason: ctx.reason ?? 'unknown',
          });
        } else {
          recordConnectivityWebhookReceived(this.metrics, {
            provider,
            event_type: ctx.eventType ?? 'processed',
          });
        }
        break;
      case 'episode_opened':
        recordConnectivityEpisodeOpened(this.metrics, {
          provider,
          reason: ctx.reason ?? 'unplug',
        });
        break;
      case 'episode_resolved':
        recordConnectivityEpisodeResolved(this.metrics, {
          provider,
          method: ctx.method ?? 'unknown',
        });
        break;
      case 'snapshot_recovery':
        recordConnectivityRecoverySnapshot(this.metrics, {
          outcome: ctx.outcome ?? 'unknown',
        });
        break;
      case 'telemetry_recovery':
        recordConnectivityRecoveryTelemetry(this.metrics, {
          outcome: ctx.outcome ?? 'unknown',
        });
        break;
      case 'binding_changed':
        recordConnectivityBindingChanged(this.metrics, {
          provider,
          outcome: ctx.outcome ?? 'changed',
        });
        break;
      case 'runtime_state_calculated':
        if (ctx.overallState) {
          recordConnectivityRuntimeState(this.metrics, { overall_state: ctx.overallState });
        }
        if (ctx.telemetryState) {
          recordConnectivityTelemetryState(this.metrics, {
            telemetry_state: ctx.telemetryState,
          });
        }
        if (ctx.providerLinkState) {
          recordConnectivityProviderLinkState(this.metrics, {
            provider_link_state: ctx.providerLinkState,
          });
        }
        if (ctx.physicalDeviceState) {
          recordConnectivityDeviceState(this.metrics, {
            physical_device_state: ctx.physicalDeviceState,
          });
        }
        break;
      case 'diagnostic_state_transition':
        if (ctx.diagnosticState === 'PROVIDER_REACHABLE_DATA_STALE') {
          recordConnectivityProviderReachableObservationStale(this.metrics, {
            provider,
            telemetry_state: ctx.telemetryState ?? 'unknown',
          });
        } else if (
          ctx.previousDiagnosticState === 'PROVIDER_REACHABLE_DATA_STALE' &&
          ctx.diagnosticState === 'PROVIDER_REACHABLE_DATA_FRESH'
        ) {
          // Recovery means the observation itself became fresh again. Leaving
          // the stale state for PROVIDER_UNREACHABLE, AUTH_OR_BINDING_ERROR or
          // UNKNOWN is a change of diagnostic precedence, not the vehicle
          // resuming telemetry — those must never inflate this counter.
          recordConnectivityProviderReachableObservationRecovered(this.metrics, {
            provider,
            telemetry_state: ctx.telemetryState ?? 'unknown',
          });
        }
        break;
      case 'state_conflict':
        recordConnectivityStateConflict(this.metrics, {
          surface: ctx.surface ?? 'runtime',
          reason: ctx.reason ?? 'unknown',
        });
        break;
      case 'alert_created':
        recordConnectivityAlert(this.metrics, {
          alert_type: ctx.alertType ?? 'unknown',
          action: 'created',
        });
        break;
      case 'alert_resolved':
        recordConnectivityAlert(this.metrics, {
          alert_type: ctx.alertType ?? 'unknown',
          action: 'resolved',
        });
        break;
      case 'coverage_calculation':
        if (ctx.coverageState && ctx.coverageRatio != null) {
          setConnectivityCoverageRatio(
            this.metrics,
            { coverage_state: ctx.coverageState },
            ctx.coverageRatio,
          );
        }
        break;
      case 'reconciliation':
        if (ctx.classification) {
          recordConnectivityReconciliationConflict(this.metrics, {
            classification: ctx.classification,
          });
        }
        if (ctx.outcome === 'false_open_detected') {
          recordConnectivityEpisodeFalseOpen(this.metrics, {
            classification: ctx.classification ?? 'unknown',
          });
        }
        break;
      default:
        break;
    }
  }
}
