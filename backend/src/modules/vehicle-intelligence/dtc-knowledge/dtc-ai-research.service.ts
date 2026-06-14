import { Injectable, Logger } from '@nestjs/common';
import { DimoAgentsService } from '@modules/dimo/dimo-agents.service';
import {
  DtcResearchInput,
  DtcResearchOutput,
  DtcResearchPort,
  DtcResearchResponse,
} from './dtc-research.port';
import {
  DtcKnowledgeSourceRef,
  DtcRentalRecommendation,
  DtcUrgency,
} from './dtc-knowledge.types';

const URGENCY_VALUES: DtcUrgency[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'];
const RECOMMENDATION_VALUES: DtcRentalRecommendation[] = [
  'RENTABLE',
  'CHECK_BEFORE_NEXT_RENTAL',
  'BLOCK_UNTIL_INSPECTED',
  'DO_NOT_RENT',
  'UNKNOWN',
];

// Compactness caps — we persist only short summaries, never long transcripts.
const MAX_LIST_ITEMS = 8;
const MAX_ITEM_CHARS = 200;
const MAX_TEXT_CHARS = 600;
const MAX_SOURCES = 5;
const MAX_TITLE_CHARS = 200;

/**
 * DTC research adapter backed by the existing {@link DimoAgentsService} (DIMO
 * Agents API = web/AI JSON extraction). It reuses the public createAgent /
 * sendMessageStream methods and an internal agentId cache — it does NOT touch
 * existing DIMO auth, telemetry, polling, or trip logic.
 *
 * Strict JSON-only prompt, German user-facing text. The response is always
 * sanitized and length-capped before it leaves this service, so callers (and
 * the DB) only ever see compact, structured summaries — never raw HTML, long
 * source excerpts, prompts, or secrets.
 */
@Injectable()
export class DtcAiResearchService implements DtcResearchPort {
  private readonly logger = new Logger(DtcAiResearchService.name);
  private cachedAgentId: string | null = null;

  constructor(private readonly agents: DimoAgentsService) {}

  isEnabled(): boolean {
    return this.agents.isConfigured();
  }

  async research(input: DtcResearchInput): Promise<DtcResearchResponse> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'DIMO agent not configured (DIMO_API_KEY / DIMO_AGENT_USER_WALLET missing)',
      };
    }

    const message = this.buildPrompt(input);

    let response: string | null = null;
    try {
      response = await this.runWithAgent(message);
    } catch (err) {
      return { success: false, error: this.sanitizeError(err) };
    }
    if (!response) {
      return { success: false, error: 'Empty response from DIMO agent' };
    }

    const data = this.parseAndSanitize(response, input.mode);
    if (!data) {
      return { success: false, error: 'Agent returned no valid JSON knowledge' };
    }
    return { success: true, data };
  }

  // ── agent lifecycle (mirrors DimoDocumentAgentService, no DIMO changes) ────

  private async runWithAgent(message: string): Promise<string | null> {
    let agentId = this.cachedAgentId;
    if (!agentId) {
      const created = await this.agents.createAgent();
      if (!created.success || !created.agentId) {
        throw new Error(created.error || 'Agent creation failed');
      }
      agentId = created.agentId;
      this.cachedAgentId = agentId;
    }

    let result = await this.agents.sendMessageStream(agentId, message);

    if (!result.success && (result.statusCode === 404 || result.statusCode === 410)) {
      this.cachedAgentId = null;
      const created = await this.agents.createAgent();
      if (!created.success || !created.agentId) {
        throw new Error(created.error || 'Agent re-creation failed');
      }
      this.cachedAgentId = created.agentId;
      result = await this.agents.sendMessageStream(created.agentId, message);
    }

    if (!result.success) {
      throw new Error(
        result.error || `Agent request failed${result.statusCode ? ` (HTTP ${result.statusCode})` : ''}`,
      );
    }
    return result.response ?? null;
  }

  // ── prompt ────────────────────────────────────────────────────────────────

  private buildPrompt(input: DtcResearchInput): string {
    const isVehicle = input.mode === 'vehicle';
    const v = input.vehicle;
    const ctxLines = isVehicle && v
      ? [
          v.make ? `MAKE: ${v.make}` : '',
          v.model ? `MODEL: ${v.model}` : '',
          v.year ? `YEAR: ${v.year}` : '',
          v.fuelType ? `FUEL_TYPE: ${v.fuelType}` : '',
          v.engineCode ? `ENGINE_CODE: ${v.engineCode}` : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    const vehicleShape = isVehicle
      ? `,
  "vehicleSpecificTitle": null,
  "vehicleSpecificDescription": null,
  "vehicleSpecificEffects": [],
  "vehicleSpecificUrgency": "UNKNOWN",
  "vehicleRentalRecommendation": "UNKNOWN"`
      : '';

    return `You are an automotive diagnostics knowledge assistant for SynqDrive, a fleet/rental (Autovermietung) platform.
Research the OBD-II diagnostic trouble code (DTC) below and return concise, structured knowledge.

DTC_CODE: ${input.normalizedCode}
${input.systemCategory ? `SYSTEM_CATEGORY_HINT: ${input.systemCategory}\n` : ''}${input.standardType ? `STANDARD_TYPE_HINT: ${input.standardType}\n` : ''}${ctxLines ? `VEHICLE_CONTEXT:\n${ctxLines}\n` : ''}
Return ONLY this JSON shape (no markdown, no prose, no text outside the JSON):
{
  "code": "${input.normalizedCode}",
  "title": null,
  "standardType": "GENERIC",
  "systemCategory": "POWERTRAIN",
  "shortDescription": null,
  "possibleCauses": [],
  "possibleEffects": [],
  "technicalUrgency": "UNKNOWN",
  "rentalUrgency": "UNKNOWN",
  "rentalRecommendation": "UNKNOWN",
  "recommendedAction": null,
  "sourceType": "MIXED",
  "sources": [],
  "needsReview": false${vehicleShape}
}

Rules:
- return ONLY valid JSON, nothing else — no markdown, no explanations
- write all user-facing text (title, descriptions, causes, effects, recommendations) in GERMAN
- be concise: short phrases, not paragraphs; max 6 causes and 6 effects
- do NOT invent facts; if unsure, set "needsReview": true
- clearly distinguish the generic OBD-II meaning from any vehicle-specific interpretation
- standardType: one of GENERIC, MANUFACTURER_SPECIFIC, UNKNOWN
- systemCategory: one of POWERTRAIN, BODY, CHASSIS, NETWORK, UNKNOWN
- technicalUrgency / rentalUrgency: one of LOW, MEDIUM, HIGH, CRITICAL, UNKNOWN
- rentalRecommendation: one of RENTABLE, CHECK_BEFORE_NEXT_RENTAL, BLOCK_UNTIL_INSPECTED, DO_NOT_RENT, UNKNOWN
- rentalRecommendation must be practical for a rental/fleet operator
- sources: max 5 items, each { "type": "WEB", "title": "...", "url": "..." } — credible sources only, no long excerpts
- no field-level confidence, no raw HTML, no copyrighted long text${
      isVehicle
        ? '\n- if the code is manufacturer-specific and vehicle context is insufficient, set "needsReview": true and keep vehicle-specific fields conservative'
        : ''
    }`;
  }

  // ── parse + sanitize (keeps only compact summaries) ────────────────────────

  private parseAndSanitize(text: string, mode: 'generic' | 'vehicle'): DtcResearchOutput | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      this.logger.warn('[DtcResearch] No JSON block found in agent response');
      return null;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      this.logger.warn('[DtcResearch] Failed to parse agent JSON');
      return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;

    const out: DtcResearchOutput = {
      title: this.text(parsed.title, MAX_TITLE_CHARS),
      standardType: this.enumLike(parsed.standardType),
      systemCategory: this.enumLike(parsed.systemCategory),
      shortDescription: this.text(parsed.shortDescription, MAX_TEXT_CHARS),
      possibleCauses: this.list(parsed.possibleCauses),
      possibleEffects: this.list(parsed.possibleEffects),
      technicalUrgency: this.urgency(parsed.technicalUrgency),
      rentalUrgency: this.urgency(parsed.rentalUrgency),
      rentalRecommendation: this.recommendation(parsed.rentalRecommendation),
      recommendedAction: this.text(parsed.recommendedAction, MAX_TEXT_CHARS),
      sourceType: this.enumLike(parsed.sourceType),
      sources: this.sources(parsed.sources),
      needsReview: parsed.needsReview === true,
    };

    if (mode === 'vehicle') {
      out.vehicleSpecificTitle = this.text(parsed.vehicleSpecificTitle, MAX_TITLE_CHARS);
      out.vehicleSpecificDescription = this.text(parsed.vehicleSpecificDescription, MAX_TEXT_CHARS);
      out.vehicleSpecificEffects = this.list(parsed.vehicleSpecificEffects);
      out.vehicleSpecificUrgency = this.urgency(parsed.vehicleSpecificUrgency);
      out.vehicleRentalRecommendation = this.recommendation(parsed.vehicleRentalRecommendation);
    }

    // Require at least a usable description or title to count as valid knowledge.
    const hasContent =
      !!out.shortDescription ||
      !!out.title ||
      (out.possibleCauses?.length ?? 0) > 0 ||
      (mode === 'vehicle' && (!!out.vehicleSpecificDescription || !!out.vehicleSpecificTitle));
    if (!hasContent) return null;

    return out;
  }

  private text(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    if (!t || t.toLowerCase() === 'null' || t.toLowerCase() === 'n/a') return null;
    return t.slice(0, max);
  }

  private list(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .slice(0, MAX_LIST_ITEMS)
      .map((x) => x.slice(0, MAX_ITEM_CHARS));
  }

  private enumLike(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim().toUpperCase();
    return t ? t.slice(0, 40) : null;
  }

  private urgency(v: unknown): DtcUrgency {
    const t = typeof v === 'string' ? (v.trim().toUpperCase() as DtcUrgency) : 'UNKNOWN';
    return URGENCY_VALUES.includes(t) ? t : 'UNKNOWN';
  }

  private recommendation(v: unknown): DtcRentalRecommendation {
    const t =
      typeof v === 'string' ? (v.trim().toUpperCase() as DtcRentalRecommendation) : 'UNKNOWN';
    return RECOMMENDATION_VALUES.includes(t) ? t : 'UNKNOWN';
  }

  private sources(v: unknown): DtcKnowledgeSourceRef[] {
    if (!Array.isArray(v)) return [];
    const out: DtcKnowledgeSourceRef[] = [];
    for (const s of v) {
      if (!s || typeof s !== 'object') continue;
      const url = this.text((s as any).url, 300);
      const title = this.text((s as any).title, MAX_TITLE_CHARS);
      const type = this.enumLike((s as any).type);
      // Only keep http(s) URLs; drop anything that looks like a raw excerpt.
      const safeUrl = url && /^https?:\/\//i.test(url) ? url : undefined;
      if (!safeUrl && !title) continue;
      out.push({
        type: type ?? 'WEB',
        title: title ?? undefined,
        url: safeUrl,
      });
      if (out.length >= MAX_SOURCES) break;
    }
    return out;
  }

  private sanitizeError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]').slice(0, 300);
  }
}
