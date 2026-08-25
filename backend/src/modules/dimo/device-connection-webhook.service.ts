import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import { ConnectivityLifecycleRuntimePolicyService } from './connectivity/connectivity-lifecycle-runtime-policy.service';
import { ConnectivityRecoveryPolicyService } from './connectivity/connectivity-recovery.policy';
import { DeviceConnectionEpisodeService } from './device-connection-episode.service';
import {
  shouldIgnorePlugImpulseAfterUnplug,
  type DeviceConnectionConnectivityAnchor,
} from './device-connection-read-model';

export const DEVICE_CONNECTION_DEDUP_WINDOW_MS = 30_000;

export type DeviceConnectionIntakeOutcome =
  | 'created'
  | 'duplicate'
  | 'reconciled'
  | 'historical_orphan'
  | 'reconciliation_disabled'
  | 'ignored_by_policy';

export type DeviceConnectionDomainResult = {
  outcome: DeviceConnectionIntakeOutcome;
  eventId?: string;
  eventType?: DimoDeviceConnectionEventType;
  policyReason?: string;
};

export type ObdPlugState = 'plugged' | 'unplugged' | 'unknown';

export interface DeviceConnectionVehicle {
  id: string;
  organizationId: string;
}

export interface IngestDeviceConnectionInput {
  vehicle: DeviceConnectionVehicle;
  tokenId: number;
  pluggedIn: boolean;
  observedAt: Date;
  rawPayload: unknown;
  inboxId?: string;
}

/** Derive current plug state from the most recent persisted connection event. */
export function inferObdPlugStateFromLastEvent(
  lastEventType: DimoDeviceConnectionEventType | null | undefined,
): ObdPlugState {
  if (!lastEventType) return 'unknown';
  if (lastEventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN) return 'plugged';
  return 'unplugged';
}

/**
 * Whether an incoming webhook represents a real state transition worth persisting.
 *
 * - First observation with plugged=true → baseline only (device was already connected).
 * - First observation with plugged=false → real unplug event.
 * - Repeated same-state webhooks → ignored (DIMO may fire every ~26s while plugged).
 */
export function shouldPersistObdPlugStateChange(
  incomingPluggedIn: boolean,
  lastEventType: DimoDeviceConnectionEventType | null | undefined,
): { persist: boolean; reason?: string } {
  const current = inferObdPlugStateFromLastEvent(lastEventType);
  const incoming = incomingPluggedIn ? 'plugged' : 'unplugged';

  if (current === 'unknown') {
    if (incomingPluggedIn) {
      return { persist: false, reason: 'baseline_already_plugged' };
    }
    return { persist: true };
  }

  if (current === incoming) {
    return { persist: false, reason: 'no_state_change' };
  }

  return { persist: true };
}

@Injectable()
export class DeviceConnectionWebhookService {
  private readonly logger = new Logger(DeviceConnectionWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly episodeService: DeviceConnectionEpisodeService,
    private readonly lifecyclePolicy: ConnectivityLifecycleRuntimePolicyService,
    @Optional() private readonly recoveryPolicy?: ConnectivityRecoveryPolicyService,
  ) {}

