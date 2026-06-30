import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentExtractionConfig from '@config/document-extraction.config';
import { DimoAgentsService } from './dimo-agents.service';
import {
  formatAgentScopeLog,
  normalizeAgentVehicleIds,
} from './dimo-agent-vehicle-scope.util';

/** Minimal field descriptor (kept local so DIMO has no dep on document-extraction). */
export interface DocAgentField {
  key: string;
  label: string;
  type: string;
  enumValues?: string[];
}

export interface DocAgentVehicleContext {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  licensePlate?: string;
  lastKnownOdometerKm?: number;
}

export interface DocAgentExtractInput {
  documentType: string;
  fields: DocAgentField[];
  rawText: string;
  vehicleContext?: DocAgentVehicleContext;
  dimoTokenId?: number;
}

export interface DocAgentExtractResult {
  success: boolean;
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes: string[];
  dimoContextAvailable: boolean;
  agentId?: string;
  error?: string;
}

const MAX_DOC_TEXT_CHARS = 12000;

/**
 * Vehicle-aware document extraction layer built on top of the existing
 * {@link DimoAgentsService}. It does NOT modify any existing DIMO behaviour:
 * it reuses getOrCreateAgent / sendMessageStream with a document_extraction scope.
 *
 * DIMO Agents are not a raw OCR/parse API — text is always extracted first
 * (see DocumentTextExtractorService) and only text + structured instructions are
 * sent here. The agent's vehicle/telemetry awareness is used for plausibility
 * context only, never to invent document values.
 *
 * Secrets (JWTs, API keys, wallets) and document contents are never logged.
 */
@Injectable()
export class DimoDocumentAgentService {
  private readonly logger = new Logger(DimoDocumentAgentService.name);
  private lastAgentId: string | null = null;

  constructor(
    private readonly agents: DimoAgentsService,
    @Optional()
    @Inject(documentExtractionConfig.KEY)
    private readonly conf?: ConfigType<typeof documentExtractionConfig>,
  ) {}

  /** Whether the agent layer can run (enabled + DIMO agent credentials present). */
  isEnabled(): boolean {
    const enabled = this.conf?.dimoAgentEnabled ?? true;
    return enabled && this.agents.isConfigured();
  }

  async extract(input: DocAgentExtractInput): Promise<DocAgentExtractResult> {
    const dimoContextAvailable = typeof input.dimoTokenId === 'number';

    if (!this.isEnabled()) {
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: [],
        dimoContextAvailable,
        error: 'DIMO document agent is not configured (DIMO_API_KEY / DIMO_AGENT_USER_WALLET missing or disabled)',
      };
    }

    const message = this.buildPrompt(input);
    const vehicleIds = normalizeAgentVehicleIds(
      dimoContextAvailable ? [input.dimoTokenId as number] : undefined,
    );
    this.logger.log(
      `[DocAgent] ${formatAgentScopeLog({ useCase: 'document_extraction' }, vehicleIds)}`,
    );

