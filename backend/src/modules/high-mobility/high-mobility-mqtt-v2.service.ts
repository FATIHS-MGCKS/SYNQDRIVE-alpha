import { Injectable, Logger } from '@nestjs/common';
import type { HmStreamApp } from './high-mobility-stream-config.service';

export interface HmMqttV2RuntimeSnapshot {
  app: HmStreamApp;
  brokerHost: string | null;
  brokerPort: number | null;
  topic: string | null;
  subscribedTopic: string | null;
  clientId: string | null;
  hmEnv: 'live' | 'sandbox' | string;
  mqttEnabledConfig: boolean;
  mqttReadyConfig: boolean;
  /** Process-local connection flag from mqtt.js client */
  socketConnected: boolean;
  subscribed: boolean;
  messagesReceivedTotal: number;
  lastMessageAt: string | null;
  lastMessageId: string | null;
  lastVin: string | null;
  lastVersion: string | null;
  lastDataTopLevelKeys: string[];
  lastError: string | null;
  lastErrorAt: string | null;
  lastBrokerCloseAt: string | null;
  lastOfflineAt: string | null;
  reconnectCount: number;
  certPathsResolved: { ca: string; cert: string; key: string } | null;
}

class PerAppMqttStats {
  brokerHost: string | null = null;
  brokerPort: number | null = null;
  topic: string | null = null;
  subscribedTopic: string | null = null;
  clientId: string | null = null;
  hmEnv: string = 'live';
  mqttEnabledConfig = false;
  mqttReadyConfig = false;
  socketConnected = false;
  subscribed = false;
  messagesReceivedTotal = 0;
  lastMessageAt: string | null = null;
  lastMessageId: string | null = null;
  lastVin: string | null = null;
  lastVersion: string | null = null;
  lastDataTopLevelKeys: string[] = [];
  lastError: string | null = null;
  lastErrorAt: string | null = null;
  lastBrokerCloseAt: string | null = null;
  lastOfflineAt: string | null = null;
  reconnectCount = 0;
  certPathsResolved: { ca: string; cert: string; key: string } | null = null;
}

/**
 * HighMobilityMqttV2Service
 *
 * In-memory observability for HM MQTT V2 clients (Health-APP + Telemetry-APP).
 * Complements Prisma `highMobilityStreamConsumerState` with live counters and last payload hints.
 */
@Injectable()
export class HighMobilityMqttV2Service {
  private readonly logger = new Logger(HighMobilityMqttV2Service.name);
  private readonly health = new PerAppMqttStats();
  private readonly telemetry = new PerAppMqttStats();

  private stats(app: HmStreamApp): PerAppMqttStats {
    return app === 'healthApp' ? this.health : this.telemetry;
  }

  initConfig(
    app: HmStreamApp,
    input: {
      hmEnv: string;
      mqttEnabled: boolean;
      mqttReady: boolean;
      host: string;
      port: number;
      topic: string;
      clientId: string;
      certPathsResolved: { ca: string; cert: string; key: string };
    },
  ): void {
    const s = this.stats(app);
    s.hmEnv = input.hmEnv;
    s.mqttEnabledConfig = input.mqttEnabled;
    s.mqttReadyConfig = input.mqttReady;
    s.brokerHost = input.host;
    s.brokerPort = input.port;
    s.topic = input.topic;
    s.clientId = input.clientId;
    s.certPathsResolved = certPathsResolvedCopy(input.certPathsResolved);
    this.logger.log(
      `[HM MQTT V2][${app}] config snapshot — env=${input.hmEnv} host=${input.host}:${input.port} ` +
        `topic=${input.topic} clientId=${input.clientId} | TLS files: ca=${input.certPathsResolved.ca} cert=${input.certPathsResolved.cert} key=${input.certPathsResolved.key}`,
    );
  }

  markTlsLoadOk(app: HmStreamApp): void {
    this.logger.log(`[HM MQTT V2][${app}] TLS material loaded successfully from disk`);
  }

  markTlsLoadFailed(app: HmStreamApp, err: string): void {
    const s = this.stats(app);
    s.lastError = err;
    s.lastErrorAt = new Date().toISOString();
    this.logger.error(`[HM MQTT V2][${app}] TLS load failed: ${err}`);
  }

  onSocketConnect(app: HmStreamApp): void {
    const s = this.stats(app);
    s.socketConnected = true;
    this.logger.log(`[HM MQTT V2][${app}] broker TCP/TLS socket connected`);
  }

  onSubscribeSuccess(app: HmStreamApp, topic: string): void {
    const s = this.stats(app);
    s.subscribed = true;
    s.subscribedTopic = topic;
    this.logger.log(`[HM MQTT V2][${app}] SUBACK ok — subscribed qos=1 topic=${topic}`);
  }

