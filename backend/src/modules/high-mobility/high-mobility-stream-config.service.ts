import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityAppConfigService } from './high-mobility-app-config.service';
import type { HmMqttAppConfig } from '@config/high-mobility.config';
import type {
  HmStreamingReadinessDto,
  HmMqttConsumerStatusDto,
  HmPackageType,
  HmClearanceStatus,
  HmStreamingState,
  HmMqttConnectionState,
} from './dto/high-mobility.dto';

export type HmStreamApp = 'healthApp' | 'telemetryApp';

/**
 * HighMobilityStreamConfigService
 *
 * Manages MQTT V2 streaming configuration state and readiness diagnostics
 * for both HM Health-APP and HM Telemetry-APP independently.
 *
 * SECURITY: never exposes certificate contents or raw secrets to callers.
 */
@Injectable()
export class HighMobilityStreamConfigService {
  private readonly logger = new Logger(HighMobilityStreamConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly hmConfig: HighMobilityAppConfigService,
  ) {}

  private mqttCfg(app: HmStreamApp): HmMqttAppConfig {
    return this.hmConfig[app].mqtt;
  }

  private hmEnv(app: HmStreamApp): string {
    return this.hmConfig[app].env;
  }

  isCertConfigured(app: HmStreamApp): boolean {
    const { caCertPath, clientCertPath, clientKeyPath } = this.mqttCfg(app);
    if (!caCertPath || !clientCertPath || !clientKeyPath) return false;
    try {
      const ca = path.resolve(caCertPath);
      const cert = path.resolve(clientCertPath);
      const key = path.resolve(clientKeyPath);
      return fs.existsSync(ca) && fs.existsSync(cert) && fs.existsSync(key);
    } catch {
      return false;
    }
  }

  isMqttEnabled(app: HmStreamApp): boolean {
    return this.mqttCfg(app).enabled;
  }

  isMqttReadyToConnect(app: HmStreamApp): boolean {
    const hmReady =
      app === 'healthApp' ? this.hmConfig.isHealthAppMqttReady() : this.hmConfig.isTelemetryAppMqttReady();
    return hmReady && this.isCertConfigured(app);
  }

  async getStreamingReadiness(hmVehicleId: string, app: HmStreamApp = 'telemetryApp'): Promise<HmStreamingReadinessDto> {
    const hmRecord = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hmRecord) throw new Error(`HM vehicle ${hmVehicleId} not found`);

    const mqttEnabled = this.isMqttEnabled(app);
    const mqttConfigured = this.isCertConfigured(app) && Boolean(this.mqttCfg(app).appId);
    const appLabel = app === 'healthApp' ? 'HM Health-APP' : 'HM Telemetry-APP';

    const checks: { key: string; label: string; ok: boolean; note?: string }[] = [
      {
        key: 'clearance_approved',
        label: 'Clearance Approved',
        ok: hmRecord.clearanceStatus === 'APPROVED',
        note: hmRecord.clearanceStatus !== 'APPROVED' ? `Current: ${hmRecord.clearanceStatus}` : undefined,
      },
      {
        key: 'mqtt_enabled',
        label: `${appLabel} MQTT Enabled`,
        ok: mqttEnabled,
        note: !mqttEnabled ? `Set ${app === 'healthApp' ? 'HM_HEALTH_APP' : 'HM_TELEMETRY_APP'}_MQTT_ENABLED=true` : undefined,
      },
      {
        key: 'mqtt_certs',
        label: `${appLabel} MQTT Certificates Configured`,
        ok: mqttConfigured,
        note: !mqttConfigured ? 'Configure MQTT_CA_CERT_PATH, CLIENT_CERT_PATH, CLIENT_KEY_PATH, MQTT_APP_ID, MQTT_CLIENT_ID' : undefined,
      },
    ];

    return {
      hmVehicleId,
      vin: hmRecord.vin,
      packageType: hmRecord.packageType as HmPackageType,
      sourceMode: hmRecord.sourceMode as any,
      clearanceStatus: hmRecord.clearanceStatus as HmClearanceStatus,
      streamingState: (hmRecord as any).streamingState as HmStreamingState ?? 'NOT_CONFIGURED',
      mqttEnabled,
      mqttConfigured,
      ready: checks.every(c => c.ok),
      checks,
    };
  }

  async upsertConsumerState(
    app: HmStreamApp,
    update: {
      connectionState: HmMqttConnectionState;
      lastConnectedAt?: Date;
      lastMessageAt?: Date;
      lastErrorAt?: Date;
      lastErrorMessage?: string;
    },
  ): Promise<void> {
    const { appId, consumerGroup } = this.mqttCfg(app);
    const env = this.hmEnv(app);

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
      this.logger.warn(`[${app}] Failed to upsert consumer state: ${err?.message}`);
    }
  }

  async getConsumerStatus(app: HmStreamApp): Promise<HmMqttConsumerStatusDto> {
    const { appId, consumerGroup } = this.mqttCfg(app);
    const env = this.hmEnv(app);

    const record = await this.prisma.highMobilityStreamConsumerState
      .findUnique({ where: { uq_hm_consumer_state: { environment: env, applicationId: appId, consumerGroup } } })
      .catch(() => null);

    return {
      environment: env,
      applicationId: appId,
      consumerGroup,
      connectionState: (record?.connectionState ?? 'DISCONNECTED') as HmMqttConnectionState,
      lastConnectedAt: record?.lastConnectedAt?.toISOString() ?? null,
      lastMessageAt: record?.lastMessageAt?.toISOString() ?? null,
      lastErrorAt: record?.lastErrorAt?.toISOString() ?? null,
      lastErrorMessage: record?.lastErrorMessage ?? null,
      mqttEnabled: this.isMqttEnabled(app),
      certConfigured: this.isCertConfigured(app),
      updatedAt: record?.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  buildTopic(app: HmStreamApp, vin?: string): string {
    const { topic, appId, consumerGroup } = this.mqttCfg(app);
    // If a full topic from HM snippet is available, use it directly
    if (topic) return vin ? topic.replace('#', `${vin}/#`) : topic;
    // Fallback construction (legacy)
    return vin
      ? `$share/${consumerGroup}/live/${appId}/${vin}/#`
      : `$share/${consumerGroup}/live/${appId}/#`;
  }

  loadCertFiles(app: HmStreamApp): {
    ca: Buffer;
    cert: Buffer;
    key: Buffer;
    resolvedPaths: { ca: string; cert: string; key: string };
  } | null {
    if (!this.isCertConfigured(app)) return null;
    const { caCertPath, clientCertPath, clientKeyPath } = this.mqttCfg(app);
    const resolvedPaths = {
      ca: path.resolve(caCertPath),
      cert: path.resolve(clientCertPath),
      key: path.resolve(clientKeyPath),
    };
    this.logger.log(`[${app}] Loading HM MQTT TLS files — ca=${resolvedPaths.ca} cert=${resolvedPaths.cert} key=${resolvedPaths.key}`);
    try {
      return {
        ca: fs.readFileSync(resolvedPaths.ca),
        cert: fs.readFileSync(resolvedPaths.cert),
        key: fs.readFileSync(resolvedPaths.key),
        resolvedPaths,
      };
    } catch (err: any) {
      this.logger.error(`[${app}] Failed to load MQTT cert files: ${err?.message}`);
      return null;
    }
  }
}