    let response: string | null = null;
    try {
      response = await this.runWithAgent(message, vehicleIds);
    } catch (err) {
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: [],
        dimoContextAvailable,
        error: this.sanitizeError(err),
      };
    }

    if (!response) {
      return {
        success: false,
        fields: {},
        recommendedHumanReviewNotes: [],
        dimoContextAvailable,
        error: 'Empty response from DIMO agent',
      };
    }

    const parsed = this.parseAgentJson(response, input.fields);
    return {
      success: true,
      fields: parsed.fields,
      recommendedHumanReviewNotes: parsed.notes,
      dimoContextAvailable,
      agentId: this.lastAgentId ?? undefined,
    };
  }

  // ── agent lifecycle (reuses existing public DimoAgentsService methods) ───

  private async runWithAgent(message: string, vehicleIds?: number[]): Promise<string | null> {
    const scope = {
      useCase: 'document_extraction' as const,
      vehicleIds,
    };

    const created = await this.agents.getOrCreateAgent(scope);
    if (!created.success || !created.agentId) {
      throw new Error(created.error || 'Agent creation failed');
    }
    let agentId = created.agentId;
    this.lastAgentId = agentId;

    const streamContext = { useCase: 'document_extraction' as const };
    let result = await this.agents.sendMessageStream(
      agentId,
      message,
      vehicleIds,
      undefined,
      streamContext,
    );

    // Agent expired — invalidate scoped cache once and retry.
    if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
      await this.agents.invalidateAgentCache(scope);
      const recreated = await this.agents.getOrCreateAgent(scope);
      if (!recreated.success || !recreated.agentId) {
        throw new Error(recreated.error || 'Agent re-creation failed');
      }
      agentId = recreated.agentId;
      this.lastAgentId = agentId;
      result = await this.agents.sendMessageStream(
        agentId,
        message,
        vehicleIds,
        undefined,
        streamContext,
      );
    }

    if (!result.success) {
      throw new Error(result.error || `Agent request failed${result.statusCode ? ` (HTTP ${result.statusCode})` : ''}`);
    }
    return result.response ?? null;
  }

  // ── prompt + parsing ─────────────────────────────────────────────────────

  private buildPrompt(input: DocAgentExtractInput): string {
    const ctx = input.vehicleContext;
    const ctxLines = ctx
      ? [
          ctx.vin ? `VIN: ${ctx.vin}` : '',
          ctx.licensePlate ? `LICENSE_PLATE: ${ctx.licensePlate}` : '',
          ctx.make ? `MAKE: ${ctx.make}` : '',
          ctx.model ? `MODEL: ${ctx.model}` : '',
          ctx.year ? `YEAR: ${ctx.year}` : '',
          ctx.fuelType ? `FUEL_TYPE: ${ctx.fuelType}` : '',
          ctx.lastKnownOdometerKm != null ? `LAST_KNOWN_ODOMETER_KM: ${Math.round(ctx.lastKnownOdometerKm)}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const fieldsSpec = input.fields
      .map((f) => {
        const enumPart = f.enumValues?.length ? ` (one of: ${f.enumValues.join(', ')})` : '';
        return `- "${f.key}": ${f.type}${enumPart} — ${f.label}`;
      })
      .join('\n');

    const fieldKeysJson = JSON.stringify(
      this.buildEmptyShape(input.fields),
      null,
      2,
    );

    const text = (input.rawText || '').slice(0, MAX_DOC_TEXT_CHARS);

    return `You are extracting structured vehicle service/rental document data for SynqDrive.
Return only valid JSON. No markdown. No explanations. No confidence fields.
If a field is not present, return null. Do not invent values.
Use the provided vehicle context and DIMO telemetry only for plausibility checks, not for inventing document values.
Human confirmation will happen later.

DOCUMENT_TYPE: ${input.documentType}

${ctxLines ? `VEHICLE_CONTEXT (for plausibility only, do not copy into fields):\n${ctxLines}\n\n` : ''}EXPECTED_FIELDS:
${fieldsSpec}

DOCUMENT_TEXT (verbatim OCR/extracted text):
"""
${text}
"""

Return ONLY this JSON shape (fill "fields" from the document text; use null when not present):
{
  "documentType": "${input.documentType}",
  "fields": ${fieldKeysJson},
  "plausibility": {
    "overallStatus": "OK",
    "checks": []
  },
  "recommendedHumanReviewNotes": []
}

Rules:
- return ONLY valid JSON, nothing else
- no field-level confidence anywhere
- numbers must be plain numbers without units or thousands separators
- dates as ISO YYYY-MM-DD when possible
- never fabricate values that are not present in the document text`;
  }

  private buildEmptyShape(fields: DocAgentField[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.key.includes('.')) {
        const [parent, child] = f.key.split('.');
        const obj = (out[parent] as Record<string, unknown>) ?? {};
        obj[child] = null;
        out[parent] = obj;
      } else {
        out[f.key] = null;
      }
    }
    return out;
  }

  private parseAgentJson(
    text: string,
    schema: DocAgentField[],
  ): { fields: Record<string, unknown>; notes: string[] } {
    const empty = this.buildEmptyShape(schema);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      this.logger.warn('[DocAgent] No JSON block found in agent response');
      return { fields: empty, notes: [] };
    }
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      this.logger.warn('[DocAgent] Failed to parse agent JSON response');
      return { fields: empty, notes: [] };
    }

    const source =
      parsed && typeof parsed.fields === 'object' && parsed.fields !== null
        ? parsed.fields
        : parsed;

    const result: Record<string, unknown> = {};
    for (const f of schema) {
      if (f.key.includes('.')) {
        const [parent, child] = f.key.split('.');
        const obj = (result[parent] as Record<string, unknown>) ?? {};
        const srcParent = (source?.[parent] ?? {}) as Record<string, unknown>;
        obj[child] = this.normalizeValue(srcParent?.[child]);
        result[parent] = obj;
      } else {
        result[f.key] = this.normalizeValue(source?.[f.key]);
      }
    }

    const notes = Array.isArray(parsed?.recommendedHumanReviewNotes)
      ? parsed.recommendedHumanReviewNotes
          .filter((n: unknown) => typeof n === 'string')
          .slice(0, 20)
      : [];

    return { fields: result, notes };
  }

  private normalizeValue(v: unknown): unknown {
    if (v === undefined) return null;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'n/a') {
        return null;
      }
      return trimmed;
    }
    return v;
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // Strip anything that could resemble a token/secret; keep it short.
    return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').slice(0, 300);
  }
}
