import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DtcKnowledge, DtcVehicleKnowledge, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  getDtcStandardType,
  getDtcSystemCategory,
  normalizeDtcCode,
} from './dtc-knowledge.util';
import {
  DtcEnrichmentJobData,
  DtcKnowledgeDto,
  DtcKnowledgeSourceRef,
  DtcRentalRecommendation,
  DtcUrgency,
  DtcVehicleContext,
  DTC_ENRICHMENT_JOB,
  NON_REQUEUEABLE_STATUSES,
  DTC_PROCESSING_STALE_MS,
} from './dtc-knowledge.types';

const PENDING_MESSAGE = 'AI-Erklärung wird vorbereitet.';
const FAILED_MESSAGE = 'Erklärung konnte noch nicht erstellt werden.';
const MISSING_MESSAGE = 'Noch keine Erklärung vorhanden.';

/**
 * Orchestrates the DTC Knowledge Base: lookup, placeholder creation, dedup-safe
 * enqueue, and building the lightweight DTO attached to active DTCs.
 *
 * Job/queue state lives in the `enrichmentStatus` columns — there is NO separate
 * job table. Enqueue is idempotent (stable jobId + status guard). This service
 * never calls the AI directly; the worker does, via the enrichment service.
 */
@Injectable()
export class DtcKnowledgeService {
  private readonly logger = new Logger(DtcKnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT) private readonly queue: Queue,
  ) {}

  normalizeDtcCode(code: string | null | undefined): string | null {
    return normalizeDtcCode(code);
  }

  // ── Read-only lookup (no enqueue) — used for history rows ─────────────────

  /**
   * Returns READY generic knowledge for a set of codes, keyed by normalizedCode.
   * Used to cheaply attach existing knowledge to history rows WITHOUT enqueuing.
   */
  async getReadyGenericByCodes(
    rawCodes: string[],
    language = 'de',
  ): Promise<Map<string, DtcKnowledgeDto>> {
    const normalized = Array.from(
      new Set(rawCodes.map((c) => normalizeDtcCode(c)).filter((c): c is string => !!c)),
    );
    const out = new Map<string, DtcKnowledgeDto>();
    if (normalized.length === 0) return out;

    const rows = await this.prisma.dtcKnowledge.findMany({
      where: { normalizedCode: { in: normalized }, language, enrichmentStatus: 'READY' },
    });
    for (const row of rows) {
      out.set(row.normalizedCode, this.buildGenericReadyDto(row));
    }
    return out;
  }

  // ── Active fault path: ensure enrichment + return DTO ─────────────────────

  /**
   * For an active fault: ensures generic (and, when vehicle context is
   * sufficient, vehicle-specific) placeholders exist and are queued, then
   * returns the best available knowledge DTO. Never throws — on any failure it
   * degrades to a MISSING DTO so the DTC itself always renders.
   */
  async getOrQueueForActiveFault(
    rawCode: string,
    vehicle: DtcVehicleContext,
    language = 'de',
  ): Promise<DtcKnowledgeDto> {
    try {
      const normalizedCode = normalizeDtcCode(rawCode);
      if (!normalizedCode) {
        // Invalid DTC pattern — never enrich / call AI.
        return { status: 'MISSING', source: 'MISSING', message: MISSING_MESSAGE };
      }
      await this.ensureEnrichmentQueued(normalizedCode, rawCode, vehicle, language, false);
      return this.buildDto(normalizedCode, vehicle, language);
    } catch (err) {
      this.logger.warn(
        `[DtcKnowledge] getOrQueueForActiveFault failed for ${rawCode}: ${(err as Error).message}`,
      );
      return { status: 'MISSING', source: 'MISSING', message: MISSING_MESSAGE };
    }
  }

  /**
   * Manual retry (admin/internal). Re-queues even FAILED rows and returns the
   * refreshed DTO. Invalid codes are never enriched.
   */
  async retry(
    rawCode: string,
    vehicle: DtcVehicleContext,
    language = 'de',
  ): Promise<DtcKnowledgeDto> {
    const normalizedCode = normalizeDtcCode(rawCode);
    if (!normalizedCode) {
      return { status: 'MISSING', source: 'MISSING', message: MISSING_MESSAGE };
    }
    await this.ensureEnrichmentQueued(normalizedCode, rawCode, vehicle, language, true);
    return this.buildDto(normalizedCode, vehicle, language);
  }

  /**
   * Ensures placeholders exist and enqueues enrichment when appropriate.
   *  - generic placeholder always (for valid codes)
   *  - vehicle-specific placeholder only when make+model+year are present
   *  - auto path (requeueFailed=false): only MISSING is queued, so codes that
   *    keep failing are NOT retried on every modal open (avoids AI spam).
   *  - retry path (requeueFailed=true): FAILED is reset to QUEUED too.
   */
  async ensureEnrichmentQueued(
    normalizedCode: string,
    rawCode: string,
    vehicle: DtcVehicleContext,
    language = 'de',
    requeueFailed = false,
  ): Promise<void> {
    const generic = await this.upsertGenericPlaceholder(normalizedCode, rawCode, language);
    await this.maybeQueueGeneric(generic, language, requeueFailed);

    if (this.hasVehicleContext(vehicle)) {
      const vk = await this.upsertVehiclePlaceholder(
        normalizedCode,
        rawCode,
        vehicle,
        language,
        generic.id,
      );
      await this.maybeQueueVehicle(vk, vehicle, language, requeueFailed);
    }
  }

  // ── Placeholders ──────────────────────────────────────────────────────────

  private async upsertGenericPlaceholder(
    normalizedCode: string,
    rawCode: string,
    language: string,
  ): Promise<DtcKnowledge> {
    const existing = await this.prisma.dtcKnowledge.findUnique({
      where: { normalizedCode_language: { normalizedCode, language } },
    });
    if (existing) return existing;

    try {
      return await this.prisma.dtcKnowledge.create({
        data: {
          code: rawCode.trim().toUpperCase(),
          normalizedCode,
          language,
          systemCategory: getDtcSystemCategory(normalizedCode),
          standardType: getDtcStandardType(normalizedCode),
          enrichmentStatus: 'MISSING',
        },
      });
    } catch (err) {
      // Concurrent create — fall back to the row the other request created.
      const row = await this.prisma.dtcKnowledge.findUnique({
        where: { normalizedCode_language: { normalizedCode, language } },
      });
      if (row) return row;
      throw err;
    }
  }

  private async upsertVehiclePlaceholder(
    normalizedCode: string,
    rawCode: string,
    vehicle: DtcVehicleContext,
    language: string,
    dtcKnowledgeId: string,
  ): Promise<DtcVehicleKnowledge> {
    const where: Prisma.DtcVehicleKnowledgeWhereInput = {
      normalizedCode,
      language,
      make: vehicle.make ?? null,
      model: vehicle.model ?? null,
      year: vehicle.year ?? null,
      fuelType: vehicle.fuelType ?? null,
    };
    const existing = await this.prisma.dtcVehicleKnowledge.findFirst({ where });
    if (existing) return existing;

    return this.prisma.dtcVehicleKnowledge.create({
      data: {
        dtcKnowledgeId,
        code: rawCode.trim().toUpperCase(),
        normalizedCode,
        language,
        make: vehicle.make ?? null,
        model: vehicle.model ?? null,
        year: vehicle.year ?? null,
        fuelType: vehicle.fuelType ?? null,
        engineCode: vehicle.engineCode ?? null,
        enrichmentStatus: 'MISSING',
      },
    });
  }

  // ── Enqueue (dedup-safe) ──────────────────────────────────────────────────

  private async maybeQueueGeneric(
    generic: DtcKnowledge,
    language: string,
    requeueFailed: boolean,
  ): Promise<void> {
    if (!this.shouldQueue(generic.enrichmentStatus, requeueFailed, generic.lastEnrichmentAttemptAt)) return;

    await this.prisma.dtcKnowledge.update({
      where: { id: generic.id },
      data: { enrichmentStatus: 'QUEUED', enrichmentError: null },
    });

    const data: DtcEnrichmentJobData = {
      knowledgeId: generic.id,
      code: generic.code,
      normalizedCode: generic.normalizedCode,
      language,
    };
    await this.enqueue(DTC_ENRICHMENT_JOB.GENERIC, data, `generic:${generic.normalizedCode}:${language}`);
  }

  private async maybeQueueVehicle(
    vk: DtcVehicleKnowledge,
    vehicle: DtcVehicleContext,
    language: string,
    requeueFailed: boolean,
  ): Promise<void> {
    if (!this.shouldQueue(vk.enrichmentStatus, requeueFailed, vk.lastEnrichmentAttemptAt)) return;

    await this.prisma.dtcVehicleKnowledge.update({
      where: { id: vk.id },
      data: { enrichmentStatus: 'QUEUED', enrichmentError: null },
    });

    const data: DtcEnrichmentJobData = {
      vehicleKnowledgeId: vk.id,
      knowledgeId: vk.dtcKnowledgeId ?? undefined,
      code: vk.code,
      normalizedCode: vk.normalizedCode,
      language,
      make: vehicle.make ?? null,
      model: vehicle.model ?? null,
      year: vehicle.year ?? null,
      fuelType: vehicle.fuelType ?? null,
      engineCode: vehicle.engineCode ?? null,
    };
    const jobId = `vehicle:${vk.normalizedCode}:${vehicle.make ?? ''}:${vehicle.model ?? ''}:${vehicle.year ?? ''}:${vehicle.fuelType ?? ''}:${language}`;
    await this.enqueue(DTC_ENRICHMENT_JOB.VEHICLE, data, jobId);
  }

  private shouldQueue(
    status: string,
    requeueFailed: boolean,
    lastEnrichmentAttemptAt?: Date | null,
  ): boolean {
    if (status === 'PROCESSING') {
      const last = lastEnrichmentAttemptAt?.getTime() ?? 0;
      const stale = !last || Date.now() - last > DTC_PROCESSING_STALE_MS;
      return stale;
    }
    if (NON_REQUEUEABLE_STATUSES.includes(status as any)) return false;
    if (status === 'FAILED' && !requeueFailed) return false;
    return true; // MISSING (always) or FAILED (only on explicit retry)
  }

  private async enqueue(
    name: string,
    data: DtcEnrichmentJobData,
    jobId: string,
  ): Promise<void> {
    try {
      await this.queue.add(name, data, {
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 50,
      });
    } catch (err) {
      this.logger.warn(`[DtcKnowledge] enqueue ${name} (${jobId}) failed: ${(err as Error).message}`);
    }
  }

  // ── DTO building ──────────────────────────────────────────────────────────

  private async buildDto(
    normalizedCode: string,
    vehicle: DtcVehicleContext,
    language: string,
  ): Promise<DtcKnowledgeDto> {
    const generic = await this.prisma.dtcKnowledge.findUnique({
      where: { normalizedCode_language: { normalizedCode, language } },
    });

    let vk: DtcVehicleKnowledge | null = null;
    if (this.hasVehicleContext(vehicle)) {
      vk = await this.prisma.dtcVehicleKnowledge.findFirst({
        where: {
          normalizedCode,
          language,
          make: vehicle.make ?? null,
          model: vehicle.model ?? null,
          year: vehicle.year ?? null,
          fuelType: vehicle.fuelType ?? null,
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    // 1) Vehicle-specific READY wins.
    if (vk?.enrichmentStatus === 'READY') {
      return this.buildVehicleReadyDto(vk, generic);
    }
    // 2) Generic READY.
    if (generic?.enrichmentStatus === 'READY') {
      return this.buildGenericReadyDto(generic);
    }
    // 3..6) Pending / failed / missing across both rows.
    const statuses = [generic?.enrichmentStatus, vk?.enrichmentStatus].filter(Boolean) as string[];
    if (statuses.includes('PROCESSING')) {
      return { status: 'PROCESSING', source: 'PENDING', message: PENDING_MESSAGE };
    }
    if (statuses.includes('QUEUED')) {
      return { status: 'QUEUED', source: 'PENDING', message: PENDING_MESSAGE };
    }
    if (statuses.includes('FAILED')) {
      return { status: 'FAILED', source: 'FAILED', message: FAILED_MESSAGE };
    }
    return { status: 'MISSING', source: 'MISSING', message: MISSING_MESSAGE };
  }

  private buildGenericReadyDto(g: DtcKnowledge): DtcKnowledgeDto {
    return {
      status: 'READY',
      source: 'GENERIC',
      title: g.title,
      shortDescription: g.shortDescription,
      possibleCauses: this.asStringArray(g.possibleCauses),
      possibleEffects: this.asStringArray(g.possibleEffects),
      technicalUrgency: (g.technicalUrgency as DtcUrgency) ?? 'UNKNOWN',
      rentalUrgency: (g.rentalUrgency as DtcUrgency) ?? 'UNKNOWN',
      rentalRecommendation: (g.rentalRecommendation as DtcRentalRecommendation) ?? 'UNKNOWN',
      recommendedAction: g.recommendedAction,
      sources: this.asSources(g.sources),
      lastVerifiedAt: g.lastVerifiedAt?.toISOString() ?? null,
      needsReview: g.needsReview,
      aiGenerated: g.aiGenerated,
      sourceType: g.sourceType,
    };
  }

  private buildVehicleReadyDto(vk: DtcVehicleKnowledge, g: DtcKnowledge | null): DtcKnowledgeDto {
    const vehEffects = this.asStringArray(vk.vehicleSpecificEffects);
    return {
      status: 'READY',
      source: 'VEHICLE_SPECIFIC',
      title: vk.vehicleSpecificTitle ?? g?.title ?? null,
      shortDescription: vk.vehicleSpecificDescription ?? g?.shortDescription ?? null,
      // Causes are only stored at the generic level.
      possibleCauses: this.asStringArray(g?.possibleCauses ?? null),
      possibleEffects: vehEffects.length > 0 ? vehEffects : this.asStringArray(g?.possibleEffects ?? null),
      technicalUrgency:
        (vk.vehicleSpecificUrgency as DtcUrgency) ?? (g?.technicalUrgency as DtcUrgency) ?? 'UNKNOWN',
      rentalUrgency: (g?.rentalUrgency as DtcUrgency) ?? 'UNKNOWN',
      rentalRecommendation:
        (vk.vehicleRentalRecommendation as DtcRentalRecommendation) ??
        (g?.rentalRecommendation as DtcRentalRecommendation) ??
        'UNKNOWN',
      recommendedAction: vk.recommendedAction ?? g?.recommendedAction ?? null,
      sources: this.asSources(vk.sources ?? g?.sources ?? null),
      lastVerifiedAt: (vk.lastVerifiedAt ?? g?.lastVerifiedAt)?.toISOString() ?? null,
      needsReview: vk.needsReview || (g?.needsReview ?? false),
      aiGenerated: vk.aiGenerated ?? g?.aiGenerated ?? false,
      sourceType: vk.sourceType ?? g?.sourceType ?? null,
    };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private hasVehicleContext(v: DtcVehicleContext): boolean {
    return Boolean(v?.make && v?.model && v?.year);
  }

  private asStringArray(json: Prisma.JsonValue | null | undefined): string[] {
    if (!Array.isArray(json)) return [];
    return json.filter((x): x is string => typeof x === 'string');
  }

  private asSources(json: Prisma.JsonValue | null | undefined): DtcKnowledgeSourceRef[] {
    if (!Array.isArray(json)) return [];
    const out: DtcKnowledgeSourceRef[] = [];
    for (const item of json) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const s = item as Record<string, unknown>;
      out.push({
        type: typeof s.type === 'string' ? s.type : undefined,
        title: typeof s.title === 'string' ? s.title : undefined,
        url: typeof s.url === 'string' ? s.url : undefined,
      });
    }
    return out;
  }
}
