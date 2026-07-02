import { Injectable, Logger } from '@nestjs/common';
import { LlmGatewayService } from '@modules/ai/llm/llm-gateway.service';
import {
  DtcResearchInput,
  DtcResearchOutput,
  DtcResearchPort,
  DtcResearchResponse,
} from './dtc-research.port';
import {
  buildDtcResearchJsonSchema,
  buildDtcResearchPrompt,
} from './dtc-ai-research.schema.util';
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

const MAX_LIST_ITEMS = 8;
const MAX_ITEM_CHARS = 200;
const MAX_TEXT_CHARS = 600;
const MAX_SOURCES = 5;
const MAX_TITLE_CHARS = 200;

/**
 * DTC research via Mistral AI Gateway structured JSON output.
 */
@Injectable()
export class DtcAiResearchService implements DtcResearchPort {
  private readonly logger = new Logger(DtcAiResearchService.name);

  constructor(private readonly llm: LlmGatewayService) {}

  isEnabled(): boolean {
    return this.llm.isConfigured();
  }

  async research(input: DtcResearchInput): Promise<DtcResearchResponse> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: 'AI provider not configured (MISTRAL_API_KEY missing)',
      };
    }

    const { system, user } = buildDtcResearchPrompt(input);

    try {
      const result = await this.llm.completeJson<Record<string, unknown>>({
        purpose: 'json',
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        schema: buildDtcResearchJsonSchema(input.mode),
        schemaName: 'synqdrive_dtc_research',
      });

      const data = this.parseAndSanitize(result.data, input.mode);
      if (!data) {
        return { success: false, error: 'AI returned no valid JSON knowledge' };
      }
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: this.sanitizeError(err) };
    }
  }

  private parseAndSanitize(
    parsed: Record<string, unknown> | null | undefined,
    mode: 'generic' | 'vehicle',
  ): DtcResearchOutput | null {
    if (!parsed || typeof parsed !== 'object') {
      this.logger.warn('[DtcResearch] Empty structured response');
      return null;
    }

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
      const url = this.text((s as Record<string, unknown>).url, 300);
      const title = this.text((s as Record<string, unknown>).title, MAX_TITLE_CHARS);
      const type = this.enumLike((s as Record<string, unknown>).type);
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
