/**
 * SynqDrive — DIMO Device Connection Webhook Intake
 *
 * Handles OBD plug/unplug state changes delivered via DIMO Vehicle Triggers
 * (signal: obdIsPluggedIn). These are connectivity/tamper evidence events —
 * NOT misuse cases and NOT engine-context anchors.
 *
 * Idempotent: repeated firings within the dedup window collapse to one row.
 */
import { Injectable, Logger } from '@nestjs/common';
import { DimoDeviceConnectionEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export const DEVICE_CONNECTION_DEDUP_WINDOW_MS = 30_000;

export type DeviceConnectionIntakeOutcome =
  | 'created'
  | 'duplicate'
  | 'ignored';

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
}

@Injectable()
export class DeviceConnectionWebhookService {
  private readonly logger = new Logger(DeviceConnectionWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Persist an OBD plug/unplug webhook event. Best-effort snapshot update on
   * VehicleLatestState; failures never lose the event row.
   */
  async ingestObdPlugStateChange(
    input: IngestDeviceConnectionInput,
  ): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string; eventType?: DimoDeviceConnectionEventType }> {
    const eventType = DeviceConnectionWebhookService.eventTypeForPlugState(input.pluggedIn);
    return this.persistDeviceConnectionEvent({
      ...input,
      eventType,
    });
  }

  /** Persist a device connection event with an explicit event type (console-specific webhooks). */
  async ingestExplicitDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string; eventType?: DimoDeviceConnectionEventType }> {
    return this.persistDeviceConnectionEvent(input);
  }

  private async persistDeviceConnectionEvent(
    input: Omit<IngestDeviceConnectionInput, 'pluggedIn'> & {
      eventType: DimoDeviceConnectionEventType;
    },
  ): Promise<{ outcome: DeviceConnectionIntakeOutcome; eventId?: string; eventType?: DimoDeviceConnectionEventType }> {
    const { vehicle, tokenId, observedAt, rawPayload, eventType } = input;
    const dedupBucket = DeviceConnectionWebhookService.dedupBucket(observedAt);

    try {
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
      return { outcome: 'created', eventId: row.id, eventType };
    } catch (err: unknown) {
      this.logger.warn(
        `Device connection intake failed for vehicle ${vehicle.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { outcome: 'ignored' };
    }
  }
}
