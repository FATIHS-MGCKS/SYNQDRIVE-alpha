import { Injectable, Logger, Optional } from '@nestjs/common';
import { LlmGatewayService } from '../llm/llm-gateway.service';
import { ExternalAccessEnforcementService } from '@modules/data-authorizations/external-access-enforcement/external-access-enforcement.service';
import type {
  VehicleSpecAgentStep,
  VehicleSpecContext,
  VehicleSpecsResult,
  VehicleSpecStreamEmit,
} from './vehicle-spec-ai.types';
import {
  buildVehicleSpecJsonSchema,
  buildVehicleSpecPrompt,
  parseVehicleSpecJson,
  resolveVehicleSpecsScope,
} from './vehicle-spec-ai.schema.util';

const CONFIG_ERROR =
  'AI provider not configured (set MISTRAL_API_KEY and AI_PROVIDER=mistral)';

/**
 * Mistral-backed vehicle specification extraction.
 * DIMO tokenIds may be passed as context only — no DIMO Agents LLM calls.
 */
@Injectable()
export class VehicleSpecAiService {
  private readonly logger = new Logger(VehicleSpecAiService.name);

  constructor(
    private readonly llm: LlmGatewayService,
    @Optional() private readonly externalAccess?: ExternalAccessEnforcementService,
  ) {}

  isConfigured(): boolean {
    return this.llm.isConfigured();
  }

  async getVehicleSpecs(
    tokenIds?: number[],
    vehicle?: VehicleSpecContext,
    organizationId?: string,
  ): Promise<VehicleSpecsResult> {
    const steps: VehicleSpecAgentStep[] = [];

    if (!this.isConfigured()) {
      steps.push({
        step: 'Configuration check',
        status: 'error',
        detail: CONFIG_ERROR,
      });
      return { success: false, configFailure: true, error: 'Not configured', steps };
    }
    steps.push({ step: 'Configuration check', status: 'done', detail: 'AI provider OK' });

    if (organizationId && this.externalAccess) {
      const auth = await this.externalAccess.checkUseForAi({
        organizationId,
        channelKey: 'vehicle_spec_ai',
        correlationId: `vehicle-spec-ai:${organizationId}:${vehicle?.vin ?? 'unknown'}`,
      });
      if (!auth.mayProceed) {
        steps.push({
          step: 'Authorization check',
          status: 'error',
          detail: 'AI vehicle spec access is not authorized for this organization.',
        });
        return {
          success: false,
          error: 'AI vehicle spec access is not authorized for this organization.',
          steps,
        };
      }
    }

    const scope = resolveVehicleSpecsScope(tokenIds);
    steps.push({
      step: 'DIMO vehicle scope',
      status: 'done',
      detail: scope.hasVehicleScope
        ? `DIMO tokenId scoped (count=${scope.vehicleIds!.length})`
        : 'No DIMO tokenId — knowledge-only MMY fallback (no live telemetry)',
    });

    const queryStep: VehicleSpecAgentStep = {
      step: 'Sending specs request',
      status: 'done',
      detail: 'Mistral JSON structured output',
    };
    steps.push(queryStep);

    try {
      const { system, user } = buildVehicleSpecPrompt(vehicle, scope);
      const result = await this.llm.completeJson<Record<string, unknown>>({
        purpose: 'json',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: buildVehicleSpecJsonSchema(),
        schemaName: 'synqdrive_vehicle_specs',
      });

      const parseStep: VehicleSpecAgentStep = {
        step: 'Parsing AI response',
        status: 'done',
        detail: '',
      };
      steps.push(parseStep);

      const specs = parseVehicleSpecJson(result.data);
      const hasData = Object.values(specs).some((v) => v !== null);

      if (!hasData) {
        parseStep.detail = 'No structured specs extracted — raw response logged';
        this.logger.warn(
          `[VehicleSpecAI] Empty structured output: ${result.rawContent?.slice(0, 500)}`,
        );
      }

      return {
        success: true,
        providerId: this.llm.activeProviderId,
        specs,
        rawResponse: result.rawContent ?? JSON.stringify(result.data),
        steps,
        dimoVehicleConnected: scope.hasVehicleScope,
        knowledgeOnlyFallback: scope.knowledgeOnlyFallback,
      };
    } catch (err: unknown) {
      queryStep.status = 'error';
      queryStep.detail = this.sanitizeError(err);
      return { success: false, error: queryStep.detail, steps };
    }
  }