  /** True when the webhook signal/metric is the OBD plug state. */
  static isObdPluggedSignal(signalName: unknown, metricName?: unknown): boolean {
    const candidates = [signalName, metricName];
    for (const raw of candidates) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const normalized = raw.trim().toLowerCase();
      const base = normalized.includes('.') ? normalized.split('.').pop()! : normalized;
      if (base === 'obdispluggedin') return true;
    }
    return false;
  }

  /** Parse a boolean plug state from a webhook value field. */
  static parsePluggedValue(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1') return true;
      if (v === 'false' || v === '0') return false;
    }
    return null;
  }

  static dedupBucket(observedAt: Date): bigint {
    return BigInt(Math.floor(observedAt.getTime() / DEVICE_CONNECTION_DEDUP_WINDOW_MS));
  }

  static eventTypeForPlugState(pluggedIn: boolean): DimoDeviceConnectionEventType {
    return pluggedIn
      ? DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN
      : DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED;
  }

  static pluggedInFromEventType(eventType: DimoDeviceConnectionEventType): boolean {
    return eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN;
  }

  /**
   * Process a validated inbox webhook — vehicle mapping already resolved.
   * Policy ignores return `ignored_by_policy`; technical failures throw.
   */
  async processValidatedWebhookEvent(
    input: IngestDeviceConnectionInput,
  ): Promise<DeviceConnectionDomainResult> {
    const eventType = DeviceConnectionWebhookService.eventTypeForPlugState(input.pluggedIn);
    const gate = await this.evaluateStateChangeGate(
      input.vehicle.id,
      input.pluggedIn,
      input.observedAt,
    );
    if (!gate.persist) {
      this.logger.debug(
        `Device connection ignored by policy for vehicle ${input.vehicle.id}: ${gate.reason} pluggedIn=${input.pluggedIn}`,
      );
      return { outcome: 'ignored_by_policy', eventType, policyReason: gate.reason };
    }

    return this.persistDeviceConnectionEvent({
      ...input,
      eventType,
    });
  }

  /**
   * @deprecated Prefer DeviceConnectionWebhookInboxService.intakeDeviceConnectionWebhook.
   */
  async ingestObdPlugStateChange(
    input: IngestDeviceConnectionInput,
  ): Promise<DeviceConnectionDomainResult> {
    return this.processValidatedWebhookEvent(input);
  }

  /** Persist a device connection event with an explicit event type (console-specific webhooks). */
  async ingestExplicitDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<DeviceConnectionDomainResult> {
    const pluggedIn = DeviceConnectionWebhookService.pluggedInFromEventType(input.eventType);
    return this.processValidatedWebhookEvent({
      vehicle: input.vehicle,
      tokenId: input.tokenId,
      pluggedIn,
      observedAt: input.observedAt,
      rawPayload: input.rawPayload,
      inboxId: input.inboxId,
    });
  }

  private async evaluateStateChangeGate(
    vehicleId: string,
    incomingPluggedIn: boolean,
    incomingObservedAt: Date,
  ): Promise<{ persist: boolean; reason?: string }> {
    const lastEvent = await this.prisma.dimoDeviceConnectionEvent.findFirst({
      where: { vehicleId, provider: 'DIMO' },
      orderBy: { observedAt: 'desc' },
      select: { eventType: true, observedAt: true },
    });
    const base = shouldPersistObdPlugStateChange(incomingPluggedIn, lastEvent?.eventType);
    if (!base.persist) return base;

    if (incomingPluggedIn) {
      const anchor = await this.loadConnectivityAnchor(vehicleId);
      const impulse = shouldIgnorePlugImpulseAfterUnplug(
        incomingPluggedIn,
        lastEvent,
        incomingObservedAt,
        anchor,
      );
      if (impulse.ignore) {
        return { persist: false, reason: impulse.reason };
      }
    }

    return base;
  }

  private async loadConnectivityAnchor(
    vehicleId: string,
  ): Promise<DeviceConnectionConnectivityAnchor | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        dimoVehicle: { select: { connectionStatus: true } },
        latestState: { select: { rawPayloadJson: true } },
      },
    });
    if (!vehicle) return null;

    const raw = vehicle.latestState?.rawPayloadJson as Record<string, unknown> | null;
    const conn = extractConnectivitySnapshot(raw ?? undefined);
    return {
      dimoConnectionStatus: vehicle.dimoVehicle?.connectionStatus ?? null,
      obdIsPluggedIn: conn.obdIsPluggedIn,
    };
  }

  /**
   * Completes episode lifecycle for a persisted event that still lacks processedAt.
   * Safe to call on retry after partial failure (event row exists, lifecycle incomplete).
   */
  async reconcilePersistedEventLifecycle(eventId: string): Promise<DeviceConnectionDomainResult> {
    const row = await this.prisma.dimoDeviceConnectionEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tokenId: true,
        eventType: true,
        observedAt: true,
        receivedAt: true,
        processedAt: true,
      },
    });
    if (!row) {
      throw new Error(`Device connection event ${eventId} not found`);
    }
    if (row.processedAt) {
      return { outcome: 'duplicate', eventId: row.id, eventType: row.eventType };
    }

    const orphanEligibility = this.lifecyclePolicy.evaluateOrphanReconciliationEligibility({
      receivedAt: row.receivedAt,
      processedAt: row.processedAt,
    });
    const blocked = this.mapOrphanEligibilityToOutcome(
      orphanEligibility,
      row.id,
      row.eventType,
    );
    if (blocked) return blocked;

    return this.completePersistedEventLifecycle({
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      tokenId: row.tokenId,
      eventId: row.id,
      eventType: row.eventType,
      observedAt: row.observedAt,
      receivedAt: row.receivedAt,
      inboxId: undefined,
      logContext: 'reconcile',
    });
  }

  private async persistDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<DeviceConnectionDomainResult> {
    const { vehicle, tokenId, observedAt, rawPayload, eventType, inboxId } = input;
    const receivedAt = new Date();
    const dedupBucket = DeviceConnectionWebhookService.dedupBucket(observedAt);

    const row = await this.prisma.dimoDeviceConnectionEvent.upsert({
      where: {
        provider_vehicleId_eventType_dedupBucket: {
          provider: 'DIMO',
          vehicleId: vehicle.id,
          eventType,
          dedupBucket,
        },
      },
      create: {
        organizationId: vehicle.organizationId,
        vehicleId: vehicle.id,
        tokenId,
        provider: 'DIMO',
        eventType,
        observedAt,
        receivedAt,
        dedupBucket,
        rawPayloadJson: rawPayload as object,
      },
      update: {},
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        processedAt: true,
        receivedAt: true,
      },
    });

    const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
    // Newly persisted events always run normal lifecycle processing below.
    // Runtime cutover policy gates only reconciliation of pre-existing incomplete events.
    if (!isNew && row.processedAt) {
      this.logger.debug(
        `Device connection dedupe hit for event ${row.id} inboxId=${inboxId ?? 'n/a'} — lifecycle already complete`,
      );
      return { outcome: 'duplicate', eventId: row.id, eventType };
    }

    if (!isNew && !row.processedAt) {
      const orphanEligibility = this.lifecyclePolicy.evaluateOrphanReconciliationEligibility({
        receivedAt: row.receivedAt ?? receivedAt,
        processedAt: row.processedAt,
      });
      const blocked = this.mapOrphanEligibilityToOutcome(
        orphanEligibility,
        row.id,
        eventType,
        inboxId,
      );
      if (blocked) return blocked;

      this.logger.warn(
        `Reconciling partially processed device connection event ${row.id} inboxId=${inboxId ?? 'n/a'} — episode lifecycle incomplete`,
      );
    } else if (isNew) {
      this.logger.log(
        `Device connection event ${eventType} for vehicle ${vehicle.id} at ${observedAt.toISOString()} inboxId=${inboxId ?? 'n/a'}`,
      );
    }

    return this.completePersistedEventLifecycle({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      tokenId,
      eventId: row.id,
      eventType,
      observedAt,
      receivedAt: row.receivedAt ?? receivedAt,
      inboxId,
      logContext: isNew ? 'created' : 'reconciled',
    });
  }

  private async completePersistedEventLifecycle(input: {
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    eventId: string;
    eventType: DimoDeviceConnectionEventType;
    observedAt: Date;
    receivedAt: Date;
    inboxId?: string;
    logContext: 'created' | 'reconciled' | 'reconcile';
  }): Promise<DeviceConnectionDomainResult> {
    const processedAt = new Date();
    await this.syncEpisodeAfterPersistedEvent({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
      eventId: input.eventId,
      eventType: input.eventType,
      observedAt: input.observedAt,
      receivedAt: input.receivedAt,
    });

    await this.prisma.dimoDeviceConnectionEvent.update({
      where: { id: input.eventId },
      data: { processedAt },
    });

    this.logger.log({
      msg: 'device_connection.lifecycle_complete',
      eventId: input.eventId,
      inboxId: input.inboxId ?? null,
      outcome: input.logContext,
      eventType: input.eventType,
    });

    if (input.logContext === 'reconciled' || input.logContext === 'reconcile') {
      return { outcome: 'reconciled', eventId: input.eventId, eventType: input.eventType };
    }
    return { outcome: 'created', eventId: input.eventId, eventType: input.eventType };
  }

  private mapOrphanEligibilityToOutcome(
    eligibility: ReturnType<ConnectivityLifecycleRuntimePolicyService['evaluateOrphanReconciliationEligibility']>,
    eventId: string,
    eventType: DimoDeviceConnectionEventType,
    inboxId?: string,
  ): DeviceConnectionDomainResult | null {
    if (eligibility === 'eligible' || eligibility === 'already_complete') {
      return null;
    }

    const outcome =
      eligibility === 'historical_orphan' ? 'historical_orphan' : 'reconciliation_disabled';

    this.logger.warn({
      msg: 'device_connection.orphan_reconciliation_blocked',
      eventId,
      inboxId: inboxId ?? null,
      eligibility,
      eventType,
    });

    return {
      outcome,
      eventId,
      eventType,
      policyReason: eligibility,
    };
  }

  private async syncEpisodeAfterPersistedEvent(input: {
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    eventId: string;
    eventType: DimoDeviceConnectionEventType;
    observedAt: Date;
    receivedAt: Date;
  }): Promise<void> {
    if (this.recoveryPolicy && !this.recoveryPolicy.isEpisodeRecoveryEnabled()) {
      return;
    }

    if (input.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_UNPLUGGED) {
      await this.episodeService.openFromUnplugEvent({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventId: input.eventId,
        observedAt: input.observedAt,
        receivedAt: input.receivedAt,
        tokenId: input.tokenId,
      });
      return;
    }

    if (input.eventType === DimoDeviceConnectionEventType.OBD_DEVICE_PLUGGED_IN) {
      await this.episodeService.resolveFromExplicitPlugEvent({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        eventId: input.eventId,
        observedAt: input.observedAt,
        receivedAt: input.receivedAt,
        tokenId: input.tokenId,
      });
    }
  }
}
