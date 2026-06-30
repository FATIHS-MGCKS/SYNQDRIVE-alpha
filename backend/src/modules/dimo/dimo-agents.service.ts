import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { promises as dns } from 'dns';
import axios from 'axios';
import dimoConfig from '@config/dimo.config';
import { RedisService } from '@shared/redis/redis.service';
import { DimoAuthService } from './dimo-auth.service';
import {
  createDimoAgentStreamParseState,
  finalizeDimoAgentStreamParse,
  isDimoAgentStreamKeepalive,
  processDimoAgentStreamPayload,
} from './dimo-agent-stream-parser.util';
import {
  DIMO_AGENT_CACHE_TTL_SECONDS,
  resolveDimoAgentCacheKey,
} from './dimo-agent-cache.util';
import {
  DimoAgentPersonality,
  resolveDimoAgentPersonalityFromEnv,
} from './dimo-agent-personality.util';
import {
  DimoAgentUseCase,
  GetOrCreateAgentInput,
  GetOrCreateAgentResult,
} from './dimo-agent-use-case.types';
import {
  assertVehicleScopeIfRequired,
  DimoAgentStreamCallContext,
  formatAgentScopeLog,
  normalizeAgentVehicleIds,
  resolveVehicleSpecsScope,
} from './dimo-agent-vehicle-scope.util';
import {
  DIMO_AGENT_DIAGNOSTIC_TEST_PROMPT,
  DimoAgentDiagnosticCheck,
  DimoAgentDiagnosticsOptions,
  DimoAgentDiagnosticsResult,
} from './dimo-agent-diagnostics.types';
import {
  maskDimoAgentWallet,
  sanitizeDimoAgentError,
  sanitizeDimoAgentErrorMessage,
} from './dimo-agent-error-sanitize.util';
import {
  applyDimoAgentClassifiedError,
  classifyDimoAgentError,
  ClassifyDimoAgentErrorInput,
  DimoAgentClassifiedError,
  DimoAgentErrorKind,
  DimoAgentErrorResultShape,
  extractNodeErrorCode,
} from './dimo-agent-error-classification.util';
import { DimoAgentsConnectivityResult } from './dimo-agents-connectivity.types';

export type {
  DimoAgentUseCase,
  GetOrCreateAgentInput,
  GetOrCreateAgentResult,
  DimoAgentStreamCallContext,
  DimoAgentDiagnosticsOptions,
  DimoAgentDiagnosticsResult,
  DimoAgentsConnectivityResult,
};

export interface AgentStep {
  step: string;
  status: 'done' | 'error' | 'skipped';
  detail?: string;
}

export interface CreateAgentResult {
  success: boolean;
  agentId?: string;
  error?: string;
  errorKind?: DimoAgentErrorKind;
  errorCode?: string;
  failedBeforeHttp?: boolean;
  statusCode?: number;
  configFailure?: boolean;
}

export interface SendMessageResult {
  success: boolean;
  response?: string;
  error?: string;
  errorKind?: DimoAgentErrorKind;
  errorCode?: string;
  failedBeforeHttp?: boolean;
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
  /** True when a DIMO tokenId was passed and live vehicle scope is active. */
  dimoVehicleConnected?: boolean;
  /** True when specs were requested without DIMO tokenId (MMY/knowledge-only). */
  knowledgeOnlyFallback?: boolean;
}

@Injectable()
export class DimoAgentsService {
  private readonly logger = new Logger(DimoAgentsService.name);
  /** In-process agentId cache keyed by scoped Redis cache key. */
  private readonly memoryAgentCache = new Map<string, string>();

  constructor(
    @Inject(dimoConfig.KEY) private readonly conf: ConfigType<typeof dimoConfig>,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly dimoAuth?: DimoAuthService,
  ) {}

  private get agentsBaseUrl(): string {
    return (this.conf as any).agentsBaseUrl || 'https://agents.dimo.zone';
  }

  private get apiKey(): string {
    return ((this.conf as any).dimoApiKey ?? '').trim();
  }

  private get userWallet(): string {
    return ((this.conf as any).agentUserWallet ?? '').trim();
  }

  private getAgentsHostname(): string {
    try {
      return new URL(this.agentsBaseUrl).hostname;
    } catch {
      return 'agents.dimo.zone';
    }
  }

  private logClassifiedAgentFailure(
    operation: string,
    classified: DimoAgentClassifiedError,
    useCase?: DimoAgentUseCase,
  ): void {
    this.logger.warn(
      `[Agents] ${operation} failed — useCase=${useCase ?? 'n/a'} hostname=${this.getAgentsHostname()} kind=${classified.kind} code=${classified.errorCode ?? 'n/a'} failedBeforeHttp=${classified.failedBeforeHttp} message=${sanitizeDimoAgentErrorMessage(classified.message)}`,
    );
  }

  private classifyOperationFailure(
    operation: string,
    input: ClassifyDimoAgentErrorInput,
    useCase?: DimoAgentUseCase,
  ): DimoAgentClassifiedError {
    const classified = classifyDimoAgentError({
      ...input,
      hostname: input.hostname ?? this.getAgentsHostname(),
    });
    this.logClassifiedAgentFailure(operation, classified, useCase);
    return classified;
  }