  async getVehicleSpecsStream(
    tokenIds: number[] | undefined,
    vehicle: VehicleSpecContext | undefined,
    emit: VehicleSpecStreamEmit,
    organizationId?: string,
  ): Promise<void> {
    if (!this.isConfigured()) {
      emit('step', { step: 'Configuration check', status: 'error', detail: CONFIG_ERROR });
      emit('error', { message: 'AI provider not configured', configFailure: true });
      return;
    }
    emit('step', { step: 'Konfiguration prüfen', status: 'done', detail: 'AI Provider OK' });

    if (organizationId && this.externalAccess) {
      const auth = await this.externalAccess.checkUseForAi({
        organizationId,
        channelKey: 'vehicle_spec_ai',
        correlationId: `vehicle-spec-ai-stream:${organizationId}:${vehicle?.vin ?? 'unknown'}`,
      });
      if (!auth.mayProceed) {
        emit('step', {
          step: 'Authorization check',
          status: 'error',
          detail: 'AI vehicle spec access is not authorized for this organization.',
        });
        emit('error', { message: 'AI vehicle spec access is not authorized for this organization.' });
        return;
      }
    }

    const scope = resolveVehicleSpecsScope(tokenIds);
    emit('step', {
      step: 'DIMO Fahrzeug-Scope',
      status: 'done',
      detail: scope.hasVehicleScope
        ? `DIMO tokenId aktiv (${scope.vehicleIds!.length})`
        : 'Kein DIMO tokenId — Wissensdatenbank-Fallback (keine Live-Telemetrie)',
    });

    emit('step', { step: 'Fahrzeugdaten abfragen', status: 'working', detail: 'Anfrage wird verarbeitet...' });
    emit('progress', { type: 'status', content: 'Strukturierte Spezifikationen werden abgerufen...' });

    try {
      const { system, user } = buildVehicleSpecPrompt(vehicle, scope);
      const result = await this.llm.completeJson<Record<string, unknown>>({
        purpose: 'json',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: buildVehicleSpecJsonSchema(),
        schemaName: 'synqdrive_vehicle_specs',
      });

      emit('step', { step: 'Fahrzeugdaten abfragen', status: 'done', detail: 'Antwort empfangen' });
      emit('step', { step: 'Daten verarbeiten', status: 'working' });

      const specs = parseVehicleSpecJson(result.data);
      const hasData = Object.values(specs).some((v) => v !== null);

      if (hasData) {
        emit('step', { step: 'Daten verarbeiten', status: 'done', detail: 'Spezifikationen extrahiert' });
      } else {
        emit('step', {
          step: 'Daten verarbeiten',
          status: 'done',
          detail: 'Keine strukturierten Daten — Rohantwort geloggt',
        });
        this.logger.warn(
          `[VehicleSpecAI] Stream empty structured output: ${result.rawContent?.slice(0, 500)}`,
        );
      }

      emit('result', {
        success: true,
        degraded: !hasData || scope.knowledgeOnlyFallback,
        knowledgeOnlyFallback: scope.knowledgeOnlyFallback,
        dimoVehicleConnected: scope.hasVehicleScope,
        agentId: this.llm.activeProviderId,
        specs,
      });
    } catch (err: unknown) {
      const message = this.sanitizeError(err);
      emit('step', { step: 'Fahrzeugdaten abfragen', status: 'error', detail: message });
      emit('error', { message });
    }
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
      .replace(/sk-[A-Za-z0-9]+/gi, 'sk-[redacted]')
      .slice(0, 300);
  }
}
