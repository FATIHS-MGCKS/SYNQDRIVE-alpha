import { Injectable, Logger, Inject, Optional, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios from 'axios';
import dimoConfig from '@config/dimo.config';
import { RedisService } from '@shared/redis/redis.service';
import { DimoAuthService } from './dimo-auth.service';

const REDIS_AGENT_ID_KEY = 'dimo:agents:agent_id';

export interface AgentStep {
  step: string;
  status: 'done' | 'error' | 'skipped';
  detail?: string;
}

export interface CreateAgentResult {
  success: boolean;
  agentId?: string;
  error?: string;
  statusCode?: number;
  configFailure?: boolean;
}

export interface SendMessageResult {
  success: boolean;
  response?: string;
  error?: string;
  statusCode?: number;
}

export interface VehicleContext {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  drivetrain?: string;
  powertrainType?: string;
  fuelType?: string;
}

export interface VehicleSpecsResult {
  success: boolean;
  specs?: Record<string, string | number | boolean | null>;
  agentId?: string;
  rawResponse?: string;
  error?: string;
  configFailure?: boolean;
  steps: AgentStep[];
}

@Injectable()
export class DimoAgentsService implements OnModuleInit {
  private readonly logger = new Logger(DimoAgentsService.name);
  private cachedAgentId: string | null = null;
  private cachedVehicleIds = new Set<number>();

  constructor(
    @Inject(dimoConfig.KEY) private readonly conf: ConfigType<typeof dimoConfig>,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly dimoAuth?: DimoAuthService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.redis) {
      const stored = await this.redis.get(REDIS_AGENT_ID_KEY).catch(() => null);
      if (stored) {
        this.cachedAgentId = stored;
        this.logger.log(`[Agents] Loaded persisted agentId from Redis: ${stored.slice(0, 24)}…`);
      }
    }
  }

  private get agentsBaseUrl(): string {
    return (this.conf as any).agentsBaseUrl || 'https://agents.dimo.zone';
  }

  private get apiKey(): string {
    return ((this.conf as any).dimoApiKey ?? '').trim();
  }

  private get userWallet(): string {
    return ((this.conf as any).agentUserWallet ?? '').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.userWallet);
  }

  // Agents API auth: Bearer JWT in header + DIMO_API_KEY in body secrets.
  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.dimoAuth) {
      try {
        const jwt = await this.dimoAuth.getDeveloperJwt();
        if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      } catch (e: any) {
        this.logger.warn(`[Agents] Could not fetch developer JWT: ${e?.message}`);
      }
    }
    return headers;
  }

  private async persistAgentId(agentId: string): Promise<void> {
    if (this.redis) {
      await this.redis.set(REDIS_AGENT_ID_KEY, agentId, 'EX', 60 * 60 * 24 * 30).catch(() => null); // 30 days
    }
  }

  private async clearPersistedAgentId(): Promise<void> {
    if (this.redis) {
      await this.redis.del(REDIS_AGENT_ID_KEY).catch(() => null);
    }
  }

  // ─── POST /agents ──────────────────────────────────────────────

  async createAgent(_tokenIds?: number[]): Promise<CreateAgentResult> {
    if (!this.apiKey || !this.userWallet) {
      return { success: false, configFailure: true, error: 'DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set' };
    }

    // Create agent WITHOUT VEHICLE_IDS — DIMO 504s when vehicle lookup is included at creation time.
    // Vehicle IDs are passed per-message via sendMessage's vehicleIds field instead.
    const body = {
      type: 'driver_agent_v1',
      personality: 'uncle_mechanic',
      secrets: { DIMO_API_KEY: this.apiKey },
      variables: { USER_WALLET: this.userWallet },
    };

    const url = `${this.agentsBaseUrl}/agents`;
    this.logger.log(`[Agents] POST ${url} — wallet=${this.userWallet.slice(0, 10)}… (no VEHICLE_IDS at creation)`);

    const headers = await this.getHeaders();
    try {
      const res = await axios.post(url, body, {
        headers,
        timeout: 90000,
        validateStatus: () => true,
      });
      const data = res.data as Record<string, unknown>;
      this.logger.log(`[Agents] createAgent → ${res.status}: ${JSON.stringify(data).slice(0, 250)}`);

      if (res.status >= 200 && res.status < 300) {
        const agentId = String(data?.agentId ?? data?.id ?? '');
        if (!agentId) return { success: false, error: 'No agentId in response' };
        this.cachedAgentId = agentId;
        this.cachedVehicleIds = new Set();
        await this.persistAgentId(agentId);
        return { success: true, agentId };
      }

      const err = String((data as any)?.message ?? (data as any)?.error ?? (data as any)?.detail ?? `HTTP ${res.status}`);
      return { success: false, statusCode: res.status, error: err };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Network error' };
    }
  }

  // ─── DELETE /agents/:agentId ───────────────────────────────────

  async deleteAgent(agentId: string): Promise<void> {
    const url = `${this.agentsBaseUrl}/agents/${agentId}`;
    this.logger.log(`[Agents] DELETE ${url}`);
    const headers = await this.getHeaders();
    try {
      await axios.delete(url, { headers, timeout: 10000, validateStatus: () => true });
    } catch { /* best-effort */ }
    if (this.cachedAgentId === agentId) {
      this.cachedAgentId = null;
      this.cachedVehicleIds.clear();
      await this.clearPersistedAgentId();
    }
  }

  // ─── POST /agents/:agentId/message (synchronous, kept for non-critical calls) ──

  async sendMessage(agentId: string, message: string, tokenIds?: number[]): Promise<SendMessageResult> {
    const body: Record<string, unknown> = {
      message,
      ...(tokenIds?.length && { vehicleIds: tokenIds }),
      ...(this.userWallet && { user: this.userWallet }),
    };

    const url = `${this.agentsBaseUrl}/agents/${agentId}/message`;
    this.logger.log(`[Agents] POST ${url} — msgLen=${message.length}`);

    const headers = await this.getHeaders();
    try {
      const res = await axios.post(url, body, {
        headers,
        timeout: 120000,
        validateStatus: () => true,
      });
      const data = res.data as Record<string, unknown>;
      this.logger.log(`[Agents] sendMessage → ${res.status}`);

      if (res.status >= 200 && res.status < 300) {
        const text = String(data?.response ?? data?.message ?? data?.content ?? JSON.stringify(data));
        return { success: true, response: text };
      }

      return { success: false, statusCode: res.status, error: String((data as any)?.message ?? (data as any)?.error ?? `HTTP ${res.status}`) };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Network error' };
    }
  }

  // ─── POST /agents/:agentId/stream (SSE — for long-running requests) ──

  async sendMessageStream(
    agentId: string,
    message: string,
    tokenIds?: number[],
    onChunk?: (event: { type: string; content: string }) => void,
  ): Promise<SendMessageResult> {
    const body: Record<string, unknown> = {
      message,
      ...(tokenIds?.length && { vehicleIds: tokenIds }),
      ...(this.userWallet && { user: this.userWallet }),
    };

    const url = `${this.agentsBaseUrl}/agents/${agentId}/stream`;
    this.logger.log(`[Agents] POST ${url} (stream) — msgLen=${message.length}`);

    const headers = await this.getHeaders();
    let fullResponse = '';

    try {
      const res = await axios.post(url, body, {
        headers,
        responseType: 'stream',
        timeout: 0,
        validateStatus: () => true,
      });

      if (res.status >= 400) {
        let errBody = '';
        for await (const chunk of res.data) { errBody += chunk.toString(); }
        this.logger.warn(`[Agents] stream error ${res.status}: ${errBody.slice(0, 300)}`);
        return { success: false, statusCode: res.status, error: `HTTP ${res.status}` };
      }

      return await new Promise<SendMessageResult>((resolve) => {
        let buffer = '';
        const stream = res.data as NodeJS.ReadableStream;
        let lastActivity = Date.now();
        const STREAM_TIMEOUT_MS = 300_000;
        const INACTIVITY_TIMEOUT_MS = 120_000;
        const streamTimeout = setTimeout(() => {
          this.logger.warn(`[Agents] Stream hard timeout after ${STREAM_TIMEOUT_MS / 1000}s`);
          stream.removeAllListeners();
          if (fullResponse) {
            resolve({ success: true, response: fullResponse });
          } else {
            resolve({ success: false, error: `Stream timeout (${STREAM_TIMEOUT_MS / 1000}s)` });
          }
        }, STREAM_TIMEOUT_MS);

        const inactivityCheck = setInterval(() => {
          if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
            this.logger.warn(`[Agents] Stream inactivity timeout (${INACTIVITY_TIMEOUT_MS / 1000}s no data)`);
            clearInterval(inactivityCheck);
            clearTimeout(streamTimeout);
            stream.removeAllListeners();
            if (fullResponse) {
              resolve({ success: true, response: fullResponse });
            } else {
              resolve({ success: false, error: `Stream inactivity timeout (${INACTIVITY_TIMEOUT_MS / 1000}s)` });
            }
          }
        }, 10_000);

        stream.on('data', (chunk: Buffer) => {
          lastActivity = Date.now();
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);
              const msgType = parsed.message_type || parsed.type || '';
              const content = parsed.content || parsed.text || parsed.message || '';

              if (msgType === 'assistant_message' && content) {
                fullResponse += content;
              }

              if (onChunk) {
                const label =
                  msgType === 'reasoning_message' ? 'KI denkt nach...' :
                  msgType === 'tool_call_message' ? `Tool: ${parsed.tool_call?.name || 'Datenabfrage'}` :
                  msgType === 'tool_return_message' ? 'Daten empfangen' :
                  msgType === 'assistant_message' ? '' : msgType;
                if (label) onChunk({ type: msgType, content: label });
              }
            } catch {
              if (payload.length > 2) fullResponse += payload;
            }
          }
        });

        stream.on('end', () => {
          clearTimeout(streamTimeout);
          clearInterval(inactivityCheck);
          this.logger.log(`[Agents] Stream completed — responseLen=${fullResponse.length}`);
          resolve({ success: true, response: fullResponse || '(empty stream)' });
        });

        stream.on('error', (err: Error) => {
          clearTimeout(streamTimeout);
          clearInterval(inactivityCheck);
          this.logger.warn(`[Agents] Stream error: ${err.message}`);
          if (fullResponse) {
            resolve({ success: true, response: fullResponse });
          } else {
            resolve({ success: false, error: err.message });
          }
        });
      });
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Network error' };
    }
  }

  private buildVehicleSpecMessage(vehicle?: VehicleContext, tokenIds?: number[]): string {
    const vinLine = vehicle?.vin ? `VIN: ${vehicle.vin}` : '';
    const makeLine = vehicle?.make ? `MAKE: ${vehicle.make}` : '';
    const modelLine = vehicle?.model ? `MODEL: ${vehicle.model}` : '';
    const yearLine = vehicle?.year ? `YEAR: ${vehicle.year}` : '';
    const drivetrainLine = vehicle?.drivetrain ? `DRIVETRAIN: ${vehicle.drivetrain}` : '';
    const powertrainLine = vehicle?.powertrainType ? `POWERTRAIN_TYPE: ${vehicle.powertrainType}` : '';
    const fuelTypeLine = vehicle?.fuelType ? `FUEL_TYPE: ${vehicle.fuelType}` : '';
    const vehicleBlock = [vinLine, makeLine, modelLine, yearLine, drivetrainLine, powertrainLine, fuelTypeLine].filter(Boolean).join('\n');
    const tokenCtx = tokenIds && tokenIds.length > 0 ? `Vehicle Token IDs: ${tokenIds.join(', ')}` : '';

    return `You are a vehicle specification database assistant with deep automotive engineering knowledge. Answer IMMEDIATELY from your knowledge. Do NOT perform web searches or external API lookups — respond only with what you already know about this vehicle from your training data.

${vehicleBlock ? `Vehicle context:\n${vehicleBlock}\n${tokenCtx}\n\n` : ''}For the vehicle above, fill in the factory/OEM specifications from your automotive knowledge. Return ONLY this JSON (pretty-printed, no markdown, no prose):

{
  "lvBatteryType": null,
  "lvBatteryChemistry": null,
  "lvBatteryAmpere": null,
  "lvBatteryVolt": null,
  "hvBatteryPresent": null,
  "hvBatteryChemistry": null,
  "hvBatteryCellFormat": null,
  "hvBatteryGrossCapacityKwh": null,
  "hvBatteryUsableCapacityKwh": null,
  "hvBatteryNominalVoltage": null,
  "hvBatteryArchitecture": null,
  "hvBatteryModuleCount": null,
  "hvBatteryCellCount": null,
  "hvBatteryThermalManagement": null,
  "hvBatteryWarrantyYears": null,
  "hvBatteryWarrantyKm": null,
  "acOnboardChargerKw": null,
  "dcFastChargeMaxKw": null,
  "tankCapacityLiters": null,
  "engineDisplacementCc": null,
  "cylinderCount": null,
  "frontRotorDiameterMm": null,
  "frontRotorWidthMm": null,
  "frontPadThicknessMm": null,
  "rearRotorDiameterMm": null,
  "rearRotorWidthMm": null,
  "rearPadThicknessMm": null,
  "brakeForceDistribution": null,
  "idleRpm": null,
  "maxRpm": null,
  "curbWeightKg": null,
  "drivetrain": null,
  "frontToRearWeightDistribution": null,
  "manufacturerServiceIntervalKm": null,
  "manufacturerServiceIntervalMonths": null,
  "oilchangeIntervalKm": null,
  "oilchangeIntervalMonths": null
}

Rules:
- return ONLY valid JSON, nothing else
- respond immediately from your automotive knowledge — do NOT search the web or call external APIs
- use null ONLY if you genuinely do not know the value
- for well-known vehicles (VW Golf, Audi A4, BMW 3er, Tesla Model 3, etc.) you SHOULD know most of these specs — fill them in confidently
- use numbers where possible, do not include units in numeric fields
- tankCapacityLiters: fuel tank capacity in liters for ICE/HEV/PHEV, null for pure EV
- drivetrain: FWD, RWD, AWD, or 4WD
- brakeForceDistribution: front percentage as number, e.g. 60 means 60% front / 40% rear
- frontToRearWeightDistribution: string ratio, e.g. "60/40"
- frontPadThicknessMm / rearPadThicknessMm: new/factory brake pad thickness in mm (typically 10-15 front, 8-12 rear) — always try to provide this
- curbWeightKg: vehicle curb weight in kg — you should know this for most common vehicles
- idleRpm: typical idle RPM (usually 650-850 for most ICE vehicles)
- maxRpm: redline RPM
- engineDisplacementCc: displacement in cc (e.g. 1984 for a 2.0L engine)
- cylinderCount: whole number
- always treat lvBattery* as the low-voltage auxiliary 12V battery
- set hvBatteryPresent=true only for HEV/PHEV/EV, false for pure ICE
- for ICE vehicles, set all hvBattery* to null and hvBatteryPresent=false
- hvBatteryChemistry: LFP, NMC, NCA, Li-Ion, or NiMH
- hvBatteryCellFormat: cylindrical, prismatic, or pouch
- hvBatteryArchitecture: 400V or 800V
- hvBatteryThermalManagement: liquid-cooled, air-cooled, or passive
- do not guess usable capacity from gross or vice versa
- for pure EV, engineDisplacementCc and cylinderCount must be null
- manufacturerServiceIntervalKm/Months: the OEM-recommended service interval
- oilchangeIntervalKm/Months: the OEM-recommended oil change interval`;
  }

  // ─── Full orchestration ────────────────────────────────────────

  async getVehicleSpecs(tokenIds?: number[], vehicle?: VehicleContext): Promise<VehicleSpecsResult> {
    const steps: AgentStep[] = [];

    // 1) Config check
    if (!this.isConfigured()) {
      steps.push({ step: 'Configuration check', status: 'error', detail: 'DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set in .env' });
      return { success: false, configFailure: true, error: 'Not configured', steps };
    }
    steps.push({ step: 'Configuration check', status: 'done', detail: 'API Key + Wallet OK' });

    const requestedIds = tokenIds ?? [];

    // 2) Reuse cached agent — vehicle IDs are scoped per-message, so no need to recreate for new vehicles
    let agentId = this.cachedAgentId;

    // 3) Create agent if no cached agent exists
    if (!agentId) {
      const createStep: AgentStep = {
        step: 'Creating AI Agent',
        status: 'done',
        detail: 'POST /agents (vehicle IDs passed per message)',
      };
      steps.push(createStep);

      const cr = await this.createAgent();
      if (!cr.success || !cr.agentId) {
        createStep.status = 'error';
        createStep.detail = cr.error ?? 'Failed';
        return { success: false, configFailure: cr.configFailure, error: cr.error ?? 'Agent creation failed', steps };
      }
      agentId = cr.agentId;
      createStep.detail = `Agent created: ${agentId}`;
    } else {
      steps.push({ step: 'Agent ready', status: 'done', detail: `Reusing ${agentId.slice(0, 24)}…` });
    }

    // 4) Build structured JSON extraction prompt
    const message = this.buildVehicleSpecMessage(vehicle, requestedIds.length > 0 ? requestedIds : undefined);

    // 5) Send message via stream endpoint (handles long responses without timeout)
    const msgStep: AgentStep = { step: 'Sending specs request to agent', status: 'done', detail: `POST /agents/${agentId}/stream` };
    steps.push(msgStep);
    const tokenIdsToSend = requestedIds.length > 0 ? requestedIds : undefined;
    let msgResult = await this.sendMessageStream(agentId, message, tokenIdsToSend);

    // 6) On failure: try once with fresh agent (expired agent, not a timeout retry)
    if (!msgResult.success && (msgResult.statusCode === 404 || msgResult.statusCode === 410)) {
      msgStep.status = 'error';
      msgStep.detail = `Agent expired (${msgResult.statusCode})`;

      const retryStep: AgentStep = { step: 'Refreshing agent', status: 'done', detail: '' };
      steps.push(retryStep);

      this.cachedAgentId = null;
      this.cachedVehicleIds.clear();

      const retryCr = await this.createAgent();
      if (!retryCr.success || !retryCr.agentId) {
        retryStep.status = 'error';
        retryStep.detail = retryCr.error;
        return { success: false, error: retryCr.error ?? 'Agent refresh failed', steps };
      }
      agentId = retryCr.agentId;
      retryStep.detail = `New agent: ${agentId}`;

      msgResult = await this.sendMessageStream(agentId, message, tokenIdsToSend);
      if (!msgResult.success) {
        steps.push({ step: 'Retry request failed', status: 'error', detail: msgResult.error });
        return { success: false, error: msgResult.error, steps };
      }
    } else if (!msgResult.success) {
      msgStep.status = 'error';
      msgStep.detail = msgResult.error;
      return { success: false, error: msgResult.error, steps };
    }

    // 7) Parse response
    const parseStep: AgentStep = { step: 'Parsing AI response', status: 'done', detail: '' };
    steps.push(parseStep);

    const specs = this.parseJsonSpecs(msgResult.response ?? '');
    const hasData = specs && Object.values(specs).some(v => v !== null);

    if (!hasData) {
      parseStep.detail = 'No structured specs extracted — raw response logged';
      this.logger.warn(`[Agents] Raw response (no JSON parsed): ${msgResult.response?.slice(0, 500)}`);
    }

    return { success: true, agentId, specs, rawResponse: msgResult.response, steps };
  }

  /**
   * Streaming variant of getVehicleSpecs that pushes SSE events via the emitter callback.
   * The emitter receives objects like { event: 'step'|'progress'|'result'|'error', data: ... }.
   */
  async getVehicleSpecsStream(
    tokenIds: number[] | undefined,
    vehicle: VehicleContext | undefined,
    emit: (event: string, data: unknown) => void,
  ): Promise<void> {
    // 1) Config check
    if (!this.isConfigured()) {
      emit('step', { step: 'Configuration check', status: 'error', detail: 'DIMO not configured' });
      emit('error', { message: 'DIMO Agent API not configured', configFailure: true });
      return;
    }
    emit('step', { step: 'Konfiguration prüfen', status: 'done', detail: 'API Key + Wallet OK' });

    const requestedIds = tokenIds ?? [];

    // 2) Agent
    let agentId = this.cachedAgentId;
    if (!agentId) {
      emit('step', { step: 'KI-Agent erstellen', status: 'working' });
      const cr = await this.createAgent();
      if (!cr.success || !cr.agentId) {
        emit('step', { step: 'KI-Agent erstellen', status: 'error', detail: cr.error });
        emit('error', { message: cr.error ?? 'Agent creation failed' });
        return;
      }
      agentId = cr.agentId;
      emit('step', { step: 'KI-Agent erstellen', status: 'done', detail: 'Agent bereit' });
    } else {
      emit('step', { step: 'KI-Agent', status: 'done', detail: 'Agent bereit' });
    }

    // 3) Build prompt (shared with getVehicleSpecs)
    const message = this.buildVehicleSpecMessage(vehicle, requestedIds.length > 0 ? requestedIds : undefined);

    // 4) Stream the message
    emit('step', { step: 'Fahrzeugdaten abfragen', status: 'working', detail: 'Stream gestartet...' });

    const tokenIdsToSend = requestedIds.length > 0 ? requestedIds : undefined;
    const msgResult = await this.sendMessageStream(agentId, message, tokenIdsToSend, (chunk) => {
      emit('progress', chunk);
    });

    if (!msgResult.success) {
      // If 404/410, agent expired — retry once
      if (msgResult.statusCode === 404 || msgResult.statusCode === 410) {
        emit('step', { step: 'Agent abgelaufen — erneuern', status: 'working' });
        this.cachedAgentId = null;
        this.cachedVehicleIds.clear();
        const retryCr = await this.createAgent();
        if (retryCr.success && retryCr.agentId) {
          agentId = retryCr.agentId;
          emit('step', { step: 'Agent erneuert', status: 'done' });
          const retryResult = await this.sendMessageStream(agentId, message, tokenIdsToSend, (chunk) => {
            emit('progress', chunk);
          });
          if (!retryResult.success) {
            emit('step', { step: 'Fahrzeugdaten abfragen', status: 'error', detail: retryResult.error });
            emit('error', { message: retryResult.error ?? 'Stream failed' });
            return;
          }
          // Use retry result for parsing below
          return this.finishStream(retryResult, agentId, emit);
        }
      }
      emit('step', { step: 'Fahrzeugdaten abfragen', status: 'error', detail: msgResult.error });
      emit('error', { message: msgResult.error ?? 'Stream failed' });
      return;
    }

    return this.finishStream(msgResult, agentId, emit);
  }

  private finishStream(
    msgResult: SendMessageResult,
    agentId: string,
    emit: (event: string, data: unknown) => void,
  ): void {
    emit('step', { step: 'Fahrzeugdaten abfragen', status: 'done', detail: 'Antwort empfangen' });

    // Parse response
    emit('step', { step: 'Daten verarbeiten', status: 'working' });
    const specs = this.parseJsonSpecs(msgResult.response ?? '');
    const hasData = specs && Object.values(specs).some(v => v !== null);

    if (hasData) {
      emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Spezifikationen extrahiert' });
    } else {
      emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Keine strukturierten Daten — Rohantwort geloggt' });
      this.logger.warn(`[Agents] Stream raw response (no JSON): ${msgResult.response?.slice(0, 500)}`);
    }

    emit('result', {
      success: true,
      degraded: !hasData,
      agentId,
      specs: specs ?? {},
    });
  }

  // ─── AI Tire Spec stream (mirrors getVehicleSpecsStream for tires) ──

  async getTireSpecsStream(
    tireContext: { brand?: string; model?: string; year?: number; tireSize?: string; loadIndex?: string; speedIndex?: string },
    emit: (event: string, data: unknown) => void,
  ): Promise<void> {
    if (!this.isConfigured()) {
      emit('step', { step: 'Configuration check', status: 'error', detail: 'DIMO not configured' });
      emit('error', { message: 'DIMO Agent API not configured', configFailure: true });
      return;
    }
    emit('step', { step: 'Konfiguration prüfen', status: 'done', detail: 'API Key + Wallet OK' });

    let agentId = this.cachedAgentId;
    if (!agentId) {
      emit('step', { step: 'KI-Agent erstellen', status: 'working' });
      const cr = await this.createAgent();
      if (!cr.success || !cr.agentId) {
        emit('step', { step: 'KI-Agent erstellen', status: 'error', detail: cr.error });
        emit('error', { message: cr.error ?? 'Agent creation failed' });
        return;
      }
      agentId = cr.agentId;
      emit('step', { step: 'KI-Agent erstellen', status: 'done', detail: 'Agent bereit' });
    } else {
      emit('step', { step: 'KI-Agent', status: 'done', detail: 'Agent bereit' });
    }

    const ctxLines = [
      tireContext.brand ? `TIRE_BRAND: ${tireContext.brand}` : '',
      tireContext.model ? `TIRE_MODEL: ${tireContext.model}` : '',
      tireContext.year ? `VEHICLE_YEAR: ${tireContext.year}` : '',
      tireContext.tireSize ? `TIRE_SIZE: ${tireContext.tireSize}` : '',
      tireContext.loadIndex ? `LOAD_INDEX: ${tireContext.loadIndex}` : '',
      tireContext.speedIndex ? `SPEED_INDEX: ${tireContext.speedIndex}` : '',
    ].filter(Boolean).join('\n');

    const message = `You are a tire specification database assistant. Answer immediately from your knowledge. Do NOT perform web searches — respond only with what you already know.

Tire context:
${ctxLines}

Return ONLY this JSON (pretty-printed, no markdown, no prose, no explanation):

{
  "matchedBrand": null,
  "matchedModel": null,
  "matchedVariant": null,
  "seasonType": null,
  "vehicleClassFit": null,
  "runFlat": null,
  "reinforced": null,
  "xl": null,
  "oeHomologation": null,
  "tireSizeRaw": null,
  "widthMm": null,
  "aspectRatio": null,
  "rimDiameterInch": null,
  "loadIndex": null,
  "speedIndex": null,
  "newTreadDepthMm": null,
  "legalMinTreadDepthMm": null,
  "practicalReplacementDepthMm": null,
  "winterRecommendedMinDepthMm": null,
  "sectionWidthMm": null,
  "overallDiameterMm": null,
  "approvedRimWidthMinIn": null,
  "approvedRimWidthMaxIn": null,
  "measuredRimWidthIn": null,
  "revsPerKm": null,
  "maxLoadKg": null,
  "maxInflationKpa": null,
  "maxInflationPsi": null,
  "euRollingResistanceClass": null,
  "euWetGripClass": null,
  "euExternalNoiseDb": null,
  "euExternalNoiseClass": null,
  "severeSnowMarked": null,
  "iceMarked": null,
  "utqgTreadwear": null,
  "utqgTraction": null,
  "utqgTemperature": null,
  "mileageWarrantyKm": null,
  "evOptimized": null,
  "intendedUse": null,
  "comfortBias": null,
  "efficiencyBias": null,
  "wetSafetyBias": null,
  "sportBias": null,
  "longevityBias": null,
  "payloadBias": null,
  "urbanBias": null,
  "highwayBias": null,
  "aggressiveDrivingSensitivity": null,
  "underinflationSensitivity": null,
  "heatSensitivity": null,
  "confidenceScore": null,
  "manufacturerSourceUrl": null,
  "labelSourceUrl": null
}

Rules:
- return ONLY valid JSON, nothing else
- use null if unknown — never invent values
- respond immediately from your knowledge, do not search the web
- confidenceScore: 0 to 1
- intendedUse: array of strings or null
- all bias/sensitivity values: 0 to 1 or null
- legalMinTreadDepthMm defaults to 1.6 if unknown
- practicalReplacementDepthMm defaults: 3.0 summer, 4.0 all_season, 4.0 winter
- winterRecommendedMinDepthMm defaults to 4.0 for winter tires
- if not verifiable, return null`;

    emit('step', { step: 'Reifendaten abfragen', status: 'working', detail: 'Stream gestartet...' });

    const msgResult = await this.sendMessageStream(agentId, message, undefined, (chunk) => {
      emit('progress', chunk);
    });

    if (!msgResult.success) {
      if (msgResult.statusCode === 404 || msgResult.statusCode === 410) {
        emit('step', { step: 'Agent abgelaufen — erneuern', status: 'working' });
        this.cachedAgentId = null;
        this.cachedVehicleIds.clear();
        const retryCr = await this.createAgent();
        if (retryCr.success && retryCr.agentId) {
          agentId = retryCr.agentId;
          emit('step', { step: 'Agent erneuert', status: 'done' });
          const retryResult = await this.sendMessageStream(agentId, message, undefined, (chunk) => {
            emit('progress', chunk);
          });
          if (!retryResult.success) {
            emit('step', { step: 'Reifendaten abfragen', status: 'error', detail: retryResult.error });
            emit('error', { message: retryResult.error ?? 'Stream failed' });
            return;
          }
          return this.finishTireStream(retryResult, agentId, emit);
        }
      }
      emit('step', { step: 'Reifendaten abfragen', status: 'error', detail: msgResult.error });
      emit('error', { message: msgResult.error ?? 'Stream failed' });
      return;
    }

    return this.finishTireStream(msgResult, agentId, emit);
  }

  private finishTireStream(
    msgResult: SendMessageResult,
    agentId: string,
    emit: (event: string, data: unknown) => void,
  ): void {
    emit('step', { step: 'Reifendaten abfragen', status: 'done', detail: 'Antwort empfangen' });
    emit('step', { step: 'Daten verarbeiten', status: 'working' });

    const specs = this.parseTireSpecJson(msgResult.response ?? '');
    const hasData = specs && Object.values(specs).some(v => v !== null);

    if (hasData) {
      emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Reifenspezifikationen extrahiert' });
    } else {
      emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Keine strukturierten Daten' });
      this.logger.warn(`[Agents] Tire spec raw response (no JSON): ${msgResult.response?.slice(0, 500)}`);
    }

    emit('result', { success: true, degraded: !hasData, agentId, specs: specs ?? {} });
  }

  private parseTireSpecJson(text: string): Record<string, string | number | boolean | string[] | null> {
    if (!text) return {};

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed;
        }
      } catch {
        this.logger.warn('[Agents] Tire spec JSON parse failed');
      }
    }

    return {};
  }

  // ─── JSON-first parser with regex fallback ─────────────────────

  private parseJsonSpecs(text: string): Record<string, string | number | boolean | null> {
    const empty: Record<string, string | number | boolean | null> = {
      // LV battery
      lvBatteryType: null, lvBatteryChemistry: null, lvBatteryAmpere: null, lvBatteryVolt: null,
      // HV battery
      hvBatteryPresent: null, hvBatteryChemistry: null, hvBatteryCellFormat: null,
      hvBatteryGrossCapacityKwh: null, hvBatteryUsableCapacityKwh: null,
      hvBatteryNominalVoltage: null, hvBatteryArchitecture: null,
      hvBatteryModuleCount: null, hvBatteryCellCount: null,
      hvBatteryThermalManagement: null, hvBatteryWarrantyYears: null, hvBatteryWarrantyKm: null,
      acOnboardChargerKw: null, dcFastChargeMaxKw: null,
      // Fuel
      tankCapacityLiters: null,
      // Engine
      engineDisplacementCc: null, cylinderCount: null,
      // Brakes
      frontRotorDiameterMm: null, frontRotorWidthMm: null, frontPadThicknessMm: null,
      rearRotorDiameterMm: null, rearRotorWidthMm: null, rearPadThicknessMm: null,
      brakeForceDistribution: null,
      // Technical
      idleRpm: null, maxRpm: null, curbWeightKg: null,
      drivetrain: null, frontToRearWeightDistribution: null,
      manufacturerServiceIntervalKm: null, manufacturerServiceIntervalMonths: null,
      oilchangeIntervalKm: null, oilchangeIntervalMonths: null,
      // Legacy aliases kept for backward compat
      batteryType: null, batteryAmpere: null, batteryVolt: null, hvBatteryCapacityKwh: null,
    };

    if (!text) return empty;

    // Try to extract JSON block from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed === 'object' && parsed !== null) {
          const result = { ...empty };
          for (const key of Object.keys(result)) {
            if (key in parsed && parsed[key] !== undefined) {
              result[key] = parsed[key];
            }
          }
          // Mirror new field names into legacy aliases so existing applySpecs callers still work
          if (result.lvBatteryType !== null && result.batteryType === null) result.batteryType = result.lvBatteryType;
          if (result.lvBatteryAmpere !== null && result.batteryAmpere === null) result.batteryAmpere = result.lvBatteryAmpere;
          if (result.lvBatteryVolt !== null && result.batteryVolt === null) result.batteryVolt = result.lvBatteryVolt;
          if (result.hvBatteryUsableCapacityKwh !== null && result.hvBatteryCapacityKwh === null) result.hvBatteryCapacityKwh = result.hvBatteryUsableCapacityKwh;
          return result;
        }
      } catch {
        this.logger.warn('[Agents] JSON parse failed, falling back to regex');
      }
    }

    // Regex fallback for older text-based responses
    const result = { ...empty };
    const extract = (patterns: RegExp[]): string | null => {
      for (const line of text.split('\n')) {
        for (const re of patterns) {
          const m = line.match(re);
          if (m?.[1]) return m[1].trim().replace(/,$/, '');
        }
      }
      return null;
    };

    result.lvBatteryType = extract([/lv\s*battery\s*type[:\s]+([^\n,]+)/i, /battery\s*type[:\s]+([^\n,]+)/i]);
    result.batteryType = result.lvBatteryType;
    result.lvBatteryVolt = extract([/lv\s*battery\s*volt(?:age)?[:\s]+([\d.]+)/i, /battery\s*volt(?:age)?[:\s]+([\d.]+)/i]);
    result.batteryVolt = result.lvBatteryVolt;
    result.lvBatteryAmpere = extract([/lv\s*battery\s*amp(?:ere)?[:\s]+([\d.]+)/i, /amp(?:ere)?(?:-?hours?|h)?[:\s]+([\d.]+)/i]);
    result.batteryAmpere = result.lvBatteryAmpere;
    result.hvBatteryUsableCapacityKwh = extract([/(?:hv|traction|high.?voltage)\s*(?:battery)?\s*(?:usable|capacity)\s*[:\s]+([\d.]+)\s*kwh/i]);
    result.hvBatteryGrossCapacityKwh = extract([/(?:hv|traction|high.?voltage)\s*(?:battery)?\s*gross\s*[:\s]+([\d.]+)\s*kwh/i]);
    result.hvBatteryCapacityKwh = result.hvBatteryUsableCapacityKwh ?? extract([/battery\s*capacity[:\s]+([\d.]+)\s*kwh/i]);
    result.tankCapacityLiters = extract([/(?:tank|fuel)\s*(?:capacity|volume)[:\s]+([\d.]+)/i, /(?:fuel\s*tank)[:\s]+([\d.]+)\s*(?:l|liters?)/i]);
    result.engineDisplacementCc = extract([/engine\s*displ(?:acement)?[:\s]+([\d,]+)/i, /displacement[:\s]+([\d,]+)\s*cc/i]);
    result.cylinderCount = extract([/cylinder\s*count[:\s]+(\d+)/i, /(\d+)[- ]cylinder/i]);
    result.frontRotorDiameterMm = extract([/front\s*(?:brake\s*)?rotor\s*(?:diam(?:eter)?)?[:\s]+([\d.]+)/i]);
    result.frontRotorWidthMm = extract([/front\s*(?:brake\s*)?rotor\s*(?:width)[:\s]+([\d.]+)/i]);
    result.frontPadThicknessMm = extract([/front\s*(?:brake\s*)?pad\s*(?:thickness)?[:\s]+([\d.]+)/i]);
    result.rearRotorDiameterMm = extract([/(?:rear|back)\s*(?:brake\s*)?rotor\s*(?:diam(?:eter)?)?[:\s]+([\d.]+)/i]);
    result.rearRotorWidthMm = extract([/(?:rear|back)\s*(?:brake\s*)?rotor\s*(?:width)[:\s]+([\d.]+)/i]);
    result.rearPadThicknessMm = extract([/(?:rear|back)\s*(?:brake\s*)?pad\s*(?:thickness)?[:\s]+([\d.]+)/i]);
    result.idleRpm = extract([/idle\s*(?:rpm|speed)[:\s]+([\d,]+)/i]);
    result.maxRpm = extract([/max(?:imum)?\s*rpm[:\s]+([\d,]+)/i]);
    result.curbWeightKg = extract([/curb\s*weight[:\s]+([\d,]+)/i]);

    return result;
  }
}