  onSubscribeError(app: HmStreamApp, topic: string, err: string): void {
    const s = this.stats(app);
    s.subscribed = false;
    s.lastError = `Subscribe failed: ${err}`;
    s.lastErrorAt = new Date().toISOString();
    this.logger.error(`[HM MQTT V2][${app}] SUBACK error topic=${topic}: ${err}`);
  }

  onMessage(
    app: HmStreamApp,
    meta: {
      messageId: string | null;
      vin: string | null;
      version: string | null;
      dataTopLevelKeys: string[];
      emptyData: boolean;
    },
  ): void {
    const s = this.stats(app);
    s.messagesReceivedTotal += 1;
    const now = new Date().toISOString();
    s.lastMessageAt = now;
    s.lastMessageId = meta.messageId;
    s.lastVin = meta.vin;
    s.lastVersion = meta.version;
    s.lastDataTopLevelKeys = meta.dataTopLevelKeys;

    const keysStr = meta.dataTopLevelKeys.slice(0, 12).join(', ') + (meta.dataTopLevelKeys.length > 12 ? '…' : '');
    // Per-message log — high frequency. Kept at debug so production log levels
    // (error/warn/log) suppress it; flip LOG_LEVEL to include debug to trace.
    this.logger.debug(
      `[HM MQTT V2][${app}] message #${s.messagesReceivedTotal} ` +
        `msgId=${meta.messageId ?? 'n/a'} vin=${meta.vin ?? 'n/a'} ver=${meta.version ?? 'n/a'} ` +
        `data.groups=[${keysStr || '—'}]`,
    );
    if (meta.emptyData) {
      this.logger.warn(`[HM MQTT V2][${app}] payload.data is empty or missing — signal grant or package may exclude these paths (not a transport error)`);
    }
  }

  onMalformedPayload(app: HmStreamApp, reason: string): void {
    this.logger.warn(`[HM MQTT V2][${app}] malformed JSON payload: ${reason}`);
  }

  onBrokerError(app: HmStreamApp, message: string): void {
    const s = this.stats(app);
    s.lastError = message;
    s.lastErrorAt = new Date().toISOString();
    this.logger.error(`[HM MQTT V2][${app}] broker error: ${message}`);
  }

  onReconnect(app: HmStreamApp): void {
    const s = this.stats(app);
    s.reconnectCount += 1;
    this.logger.warn(`[HM MQTT V2][${app}] reconnect scheduled (#${s.reconnectCount}) — transport issue or broker drop`);
  }

  onClose(app: HmStreamApp): void {
    const s = this.stats(app);
    s.socketConnected = false;
    s.subscribed = false;
    s.lastBrokerCloseAt = new Date().toISOString();
    this.logger.warn(`[HM MQTT V2][${app}] connection closed`);
  }

  onOffline(app: HmStreamApp): void {
    const s = this.stats(app);
    s.socketConnected = false;
    s.lastOfflineAt = new Date().toISOString();
    this.logger.warn(`[HM MQTT V2][${app}] client offline — network or broker unreachable`);
  }

  onDisconnectPacket(app: HmStreamApp): void {
    this.logger.warn(`[HM MQTT V2][${app}] received disconnect packet from broker`);
  }

  getSnapshot(app: HmStreamApp): HmMqttV2RuntimeSnapshot {
    const s = this.stats(app);
    return {
      app,
      brokerHost: s.brokerHost,
      brokerPort: s.brokerPort,
      topic: s.topic,
      subscribedTopic: s.subscribedTopic,
      clientId: s.clientId,
      hmEnv: s.hmEnv,
      mqttEnabledConfig: s.mqttEnabledConfig,
      mqttReadyConfig: s.mqttReadyConfig,
      socketConnected: s.socketConnected,
      subscribed: s.subscribed,
      messagesReceivedTotal: s.messagesReceivedTotal,
      lastMessageAt: s.lastMessageAt,
      lastMessageId: s.lastMessageId,
      lastVin: s.lastVin,
      lastVersion: s.lastVersion,
      lastDataTopLevelKeys: s.lastDataTopLevelKeys,
      lastError: s.lastError,
      lastErrorAt: s.lastErrorAt,
      lastBrokerCloseAt: s.lastBrokerCloseAt,
      lastOfflineAt: s.lastOfflineAt,
      reconnectCount: s.reconnectCount,
      certPathsResolved: s.certPathsResolved ? certPathsResolvedCopy(s.certPathsResolved) : null,
    };
  }
}

function certPathsResolvedCopy(p: { ca: string; cert: string; key: string }) {
  return { ca: p.ca, cert: p.cert, key: p.key };
}
