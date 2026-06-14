import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcEnrichmentJobData } from './dtc-knowledge.types';
import {
  DTC_RESEARCH_PORT,
  DtcResearchOutput,
  DtcResearchPort,
} from './dtc-research.port';

/**
 * Runs the actual AI/web research for a queued knowledge row and persists the
 * compact, sanitized result. Invoked by the BullMQ worker — idempotent (skips
 * rows already READY) and never deletes knowledge on failure (marks FAILED with
 * a short sanitized error so a manual retry can re-attempt later).
 */
@Injectable()
export class DtcKnowledgeEnrichmentService {
  private readonly logger = new Logger(DtcKnowledgeEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DTC_RESEARCH_PORT) private readonly research: DtcResearchPort,
  ) {}

  // ── Generic code enrichment ───────────────────────────────────────────────

  async enrichGeneric(data: DtcEnrichmentJobData): Promise<void> {
    const row = data.knowledgeId
      ? await this.prisma.dtcKnowledge.findUnique({ where: { id: data.knowledgeId } })
      : await this.prisma.dtcKnowledge.findUnique({
          where: {
            normalizedCode_language: {
              normalizedCode: data.normalizedCode,
              language: data.language,
            },
          },
        });

    if (!row) {
      this.logger.warn(`[DtcEnrich] generic row not found for ${data.normalizedCode}`);
      return;
    }
    if (row.enrichmentStatus === 'READY') return; // idempotent

    await this.prisma.dtcKnowledge.update({
      where: { id: row.id },
      data: { enrichmentStatus: 'PROCESSING', lastEnrichmentAttemptAt: new Date() },
    });

    const res = await this.research.research({
      code: row.code,
      normalizedCode: row.normalizedCode,
      language: row.language,
      mode: 'generic',
      systemCategory: row.systemCategory ?? undefined,
      standardType: row.standardType ?? undefined,
    });

    if (!res.success || !res.data) {
      await this.prisma.dtcKnowledge.update({
        where: { id: row.id },
        data: {
          enrichmentStatus: 'FAILED',
          enrichmentError: this.short(res.error ?? 'Enrichment failed'),
        },
      });
      this.logger.warn(`[DtcEnrich] generic ${row.normalizedCode} FAILED: ${this.short(res.error)}`);
      return;
    }

    const d = res.data;
    await this.prisma.dtcKnowledge.update({
      where: { id: row.id },
      data: {
        title: d.title ?? null,
        systemCategory: d.systemCategory ?? row.systemCategory,
        standardType: d.standardType ?? row.standardType,
        shortDescription: d.shortDescription ?? null,
        possibleCauses: this.json(d.possibleCauses),
        possibleEffects: this.json(d.possibleEffects),
        technicalUrgency: d.technicalUrgency ?? 'UNKNOWN',
        rentalUrgency: d.rentalUrgency ?? 'UNKNOWN',
        rentalRecommendation: d.rentalRecommendation ?? 'UNKNOWN',
        recommendedAction: d.recommendedAction ?? null,
        sourceType: d.sourceType ?? 'AI_GENERATED',
        sources: this.json(d.sources),
        enrichmentStatus: 'READY',
        aiGenerated: true,
        needsReview: d.needsReview === true,
        enrichmentError: null,
        lastVerifiedAt: new Date(),
      },
    });
    this.logger.log(`[DtcEnrich] generic ${row.normalizedCode} READY`);
  }

  // ── Vehicle-specific enrichment ───────────────────────────────────────────

  async enrichVehicle(data: DtcEnrichmentJobData): Promise<void> {
    if (!data.vehicleKnowledgeId) {
      this.logger.warn('[DtcEnrich] vehicle job missing vehicleKnowledgeId');
      return;
    }
    const row = await this.prisma.dtcVehicleKnowledge.findUnique({
      where: { id: data.vehicleKnowledgeId },
    });
    if (!row) {
      this.logger.warn(`[DtcEnrich] vehicle row not found: ${data.vehicleKnowledgeId}`);
      return;
    }
    if (row.enrichmentStatus === 'READY') return; // idempotent

    await this.prisma.dtcVehicleKnowledge.update({
      where: { id: row.id },
      data: { enrichmentStatus: 'PROCESSING', lastEnrichmentAttemptAt: new Date() },
    });

    const res = await this.research.research({
      code: row.code,
      normalizedCode: row.normalizedCode,
      language: row.language,
      mode: 'vehicle',
      vehicle: {
        make: row.make,
        model: row.model,
        year: row.year,
        fuelType: row.fuelType,
        engineCode: row.engineCode,
      },
    });

    if (!res.success || !res.data) {
      await this.prisma.dtcVehicleKnowledge.update({
        where: { id: row.id },
        data: {
          enrichmentStatus: 'FAILED',
          enrichmentError: this.short(res.error ?? 'Enrichment failed'),
        },
      });
      this.logger.warn(`[DtcEnrich] vehicle ${row.normalizedCode} FAILED: ${this.short(res.error)}`);
      return;
    }

    const d: DtcResearchOutput = res.data;
    await this.prisma.dtcVehicleKnowledge.update({
      where: { id: row.id },
      data: {
        vehicleSpecificTitle: d.vehicleSpecificTitle ?? d.title ?? null,
        vehicleSpecificDescription: d.vehicleSpecificDescription ?? d.shortDescription ?? null,
        vehicleSpecificEffects: this.json(
          d.vehicleSpecificEffects && d.vehicleSpecificEffects.length > 0
            ? d.vehicleSpecificEffects
            : d.possibleEffects,
        ),
        vehicleSpecificUrgency: d.vehicleSpecificUrgency ?? d.technicalUrgency ?? 'UNKNOWN',
        vehicleRentalRecommendation: d.vehicleRentalRecommendation ?? d.rentalRecommendation ?? 'UNKNOWN',
        recommendedAction: d.recommendedAction ?? null,
        sourceType: d.sourceType ?? 'AI_GENERATED',
        sources: this.json(d.sources),
        enrichmentStatus: 'READY',
        aiGenerated: true,
        needsReview: d.needsReview === true,
        enrichmentError: null,
        lastVerifiedAt: new Date(),
      },
    });
    this.logger.log(`[DtcEnrich] vehicle ${row.normalizedCode} (${row.make}/${row.model}/${row.year}) READY`);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private json(v: unknown): Prisma.InputJsonValue {
    return (v ?? []) as unknown as Prisma.InputJsonValue;
  }

  private short(err: string | undefined): string {
    return (err ?? 'Unknown error').slice(0, 300);
  }
}