  private failureFromClassification<T extends CreateAgentResult | SendMessageResult>(
    base: T,
    classified: DimoAgentClassifiedError,
  ): T {
    return applyDimoAgentClassifiedError(
      { ...base, success: false } as T & DimoAgentErrorResultShape,
      classified,
    ) as T;
  }

  private configFailureResult(errorMessage: string): CreateAgentResult {
    const classified = classifyDimoAgentError({
      configFailure: true,
      errorMessage,
      hostname: this.getAgentsHostname(),
    });
    this.logClassifiedAgentFailure('config', classified);
    return this.failureFromClassification(
      { success: false, configFailure: true, error: errorMessage },
      classified,
    );
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.userWallet);
  }

  /** Resolve validated personality for a use case (env override → explicit → default). */
  resolveAgentPersonality(useCase: DimoAgentUseCase, explicitOverride?: string): DimoAgentPersonality {
    return resolveDimoAgentPersonalityFromEnv(
      useCase,
      {
        vehicleSpecs: (this.conf as any).agentPersonalityVehicleSpecs,
        tireSpecs: (this.conf as any).agentPersonalityTireSpecs,
        document: (this.conf as any).agentPersonalityDocument,
        chat: (this.conf as any).agentPersonalityChat,
      },
      explicitOverride,
      (message) => this.logger.warn(message),
    );
  }

  private resolveScopedAgent(input: GetOrCreateAgentInput): {
    cacheKey: string;
    personality: DimoAgentPersonality;
    wallet: string;
  } {
    const personality = this.resolveAgentPersonality(input.useCase, input.personality);
    return resolveDimoAgentCacheKey(input, this.userWallet, personality);
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

  private async persistScopedAgentId(cacheKey: string, agentId: string): Promise<void> {
    this.memoryAgentCache.set(cacheKey, agentId);
    if (this.redis) {
      await this.redis
        .set(cacheKey, agentId, 'EX', DIMO_AGENT_CACHE_TTL_SECONDS)
        .catch(() => null);
    }
  }

  private async readScopedAgentId(cacheKey: string): Promise<string | null> {
    const fromMemory = this.memoryAgentCache.get(cacheKey);
    if (fromMemory) return fromMemory;
    if (!this.redis) return null;
    const fromRedis = await this.redis.get(cacheKey).catch(() => null);
    if (fromRedis) this.memoryAgentCache.set(cacheKey, fromRedis);
    return fromRedis;
  }

  async invalidateAgentCache(input: GetOrCreateAgentInput): Promise<void> {
    const { cacheKey } = this.resolveScopedAgent(input);
    this.memoryAgentCache.delete(cacheKey);
    if (this.redis) {
      await this.redis.del(cacheKey).catch(() => null);
    }
  }

  // ─── Scoped agent resolution ───────────────────────────────────

  async getOrCreateAgent(input: GetOrCreateAgentInput): Promise<GetOrCreateAgentResult> {
    if (!this.isConfigured()) {
      const failure = this.configFailureResult('DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set');
      return { ...failure, cacheKey: undefined };
    }

    const { cacheKey, personality } = this.resolveScopedAgent(input);
    const cached = await this.readScopedAgentId(cacheKey);
    if (cached) {
      return { success: true, agentId: cached, cacheKey };
    }

    const created = await this.createAgentInstance(personality);
    if (!created.success || !created.agentId) {
      return { ...created, cacheKey };
    }

    await this.persistScopedAgentId(cacheKey, created.agentId);
    this.logger.log(
      `[Agents] Cached agent for ${input.useCase} — key=${cacheKey.slice(0, 48)}… id=${created.agentId.slice(0, 24)}…`,
    );
    return { success: true, agentId: created.agentId, cacheKey };
  }

  // ─── POST /agents ──────────────────────────────────────────────

  /** @deprecated Prefer getOrCreateAgent with an explicit use case scope. */
  async createAgent(_tokenIds?: number[]): Promise<CreateAgentResult> {
    const personality = this.resolveAgentPersonality('vehicle_specs');
    return this.createAgentInstance(personality);
  }

  private async createAgentInstance(personality: string): Promise<CreateAgentResult> {
    if (!this.apiKey || !this.userWallet) {
      return this.configFailureResult('DIMO_API_KEY or DIMO_AGENT_USER_WALLET not set');
    }

    // Create agent WITHOUT VEHICLE_IDS — DIMO 504s when vehicle lookup is included at creation time.
    // Vehicle IDs are passed per-message via sendMessage's vehicleIds field instead.
    const body = {
      type: 'driver_agent_v1',
      personality,
      secrets: { DIMO_API_KEY: this.apiKey },
      variables: { USER_WALLET: this.userWallet },
    };

    const url = `${this.agentsBaseUrl}/agents`;
    this.logger.log(
      `[Agents] POST ${url} — wallet=${this.userWallet.slice(0, 10)}… personality=${personality}`,
    );

    const headers = await this.getHeaders();
    try {
      const res = await axios.post(url, body, {
        headers,
        timeout: 90000,
        validateStatus: () => true,
      });
      const data = res.data as Record<string, unknown>;
      this.logger.log(
        `[Agents] createAgent → ${res.status}: ${sanitizeDimoAgentErrorMessage(JSON.stringify(data)).slice(0, 250)}`,
      );

      if (res.status >= 200 && res.status < 300) {
        const agentId = String(data?.agentId ?? data?.id ?? '');
        if (!agentId) return { success: false, error: 'No agentId in response' };
        return { success: true, agentId };
      }

      const err = String((data as any)?.message ?? (data as any)?.error ?? (data as any)?.detail ?? `HTTP ${res.status}`);
      const sanitized = sanitizeDimoAgentErrorMessage(err);
      const classified = this.classifyOperationFailure('createAgent', {
        statusCode: res.status,
        errorMessage: sanitized,
      });
      return this.failureFromClassification(
        { success: false, statusCode: res.status, error: sanitized },
        classified,
      );
    } catch (e: any) {
      const classified = this.classifyOperationFailure('createAgent', { err: e });
      return this.failureFromClassification({ success: false, error: sanitizeDimoAgentError(e) }, classified);
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
    for (const [cacheKey, cachedId] of this.memoryAgentCache.entries()) {
      if (cachedId === agentId) {
        this.memoryAgentCache.delete(cacheKey);
        if (this.redis) await this.redis.del(cacheKey).catch(() => null);
      }
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

      return this.failureFromClassification(
        {
          success: false,
          statusCode: res.status,
          error: sanitizeDimoAgentErrorMessage(
            String((data as any)?.message ?? (data as any)?.error ?? `HTTP ${res.status}`),
          ),
        },
        this.classifyOperationFailure('sendMessage', {
          statusCode: res.status,
          errorMessage: `HTTP ${res.status}`,
        }),
      );
    } catch (e: any) {
      const classified = this.classifyOperationFailure('sendMessage', { err: e });
      return this.failureFromClassification({ success: false, error: sanitizeDimoAgentError(e) }, classified);
    }
  }

  // ─── POST /agents/:agentId/stream (SSE — for long-running requests) ──

  async sendMessageStream(
    agentId: string,
    message: string,
    tokenIds?: number[],
    onChunk?: (event: { type: string; content: string }) => void,
    context?: DimoAgentStreamCallContext,
  ): Promise<SendMessageResult> {
    const vehicleIds = normalizeAgentVehicleIds(tokenIds);
    const scopeError = assertVehicleScopeIfRequired(context, vehicleIds);
    if (scopeError) {
      return { success: false, error: scopeError };
    }
    if (context) {
      this.logger.log(`[Agents] stream ${formatAgentScopeLog(context, vehicleIds)}`);
    }

    const body: Record<string, unknown> = {
      message,
      ...(vehicleIds?.length && { vehicleIds }),
      ...(this.userWallet && { user: this.userWallet }),
    };

    const url = `${this.agentsBaseUrl}/agents/${agentId}/stream`;
    this.logger.log(`[Agents] POST ${url} (stream) — msgLen=${message.length}`);

    const headers = await this.getHeaders();
    const parseState = createDimoAgentStreamParseState();

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
        this.logger.warn(
          `[Agents] stream error ${res.status}: ${sanitizeDimoAgentErrorMessage(errBody).slice(0, 300)}`,
        );
        const classified = this.classifyOperationFailure(
          'streamHttp',
          { statusCode: res.status, errorMessage: `HTTP ${res.status}` },
          context?.useCase,
        );
        return this.failureFromClassification(
          { success: false, statusCode: res.status, error: `HTTP ${res.status}` },
          classified,
        );
      }

      return await new Promise<SendMessageResult>((resolve) => {
        let buffer = '';
        const stream = res.data as NodeJS.ReadableStream;
        let lastActivity = Date.now();
        const STREAM_TIMEOUT_MS = 300_000;
        const INACTIVITY_TIMEOUT_MS = 120_000;
        const resolveStream = (fallbackError?: string) => {
          if (parseState.streamError) {
            resolve(this.finalizeAgentStream(parseState, context?.useCase));
            return;
          }
          if (parseState.fullResponse) {
            resolve(this.finalizeAgentStream(parseState, context?.useCase));
            return;
          }
          const finalized = this.finalizeAgentStream(parseState, context?.useCase);
          if (!finalized.success && !fallbackError) {
            resolve(finalized);
            return;
          }
          const errorMessage = fallbackError ?? finalized.error ?? 'Stream failed';
          const classified = this.classifyOperationFailure(
            fallbackError ? 'streamTransport' : 'streamParser',
            {
              parserFailure: !fallbackError,
              errorMessage,
            },
            context?.useCase,
          );
          resolve(
            this.failureFromClassification(
              {
                success: false,
                error: sanitizeDimoAgentErrorMessage(errorMessage),
              },
              classified,
            ),
          );
        };

        const streamTimeout = setTimeout(() => {
          this.logger.warn(`[Agents] Stream hard timeout after ${STREAM_TIMEOUT_MS / 1000}s`);
          stream.removeAllListeners();
          resolveStream(`Stream timeout (${STREAM_TIMEOUT_MS / 1000}s)`);
        }, STREAM_TIMEOUT_MS);

        const inactivityCheck = setInterval(() => {
          if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
            this.logger.warn(`[Agents] Stream inactivity timeout (${INACTIVITY_TIMEOUT_MS / 1000}s no data)`);
            clearInterval(inactivityCheck);
            clearTimeout(streamTimeout);
            stream.removeAllListeners();
            resolveStream(`Stream inactivity timeout (${INACTIVITY_TIMEOUT_MS / 1000}s)`);
          }
        }, 10_000);

        stream.on('data', (chunk: Buffer) => {
          lastActivity = Date.now();
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (isDimoAgentStreamKeepalive(payload)) continue;

            const { progress } = processDimoAgentStreamPayload(payload, parseState);
            if (progress && onChunk) onChunk(progress);

            if (parseState.streamError) {
              clearTimeout(streamTimeout);
              clearInterval(inactivityCheck);
              stream.removeAllListeners();
              resolve(this.finalizeAgentStream(parseState, context?.useCase));
              return;
            }
          }
        });

        stream.on('end', () => {
          clearTimeout(streamTimeout);
          clearInterval(inactivityCheck);
          const { metadata } = parseState;
          if (metadata.done) {
            this.logger.log(
              `[Agents] Stream done — agentId=${metadata.agentId?.slice(0, 24) ?? 'n/a'}… vehiclesQueried=${metadata.vehiclesQueried?.length ?? 0}`,
            );
          }
          this.logger.log(`[Agents] Stream completed — responseLen=${parseState.fullResponse.length}`);
          resolve(this.finalizeAgentStream(parseState, context?.useCase));
        });

        stream.on('error', (err: Error) => {
          clearTimeout(streamTimeout);
          clearInterval(inactivityCheck);
          this.logger.warn(`[Agents] Stream error: ${err.message}`);
          resolveStream(err.message);
        });
      });
    } catch (e: any) {
      const classified = this.classifyOperationFailure('streamRequest', { err: e }, context?.useCase);
      return this.failureFromClassification({ success: false, error: sanitizeDimoAgentError(e) }, classified);
    }
  }

  private finalizeAgentStream(
    state: ReturnType<typeof createDimoAgentStreamParseState>,
    useCase?: DimoAgentUseCase,
  ): SendMessageResult {
    const result = finalizeDimoAgentStreamParse(state);
    if (!result.success && result.error) {
      const classified = this.classifyOperationFailure(
        'streamParser',
        { parserFailure: true, errorMessage: result.error },
        useCase,
      );
      return this.failureFromClassification(
        { success: false, error: sanitizeDimoAgentErrorMessage(result.error) },
        classified,
      );
    }
    return result;
  }

  private buildVehicleSpecMessage(
    vehicle?: VehicleContext,
    tokenIds?: number[],
    options?: { knowledgeOnly?: boolean },
  ): string {
    const vinLine = vehicle?.vin ? `VIN: ${vehicle.vin}` : '';
    const makeLine = vehicle?.make ? `MAKE: ${vehicle.make}` : '';
    const modelLine = vehicle?.model ? `MODEL: ${vehicle.model}` : '';
    const yearLine = vehicle?.year ? `YEAR: ${vehicle.year}` : '';
    const drivetrainLine = vehicle?.drivetrain ? `DRIVETRAIN: ${vehicle.drivetrain}` : '';
    const powertrainLine = vehicle?.powertrainType ? `POWERTRAIN_TYPE: ${vehicle.powertrainType}` : '';
    const fuelTypeLine = vehicle?.fuelType ? `FUEL_TYPE: ${vehicle.fuelType}` : '';
    const vehicleBlock = [vinLine, makeLine, modelLine, yearLine, drivetrainLine, powertrainLine, fuelTypeLine].filter(Boolean).join('\n');
    const tokenCtx = tokenIds && tokenIds.length > 0 ? `Vehicle Token IDs: ${tokenIds.join(', ')}` : '';
    const scopeNote = options?.knowledgeOnly
      ? `[SCOPE: No DIMO tokenId is available. Use make/model/year/VIN context only. Do NOT claim live DIMO telemetry or invent live vehicle data. This is a knowledge-only OEM specification lookup.]\n\n`
      : tokenIds?.length
        ? `[SCOPE: DIMO tokenId(s) provided — vehicle context may be used, but return OEM factory specs as JSON only.]\n\n`
        : '';

    return `${scopeNote}You are a vehicle specification database assistant with deep automotive engineering knowledge. Answer IMMEDIATELY from your knowledge. Do NOT perform web searches or external API lookups — respond only with what you already know about this vehicle from your training data.

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

    const scopeResolution = resolveVehicleSpecsScope(tokenIds);
    const agentScope = this.vehicleSpecsAgentScope(scopeResolution.vehicleIds);
    steps.push({
      step: 'DIMO vehicle scope',
      status: 'done',
      detail: scopeResolution.hasVehicleScope
        ? `DIMO tokenId scoped (count=${scopeResolution.vehicleIds!.length})`
        : 'No DIMO tokenId — knowledge-only MMY fallback (no live telemetry)',
    });

    // 2) Scoped agent for vehicle specs (isolated from other use cases)
    let agentId: string | undefined;

    const createStep: AgentStep = {
      step: 'Creating AI Agent',
      status: 'done',
      detail: 'Resolving scoped vehicle_specs agent',
    };
    steps.push(createStep);

    const cr = await this.getOrCreateAgent(agentScope);
    if (!cr.success || !cr.agentId) {
      createStep.status = 'error';
      createStep.detail = cr.error ?? 'Failed';
      return { success: false, configFailure: cr.configFailure, error: cr.error ?? 'Agent creation failed', steps };
    }
    agentId = cr.agentId;
    createStep.detail = `Agent ready: ${agentId}`;

    // 4) Build structured JSON extraction prompt
    const message = this.buildVehicleSpecMessage(vehicle, scopeResolution.vehicleIds, {
      knowledgeOnly: scopeResolution.knowledgeOnlyFallback,
    });

    // 5) Send message via stream endpoint (handles long responses without timeout)
    const msgStep: AgentStep = { step: 'Sending specs request to agent', status: 'done', detail: `POST /agents/${agentId}/stream` };
    steps.push(msgStep);
    const streamContext: DimoAgentStreamCallContext = { useCase: 'vehicle_specs' };
    let msgResult = await this.sendMessageStream(
      agentId,
      message,
      scopeResolution.vehicleIds,
      undefined,
      streamContext,
    );

    // 6) On failure: try once with fresh agent (expired agent, not a timeout retry)
    if (!msgResult.success && (msgResult.statusCode === 404 || msgResult.statusCode === 410)) {
      msgStep.status = 'error';
      msgStep.detail = `Agent expired (${msgResult.statusCode})`;

      const retryStep: AgentStep = { step: 'Refreshing agent', status: 'done', detail: '' };
      steps.push(retryStep);

      await this.invalidateAgentCache(agentScope);

      const retryCr = await this.getOrCreateAgent(agentScope);
      if (!retryCr.success || !retryCr.agentId) {
        retryStep.status = 'error';
        retryStep.detail = retryCr.error;
        return { success: false, error: retryCr.error ?? 'Agent refresh failed', steps };
      }
      agentId = retryCr.agentId;
      retryStep.detail = `New agent: ${agentId}`;

      msgResult = await this.sendMessageStream(
        agentId,
        message,
        scopeResolution.vehicleIds,
        undefined,
        streamContext,
      );
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

    return {
      success: true,
      agentId,
      specs,
      rawResponse: msgResult.response,
      steps,
      dimoVehicleConnected: scopeResolution.hasVehicleScope,
      knowledgeOnlyFallback: scopeResolution.knowledgeOnlyFallback,
    };
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

    const scopeResolution = resolveVehicleSpecsScope(tokenIds);
    const agentScope = this.vehicleSpecsAgentScope(scopeResolution.vehicleIds);
    emit('step', {
      step: 'DIMO Fahrzeug-Scope',
      status: 'done',
      detail: scopeResolution.hasVehicleScope
        ? `DIMO tokenId aktiv (${scopeResolution.vehicleIds!.length})`
        : 'Kein DIMO tokenId — Wissensdatenbank-Fallback (keine Live-Telemetrie)',
    });

    // 2) Scoped agent
    let agentId: string | undefined;
    emit('step', { step: 'KI-Agent erstellen', status: 'working' });
    const cr = await this.getOrCreateAgent(agentScope);
    if (!cr.success || !cr.agentId) {
      emit('step', { step: 'KI-Agent erstellen', status: 'error', detail: cr.error });
      emit('error', { message: cr.error ?? 'Agent creation failed' });
      return;
    }
    agentId = cr.agentId;
    emit('step', { step: 'KI-Agent erstellen', status: 'done', detail: 'Agent bereit' });

    // 3) Build prompt (shared with getVehicleSpecs)
    const message = this.buildVehicleSpecMessage(vehicle, scopeResolution.vehicleIds, {
      knowledgeOnly: scopeResolution.knowledgeOnlyFallback,
    });

    // 4) Stream the message
    emit('step', { step: 'Fahrzeugdaten abfragen', status: 'working', detail: 'Stream gestartet...' });

    const streamContext: DimoAgentStreamCallContext = { useCase: 'vehicle_specs' };
    const msgResult = await this.sendMessageStream(
      agentId,
      message,
      scopeResolution.vehicleIds,
      (chunk) => emit('progress', chunk),
      streamContext,
    );

    if (!msgResult.success) {
      // If 404/410, agent expired — retry once
      if (msgResult.statusCode === 404 || msgResult.statusCode === 410) {
        emit('step', { step: 'Agent abgelaufen — erneuern', status: 'working' });
        await this.invalidateAgentCache(agentScope);
        const retryCr = await this.getOrCreateAgent(agentScope);
        if (retryCr.success && retryCr.agentId) {
          agentId = retryCr.agentId;
          emit('step', { step: 'Agent erneuert', status: 'done' });
          const retryResult = await this.sendMessageStream(
            agentId,
            message,
            scopeResolution.vehicleIds,
            (chunk) => emit('progress', chunk),
            streamContext,
          );
          if (!retryResult.success) {
            emit('step', { step: 'Fahrzeugdaten abfragen', status: 'error', detail: retryResult.error });
            emit('error', { message: retryResult.error ?? 'Stream failed' });
            return;
          }
          // Use retry result for parsing below
          return this.finishStream(retryResult, agentId, emit, scopeResolution);
        }
      }
      emit('step', { step: 'Fahrzeugdaten abfragen', status: 'error', detail: msgResult.error });
      emit('error', { message: msgResult.error ?? 'Stream failed' });
      return;
    }

    return this.finishStream(msgResult, agentId, emit, scopeResolution);
  }

  private finishStream(
    msgResult: SendMessageResult,
    agentId: string,
    emit: (event: string, data: unknown) => void,
    scopeResolution?: ReturnType<typeof resolveVehicleSpecsScope>,
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
      degraded: !hasData || scopeResolution?.knowledgeOnlyFallback,
      knowledgeOnlyFallback: scopeResolution?.knowledgeOnlyFallback ?? false,
      dimoVehicleConnected: scopeResolution?.hasVehicleScope ?? false,
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

    const agentScope: GetOrCreateAgentInput = { useCase: 'tire_specs' };
    let agentId: string | undefined;
    emit('step', { step: 'KI-Agent erstellen', status: 'working' });
    const cr = await this.getOrCreateAgent(agentScope);
    if (!cr.success || !cr.agentId) {
      emit('step', { step: 'KI-Agent erstellen', status: 'error', detail: cr.error });
      emit('error', { message: cr.error ?? 'Agent creation failed' });
      return;
    }
    agentId = cr.agentId;
    emit('step', { step: 'KI-Agent erstellen', status: 'done', detail: 'Agent bereit' });
    emit('step', {
      step: 'Reifen-Scope',
      status: 'done',
      detail: 'Wissensdatenbank-Reifenanalyse (kein DIMO-Fahrzeug-Scope)',
    });

    const ctxLines = [
      tireContext.brand ? `TIRE_BRAND: ${tireContext.brand}` : '',
      tireContext.model ? `TIRE_MODEL: ${tireContext.model}` : '',
      tireContext.year ? `VEHICLE_YEAR: ${tireContext.year}` : '',
      tireContext.tireSize ? `TIRE_SIZE: ${tireContext.tireSize}` : '',
      tireContext.loadIndex ? `LOAD_INDEX: ${tireContext.loadIndex}` : '',
      tireContext.speedIndex ? `SPEED_INDEX: ${tireContext.speedIndex}` : '',
    ].filter(Boolean).join('\n');

    const message = `[SCOPE: Knowledge-only tire specification lookup from brand/model/size data. No DIMO vehicle tokenId — do NOT claim live vehicle telemetry.]\n\nYou are a tire specification database assistant. Answer immediately from your knowledge. Do NOT perform web searches — respond only with what you already know.

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

    const tireStreamContext: DimoAgentStreamCallContext = { useCase: 'tire_specs' };
    const msgResult = await this.sendMessageStream(
      agentId,
      message,
      undefined,
      (chunk) => emit('progress', chunk),
      tireStreamContext,
    );

    if (!msgResult.success) {
      if (msgResult.statusCode === 404 || msgResult.statusCode === 410) {
        emit('step', { step: 'Agent abgelaufen — erneuern', status: 'working' });
        await this.invalidateAgentCache(agentScope);
        const retryCr = await this.getOrCreateAgent(agentScope);
        if (retryCr.success && retryCr.agentId) {
          agentId = retryCr.agentId;
          emit('step', { step: 'Agent erneuert', status: 'done' });
          const retryResult = await this.sendMessageStream(
            agentId,
            message,
            undefined,
            (chunk) => emit('progress', chunk),
            tireStreamContext,
          );
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

    emit('result', {
      success: true,
      degraded: !hasData,
      knowledgeOnlyFallback: true,
      dimoVehicleConnected: false,
      agentId,
      specs: specs ?? {},
    });
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

  private vehicleSpecsAgentScope(tokenIds?: number[]): GetOrCreateAgentInput {
    return {
      useCase: 'vehicle_specs',
      vehicleIds: tokenIds?.length ? tokenIds : undefined,
    };
  }

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

  // ─── Connectivity probe (DNS + HTTP, no auth / no agent creation) ──

  async checkDimoAgentsConnectivity(): Promise<DimoAgentsConnectivityResult> {
    const baseUrl = (this.agentsBaseUrl || 'https://agents.dimo.zone').trim().replace(/\/$/, '');
    let hostname = '';

    try {
      hostname = new URL(baseUrl).hostname;
    } catch {
      return {
        ok: false,
        baseUrl,
        hostname: '',
        dns: {
          ok: false,
          errorCode: 'INVALID_URL',
          errorMessage: 'DIMO_AGENTS_BASE_URL is not a valid URL',
        },
        http: { ok: false, skipped: true },
        hint: 'DIMO_AGENTS_BASE_URL is not a valid URL. Check backend configuration.',
      };
    }

    if (!hostname) {
      return {
        ok: false,
        baseUrl,
        hostname: '',
        dns: { ok: false, errorCode: 'MISSING_HOSTNAME', errorMessage: 'No hostname in base URL' },
        http: { ok: false, skipped: true },
        hint: 'DIMO Agents base URL has no hostname.',
      };
    }

    const dnsProbe = { ok: true as boolean, errorCode: undefined as string | undefined, errorMessage: undefined as string | undefined };
    try {
      await dns.lookup(hostname);
    } catch (err) {
      dnsProbe.ok = false;
      dnsProbe.errorCode = extractNodeErrorCode(err) ?? 'DNS_LOOKUP_FAILED';
      dnsProbe.errorMessage = sanitizeDimoAgentError(err);
      return {
        ok: false,
        baseUrl,
        hostname,
        dns: dnsProbe,
        http: { ok: false, skipped: true },
        hint: 'DIMO Agents hostname cannot be resolved from this backend runtime. Check Docker/VPS DNS configuration.',
      };
    }

    const httpProbe: DimoAgentsConnectivityResult['http'] = { ok: false };
    try {
      const res = await axios.get(baseUrl, {
        timeout: 15_000,
        validateStatus: () => true,
      });
      httpProbe.statusCode = res.status;

      if (res.status >= 200 && res.status < 300) {
        const data = res.data;
        if (data && typeof data === 'object') {
          const record = data as Record<string, unknown>;
          if (typeof record.service === 'string') httpProbe.service = record.service;
          if (typeof record.status === 'string') httpProbe.status = record.status;
          if (typeof record.version === 'string') httpProbe.version = record.version;
        }
        httpProbe.ok = true;
        return { ok: true, baseUrl, hostname, dns: dnsProbe, http: httpProbe };
      }

      httpProbe.errorMessage = `HTTP ${res.status}`;
      return {
        ok: false,
        baseUrl,
        hostname,
        dns: dnsProbe,
        http: httpProbe,
        hint: `DIMO Agents hostname resolves, but HTTP GET ${baseUrl} returned ${res.status}. Check firewall or outbound HTTPS from this runtime.`,
      };
    } catch (err) {
      httpProbe.errorCode = extractNodeErrorCode(err);
      httpProbe.errorMessage = sanitizeDimoAgentError(err);
      return {
        ok: false,
        baseUrl,
        hostname,
        dns: dnsProbe,
        http: httpProbe,
        hint: `DIMO Agents hostname resolves, but HTTP GET failed (${httpProbe.errorMessage}). Check outbound HTTPS access from this runtime.`,
      };
    }
  }

  // ─── Admin diagnostics (DIMO AI Agents layer only) ─────────────

  private static readonly DIAGNOSTIC_STREAM_TIMEOUT_MS = 60_000;

  async runAgentDiagnostics(
    options: DimoAgentDiagnosticsOptions = {},
  ): Promise<DimoAgentDiagnosticsResult> {
    const useCase = options.useCase ?? 'vehicle_specs';
    const errors: string[] = [];
    const checks: DimoAgentDiagnosticCheck[] = [];

    const connectivity = await this.checkDimoAgentsConnectivity();
    checks.push({
      name: 'agents_connectivity',
      ok: connectivity.ok,
      phase: 'config',
      detail: connectivity.ok
        ? `dns+http ok (${connectivity.http.service ?? 'agents'} ${connectivity.http.status ?? 'healthy'})`
        : connectivity.hint ?? 'connectivity failed',
    });
    if (!connectivity.ok && connectivity.hint) {
      errors.push(`Agents connectivity failed (phase: config): ${connectivity.hint}`);
    }

    const hasApiKey = Boolean(this.apiKey);
    const hasUserWallet = Boolean(this.userWallet);
    const configured = hasApiKey && hasUserWallet;
    const envBaseUrl = (process.env.DIMO_AGENTS_BASE_URL ?? '').trim();

    checks.push({
      name: 'config',
      ok: configured,
      phase: 'config',
      detail: configured
        ? 'DIMO_API_KEY and DIMO_AGENT_USER_WALLET present'
        : 'DIMO_API_KEY and/or DIMO_AGENT_USER_WALLET missing',
    });

    const useCases: DimoAgentUseCase[] = [
      'vehicle_specs',
      'tire_specs',
      'document_extraction',
      'fleet_chat',
    ];
    const personalities = Object.fromEntries(
      useCases.map((uc) => [uc, this.resolveAgentPersonality(uc)]),
    ) as Record<DimoAgentUseCase, string>;

    checks.push({
      name: 'personalities',
      ok: true,
      phase: 'config',
      detail: useCases.map((uc) => `${uc}=${personalities[uc]}`).join(', '),
    });

    let hasDeveloperJwt: boolean | undefined;
    if (this.dimoAuth) {
      const jwtStart = Date.now();
      try {
        const jwt = await this.dimoAuth.getDeveloperJwt();
        hasDeveloperJwt = Boolean(jwt?.trim());
        checks.push({
          name: 'developer_jwt',
          ok: hasDeveloperJwt,
          durationMs: Date.now() - jwtStart,
          phase: 'config',
          detail: hasDeveloperJwt ? 'available' : 'missing or empty',
        });
        if (!hasDeveloperJwt) {
          errors.push('Developer JWT not available — Agents API requests may fail (phase: config)');
        }
      } catch (err) {
        const detail = sanitizeDimoAgentError(err);
        checks.push({
          name: 'developer_jwt',
          ok: false,
          durationMs: Date.now() - jwtStart,
          phase: 'config',
          detail,
        });
        errors.push(`Developer JWT fetch failed (phase: config): ${detail}`);
      }
    }

    if (this.redis) {
      const cacheStart = Date.now();
      const probeKey = 'dimo:agents:diag:ping';
      try {
        await this.redis.set(probeKey, '1', 'EX', 10);
        const value = await this.redis.get(probeKey);
        await this.redis.del(probeKey).catch(() => null);
        const ok = value === '1';
        checks.push({
          name: 'agent_cache_redis',
          ok,
          durationMs: Date.now() - cacheStart,
          phase: 'cache',
          detail: ok ? 'read/write ok' : 'redis read mismatch',
        });
        if (!ok) errors.push('Agent cache Redis probe failed (phase: cache)');
      } catch (err) {
        const detail = sanitizeDimoAgentError(err);
        checks.push({
          name: 'agent_cache_redis',
          ok: false,
          durationMs: Date.now() - cacheStart,
          phase: 'cache',
          detail,
        });
        errors.push(`Agent cache Redis unreachable (phase: cache): ${detail}`);
      }
    } else {
      checks.push({
        name: 'agent_cache_redis',
        ok: true,
        phase: 'cache',
        detail: 'in-memory only (Redis not injected)',
      });
    }

    const baseResult: DimoAgentDiagnosticsResult = {
      configured,
      baseUrl: this.agentsBaseUrl,
      baseUrlSource: envBaseUrl ? 'env' : 'default',
      hasApiKey,
      hasUserWallet,
      walletMasked: hasUserWallet ? maskDimoAgentWallet(this.userWallet) : undefined,
      hasDeveloperJwt,
      personalities,
      connectivity,
      checks,
      errors,
    };

    if (!configured || options.skipLiveTests) {
      return baseResult;
    }

    const personality = this.resolveAgentPersonality(useCase);
    const testPrompt = DIMO_AGENT_DIAGNOSTIC_TEST_PROMPT;
    let agentId: string | undefined;

    const createStart = Date.now();
    const created = await this.createAgentInstance(personality);
    checks.push({
      name: 'create_agent',
      ok: created.success,
      durationMs: Date.now() - createStart,
      phase: 'create',
      statusCode: created.statusCode,
      detail: created.success ? undefined : sanitizeDimoAgentErrorMessage(created.error ?? 'create failed'),
    });

    if (!created.success || !created.agentId) {
      errors.push(
        `Agent create failed (phase: create)${created.statusCode ? ` HTTP ${created.statusCode}` : ''}: ${sanitizeDimoAgentErrorMessage(created.error ?? 'unknown')}`,
      );
      return { ...baseResult, checks, errors };
    }

    agentId = created.agentId;

    try {
      const messageStart = Date.now();
      const messageResult = await this.sendMessage(agentId, testPrompt);
      checks.push({
        name: 'message',
        ok: messageResult.success,
        durationMs: Date.now() - messageStart,
        phase: 'message',
        statusCode: messageResult.statusCode,
        detail: messageResult.success
          ? undefined
          : sanitizeDimoAgentErrorMessage(messageResult.error ?? 'message failed'),
      });
      if (!messageResult.success) {
        errors.push(
          `Message test failed (phase: message)${messageResult.statusCode ? ` HTTP ${messageResult.statusCode}` : ''}: ${sanitizeDimoAgentErrorMessage(messageResult.error ?? 'unknown')}`,
        );
      }

      const streamStart = Date.now();
      const streamResult = await this.runDiagnosticStream(agentId, testPrompt, undefined, useCase);
      const receivedContent = Boolean(streamResult.response?.trim().length);
      const streamOk = streamResult.success && receivedContent;
      checks.push({
        name: 'stream',
        ok: streamOk,
        durationMs: Date.now() - streamStart,
        phase: streamResult.success ? (receivedContent ? 'stream' : 'parser') : 'stream',
        statusCode: streamResult.statusCode,
        receivedContent,
        detail: !streamResult.success
          ? sanitizeDimoAgentErrorMessage(streamResult.error ?? 'stream failed')
          : !receivedContent
            ? 'Stream completed but parser received no content'
            : undefined,
      });
      if (!streamResult.success) {
        errors.push(
          `Stream test failed (phase: stream)${streamResult.statusCode ? ` HTTP ${streamResult.statusCode}` : ''}: ${sanitizeDimoAgentErrorMessage(streamResult.error ?? 'unknown')}`,
        );
      } else if (!receivedContent) {
        errors.push('Stream parser received no content (phase: parser)');
      }

      if (options.dimoTokenId != null) {
        const scopeStart = Date.now();
        const scopeResult = await this.runDiagnosticStream(
          agentId,
          testPrompt,
          [options.dimoTokenId],
          'vehicle_specs',
        );
        const scopeReceived = Boolean(scopeResult.response?.trim().length);
        checks.push({
          name: 'vehicle_scope',
          ok: scopeResult.success,
          durationMs: Date.now() - scopeStart,
          phase: 'vehicle_scope',
          statusCode: scopeResult.statusCode,
          receivedContent: scopeReceived,
          detail: `tokenId=${options.dimoTokenId}${scopeResult.success ? '' : ` — ${sanitizeDimoAgentErrorMessage(scopeResult.error ?? 'failed')}`}`,
        });
        if (!scopeResult.success) {
          errors.push(
            `Vehicle scope test failed (phase: vehicle_scope)${scopeResult.statusCode ? ` HTTP ${scopeResult.statusCode}` : ''}: ${sanitizeDimoAgentErrorMessage(scopeResult.error ?? 'unknown')}`,
          );
        }
      }
    } finally {
      if (agentId) {
        await this.deleteAgent(agentId).catch(() => null);
      }
    }

    return { ...baseResult, checks, errors };
  }

  private async runDiagnosticStream(
    agentId: string,
    message: string,
    tokenIds: number[] | undefined,
    useCase: DimoAgentUseCase,
  ): Promise<SendMessageResult> {
    try {
      return await Promise.race([
        this.sendMessageStream(agentId, message, tokenIds, undefined, { useCase }),
        new Promise<SendMessageResult>((_, reject) => {
          setTimeout(
            () => reject(new Error(`Diagnostic stream timeout (${DimoAgentsService.DIAGNOSTIC_STREAM_TIMEOUT_MS / 1000}s)`)),
            DimoAgentsService.DIAGNOSTIC_STREAM_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      return { success: false, error: sanitizeDimoAgentError(err) };
    }
  }
}
