import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  HmStreamingReadinessDto,
  HmMqttConsumerStatusDto,
  HmPackageType,
  HmClearanceStatus,
  HmStreamingState,
  HmMqttConnectionState,
} from './dto/high-mobility.dto';

/**
 * Phase 2: HighMobilityStreamConfigService
 *
 * Manages MQTT V2 streaming configuration state and readiness diagnostics.
 * Never exposes certificate contents or secrets to the frontend.
 */
@Injectable()
export class HighMobilityStreamConfigService {
  private readonly logger = new Logger(HighMobilityStreamConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private get mqttCfg() {
    return (this.configService.get('highMobility') as any).mqtt as {
      enabled: boolean;
      host: string;
      port: number;
      appId: string;
      topicPrefix: string;
      caCertPath: string;
      clientCertPath: string;
      clientKeyPath: string;
      consumerGroup: string;
    };
  }

  private get hmEnv(): string {
    return (this.configService.get('highMobility') as any).env ?? 'sandbox';
  }

  /** Check if MQTT cert files exist (server-side only, never returned raw) */
  isCertConfigured(): boolean {
    const { caCertPath, clientCertPath, clientKeyPath } = this.mqttCfg;
    if (!caCertPath || !clientCertPath || !clientKeyPath) return false;
    try {
      return fs.existsSync(caCertPath) && fs.existsSync(clientCertPath) && fs.existsSync(clientKeyPath);
    } catch {
      return false;
    }
  }

  isMqttEnabled(): boolean {
    return this.mqttCfg.enabled;
  }

  isMqttReadyToConnect(): boolean {
    return this.isMqttEnabled() && !!this.mqttCfg.appId && this.isCertConfigured();
  }

  /** Get readiness diagnostics for a specific HM vehicle's streaming setup */
  async getStreamingReadiness(hmVehicleId: string): Promise<HmStreamingReadinessDto> {
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hmRecord) {
      throw new Error(`HM vehicle ${hmVehicleId} not found`);
    }

    const mqttEnabled = this.isMqttEnabled();
    const mqttConfigured = this.isCertConfigured() && !!this.mqttCfg.appId;

    const checks: { key: string; label: string; ok: boolean; note?: string }[] = [
      {
        key: 'clearance_approved',
        label: 'Clearance Approved',
        ok: hmRecord.clearanceStatus === 'APPROVED',
        note: hmRecord.clearanceStatus !== 'APPROVED' ? `Current: ${hmRecord.clearanceStatus}` : undefined,
      },
      {
        key: 'package_full_telemetry',
        label: 'Full Telemetry Package',
        ok: hmRecord.packageType === 'FULL_TELEMETRY',
        note: hmRecord.packageType !== 'FULL_TELEMETRY' ? `Package is ${hmRecord.packageType}` : undefined,
      },
      {
        key: 'mqtt_enabled',
        label: 'MQTT Streaming Enabled',
        ok: mqttEnabled,
        note: !mqttEnabled ? 'Set HM_MQTT_ENABLED=true to enable' : undefined,
      },
      {
        key: 'mqtt_certs',
        label: 'MQTT Certificates Configured',
        ok: mqttConfigured,
        note: !mqttConfigured ? 'Configure HM_MQTT_CA_CERT_PATH, CLIENT_CERT_PATH, CLIENT_KEY_PATH, and APP_ID' : undefined,
      },
      {
        key: 'hm_only_or_dimo_plus',
        label: 'Source Mode Valid',
        ok: ['HM_ONLY', 'DIMO_PLUS_HM'].includes(hmRecord.sourceMode),
      },
    ];

    const ready = checks.every(c => c.ok);

    return {
      hmVehicleId,
      vin: hmRecord.vin,
      packageType: hmRecord.packageType as HmPackageType,
      sourceMode: hmRecord.sourceMode as any,
      clearanceStatus: hmRecord.clearanceStatus as HmClearanceStatus,
      streamingState: (hmRecord as any).streamingState as HmStreamingState ?? 'NOT_CONFIGURED',
      mqttEnabled,
      mqttConfigured,
      ready,
      checks,
    };
  }

  /** Upsert consumer state in DB (used by MQTT consumer service) */
  async upsertConsumerState(update: {
    connectionState: HmMqttConnectionState;
    lastConnectedAt?: Date;
    lastMessageAt?: Date;
    lastErrorAt?: Date;
    lastErrorMessage?: string;
  }): Promise<void> {
    const { appId, consumerGroup } = this.mqttCfg;
    const env = this.hmEnv;

    try {
      await this.prisma.highMobilityStreamConsumerState.upsert({
        where: { uq_hm_consumer_state: { environment: env, applicationId: appId, consumerGroup } },
        create: {
          environment: env,
          applicationId: appId,
          consumerGroup,
          connectionState: update.connectionState as any,
          lastConnectedAt: update.lastConnectedAt,
          lastMessageAt: update.lastMessageAt,
          lastErrorAt: update.lastErrorAt,
          lastErrorMessage: update.lastErrorMessage,
        },
        update: {
          connectionState: update.connectionState as any,
          ...(update.lastConnectedAt ? { lastConnectedAt: update.lastConnectedAt } : {}),
          ...(update.lastMessageAt ? { lastMessageAt: update.lastMessageAt } : {}),
          ...(update.lastErrorAt ? { lastErrorAt: update.lastErrorAt } : {}),
          ...(update.lastErrorMessage !== undefined ? { lastErrorMessage: update.lastErrorMessage } : {}),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to upsert consumer state: ${err?.message}`);
    }
  }

  /** Get consumer connection status for admin display */
  async getConsumerStatus(): Promise<HmMqttConsumerStatusDto> {
    const { appId, consumerGroup } = this.mqttCfg;
    const env = this.hmEnv;

    const record = await this.prisma.highMobilityStreamConsumerState.findUnique({
      where: { uq_hm_consumer_state: { environment: env, applicationId: appId, consumerGroup } },
    }).catch(() => null);

    return {
      environment: env,
      applicationId: appId,
      consumerGroup,
      connectionState: (record?.connectionState ?? 'DISCONNECTED') as HmMqttConnectionState,
      lastConnectedAt: record?.lastConnectedAt?.toISOString() ?? null,
      lastMessageAt: record?.lastMessageAt?.toISOString() ?? null,
      lastErrorAt: record?.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: record?.lastErrorMessage ?? null,
      mqttEnabled: this.isMqttEnabled(),
      certConfigured: this.isCertConfigured(),
      updatedAt: record?.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  /** Get MQTT topic for a VIN/vehicle */
  buildTopic(vin: string): string {
    const { topicPrefix, appId } = this.mqttCfg;
    return `${topicPrefix}/${appId}/${vin}/#`;
  }

  /** Return certificate file contents for use by MQTT client (server-side only) */
  loadCertFiles(): { ca: Buffer; cert: Buffer; key: Buffer } | null {
    if (!this.isCertConfigured()) return null;
    const { caCertPath, clientCertPath, clientKeyPath } = this.mqttCfg;
    try {
      return {
        ca: fs.readFileSync(caCertPath),
        cert: fs.readFileSync(clientCertPath),
        key: fs.readFileSync(clientKeyPath),
      };
    } catch (err: any) {
      this.logger.error(`Failed to load MQTT cert files: ${err?.message}`);
      return null;
    }
  }
}
