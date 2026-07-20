import { Injectable, Logger, Optional } from '@nestjs/common';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { extractConnectivitySnapshot } from '@shared/utils/connectivity-signals';
import { ConnectivityRecoveryPolicyService } from './connectivity/connectivity-recovery.policy';
import { DeviceConnectionEpisodeService } from './device-connection-episode.service';
import {
  shouldIgnorePlugImpulseAfterUnplug,
  type DeviceConnectionConnectivityAnchor,
} from './device-connection-read-model';

export const DEVICE_CONNECTION_DEDUP_WINDOW_MS = 30_000;

export type DeviceConnectionIntakeOutcome = 'created' | 'duplicate' | 'ignored_by_policy';

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

  private async persistDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<DeviceConnectionDomainResult> {
    const { vehicle, tokenId, observedAt, rawPayload, eventType } = input;
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
      select: { id: true, createdAt: true, updatedAt: true },
    });

    const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
    if (!isNew) {
      return { outcome: 'duplicate', eventId: row.id, eventType };
    }

    this.logger.log(
      `Device connection event ${eventType} for vehicle ${vehicle.id} at ${observedAt.toISOString()}`,
    );

    const processedAt = new Date();
    await this.syncEpisodeAfterPersistedEvent({
      organizationId: vehicle.organizationId,
      vehicleId: vehicle.id,
      tokenId,
      eventId: row.id,
      eventType,
      observedAt,
      receivedAt,
    });

    await this.prisma.dimoDeviceConnectionEvent.update({
      where: { id: row.id },
      data: { processedAt },
    });

    return { outcome: 'created', eventId: row.id, eventType };
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
