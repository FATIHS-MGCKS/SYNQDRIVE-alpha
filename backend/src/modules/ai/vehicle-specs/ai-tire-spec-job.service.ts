import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TireSpecAiService } from './tire-spec-ai.service';
import { AiTireSpec } from '../../vehicle-intelligence/tires/tire-health.config';
import {
  normalizeAiTireSpecResult,
  validateAiTireSpec,
  buildPersistedAiTireSpec,
} from '../../vehicle-intelligence/tires/ai-tire-spec-normalizer';
import { TireSetupStatus } from '@prisma/client';
import { buildAiTireSpecApplySetupUpdate } from '../../vehicle-intelligence/tires/ai-tire-spec-apply.util';
import { normalizeTireSpecConfidenceScore } from '../../vehicle-intelligence/tires/ai-tire-spec-confidence.util';

function mapTireSpecAliases(
  raw: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  return {
    ...raw,
    legalMinimumMm: raw.legalMinimumMm ?? raw.legalMinTreadDepthMm,
    recommendedReplacementDepthMm:
      raw.recommendedReplacementDepthMm ?? raw.practicalReplacementDepthMm,
    operationalReplacementDepthMm:
      raw.operationalReplacementDepthMm ?? raw.winterRecommendedMinDepthMm,
  };
}

// ── Input DTO ─────────────────────────────────────────────────────────────────
export interface StartAiTireSpecJobInput {
  brand: string;
  model: string;
  year: number;
  tireSize: string;
  loadIndex: string;
  speedIndex: string;
  vehicleId?: string;
  tireSetupId?: string;
}

export interface ApplyAiTireSpecJobOptions {
  organizationId: string;
  /** Owner confirmed catalog/spec match — does not confirm measured tread depth. */
  userConfirmedSpec?: boolean;
}

// ── Status response DTO ───────────────────────────────────────────────────────
export interface AiTireSpecJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  confidenceScore: number | null;
  result: AiTireSpec | null;
  resultReady: boolean;
  input: {
    brand: string;
    model: string;
    year: number;
    tireSize: string;
    loadIndex: string;
    speedIndex: string;
  };
}

// ── Apply response DTO ────────────────────────────────────────────────────────
export interface AiTireSpecApplyResult {
  success: boolean;
  setupId?: string;
  appliedFields?: string[];
  message?: string;
  idempotentReplay?: boolean;
}

@Injectable()
export class AiTireSpecJobService {
  private readonly logger = new Logger(AiTireSpecJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tireSpecAi: TireSpecAiService,
  ) {}

  // ── Start a new job ─────────────────────────────────────────────────────────

  async startJob(input: StartAiTireSpecJobInput): Promise<{ jobId: string; status: string }> {
    if (!input.brand?.trim()) throw new BadRequestException('brand is required');
    if (!input.model?.trim()) throw new BadRequestException('model is required');
    if (!input.year || input.year < 1900 || input.year > 2100) throw new BadRequestException('year must be between 1900 and 2100');
    if (!input.tireSize?.trim()) throw new BadRequestException('tireSize is required');
    if (!input.loadIndex?.trim()) throw new BadRequestException('loadIndex is required');
    if (!input.speedIndex?.trim()) throw new BadRequestException('speedIndex is required');

    const job = await this.prisma.aiTireSpecJob.create({
      data: {
        brand: input.brand.trim(),
        model: input.model.trim(),
        year: input.year,
        tireSize: input.tireSize.trim(),
        loadIndex: input.loadIndex.trim(),
        speedIndex: input.speedIndex.trim(),
        vehicleId: input.vehicleId ?? null,
        tireSetupId: input.tireSetupId ?? null,
        status: 'queued',
      },
    });

    this.logger.log(`[AiTireSpec] Job created: ${job.id} — ${input.brand} ${input.model} ${input.tireSize}`);

    this.executeJob(job.id).catch((err) => {
      this.logger.error(`[AiTireSpec] Unhandled execution error for job ${job.id}: ${err?.message}`);
    });

    return { jobId: job.id, status: 'queued' };
  }

  // ── Poll job status ─────────────────────────────────────────────────────────

  async getJobStatus(jobId: string): Promise<AiTireSpecJobStatus> {
    const job = await this.prisma.aiTireSpecJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    const normalized = job.normalizedResult as AiTireSpec | null;
    const confidenceScore =
      job.confidenceScore != null
        ? normalizeTireSpecConfidenceScore(job.confidenceScore)
        : null;

    return {
      jobId: job.id,
      status: job.status as AiTireSpecJobStatus['status'],
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
      errorMessage: job.errorMessage ?? null,
      confidenceScore,
      result: job.status === 'succeeded' ? normalized : null,
      resultReady: job.status === 'succeeded' && normalized !== null,
      input: {
        brand: job.brand,
        model: job.model,
        year: job.year,
        tireSize: job.tireSize,
        loadIndex: job.loadIndex,
        speedIndex: job.speedIndex,
      },
    };
  }

  // ── Apply result to active tire setup ─────────────────────────────────────────

  async applyResult(
    jobId: string,
    vehicleId: string,
    options: ApplyAiTireSpecJobOptions,
  ): Promise<AiTireSpecApplyResult> {
    const job = await this.prisma.aiTireSpecJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status !== 'succeeded') {
      return { success: false, message: `Job status is '${job.status}', expected 'succeeded'` };
    }
    if (!job.normalizedResult) {
      return { success: false, message: 'No normalized result available' };
    }
    if (!job.vehicleId) {
      return { success: false, message: 'Job is not bound to a vehicle; apply rejected for safety' };
    }
    if (job.vehicleId !== vehicleId) {
      return { success: false, message: 'Job vehicle does not match target vehicle' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: options.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new ForbiddenException('Vehicle not in organization scope');
    }

    const setup = await this.prisma.vehicleTireSetup.findFirst({
      where: { vehicleId, removedAt: null, status: TireSetupStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!setup) {
      return { success: false, message: 'No active tire setup found for this vehicle' };
    }
    if (job.tireSetupId && job.tireSetupId !== setup.id) {
      return { success: false, message: 'Job tire setup does not match active tire setup' };
    }

    if (job.appliedAt) {
      if (job.appliedToSetupId === setup.id) {
        const normalized = normalizeAiTireSpecResult(job.normalizedResult as Record<string, unknown>);
        const appliedFields = Object.entries(normalized)
          .filter(([, v]) => v != null)
          .map(([k]) => k);
        return {
          success: true,
          setupId: setup.id,
          appliedFields,
          message: 'Already applied to this tire setup',
          idempotentReplay: true,
        };
      }
      return { success: false, message: 'Job already applied to a different tire setup' };
    }

    const normalized = normalizeAiTireSpecResult(job.normalizedResult as Record<string, unknown>);
    const validation = validateAiTireSpec(normalized);

    if (!validation.hasStructuredData) {
      return { success: false, message: 'Stored result has no usable structured data after re-validation' };
    }

    const confidenceScore =
      normalizeTireSpecConfidenceScore(job.confidenceScore ?? normalized.confidenceScore) ??
      normalized.confidenceScore ??
      null;

    const userConfirmedSpec = options.userConfirmedSpec === true;

    const persisted = buildPersistedAiTireSpec(normalized, {
      jobId: job.id,
      confidenceScore,
      completedAt: job.completedAt?.toISOString() ?? null,
      specSourceType: 'ai_agent',
      userConfirmedSpec,
    });

    const setupUpdate = buildAiTireSpecApplySetupUpdate({
      setup: {
        initialTreadEvidenceSource: setup.initialTreadEvidenceSource,
        initialTreadDepthMm: setup.initialTreadDepthMm,
        initialTreadFrontMm: setup.initialTreadFrontMm,
        initialTreadRearMm: setup.initialTreadRearMm,
      },
      persisted,
      confidenceScore,
    });

    await this.prisma.$transaction([
      this.prisma.vehicleTireSetup.update({
        where: { id: setup.id },
        data: setupUpdate as any,
      }),
      this.prisma.aiTireSpecJob.update({
        where: { id: job.id },
        data: {
          appliedAt: new Date(),
          appliedToSetupId: setup.id,
        },
      }),
    ]);

    this.logger.log(`[AiTireSpec] Applied job ${job.id} to setup ${setup.id} — ${validation.fieldCount} fields`);

    const appliedFields = Object.entries(normalized)
      .filter(([, v]) => v != null)
      .map(([k]) => k);

    return { success: true, setupId: setup.id, appliedFields };
  }

  // ── Internal: async job execution ───────────────────────────────────────────

  private async executeJob(jobId: string): Promise<void> {
    const job = await this.prisma.aiTireSpecJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'queued') return;

    await this.prisma.aiTireSpecJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date() },
    });
    this.logger.log(`[AiTireSpec] Job ${jobId} running`);

    try {
      let rawResponse = '';
      let rawSpecs: Record<string, unknown> | null = null;
      let agentError: string | null = null;

      await new Promise<void>((resolve) => {
        let resolved = false;
        const finish = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        this.tireSpecAi
          .getTireSpecsStream(
            {
              brand: job.brand,
              model: job.model,
              year: job.year,
              tireSize: job.tireSize,
              loadIndex: job.loadIndex,
              speedIndex: job.speedIndex,
            },
            (event: string, data: unknown) => {
              const d = data as Record<string, unknown>;
              if (event === 'result') {
                rawSpecs = (d.specs as Record<string, unknown>) ?? null;
                rawResponse = JSON.stringify(d);
              } else if (event === 'error') {
                agentError = (d.message as string) ?? 'Unknown AI error';
              }
            },
          )
          .then(finish)
          .catch((err) => {
            agentError = err?.message ?? 'Execution failed';
            finish();
          });
      });

      if (agentError) {
        await this.prisma.aiTireSpecJob.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            errorMessage: agentError,
            rawResponse: rawResponse || null,
            completedAt: new Date(),
          },
        });
        this.logger.warn(`[AiTireSpec] Job ${jobId} failed: ${agentError}`);
        return;
      }

      const specsForNormalize = mapTireSpecAliases(rawSpecs);
      const normalized = normalizeAiTireSpecResult(specsForNormalize);
      const validation = validateAiTireSpec(normalized);

      if (validation.warnings.length > 0) {
        this.logger.warn(`[AiTireSpec] Job ${jobId} validation warnings: ${validation.warnings.join('; ')}`);
      }

      const confidence = normalizeTireSpecConfidenceScore(normalized.confidenceScore);

      await this.prisma.aiTireSpecJob.update({
        where: { id: jobId },
        data: {
          status: validation.hasStructuredData ? 'succeeded' : 'failed',
          normalizedResult: validation.hasStructuredData ? (normalized as any) : null,
          rawResponse: rawResponse || null,
          confidenceScore: confidence,
          errorMessage: validation.hasStructuredData
            ? null
            : 'AI responded but no structured data was extracted',
          completedAt: new Date(),
        },
      });

      this.logger.log(
        `[AiTireSpec] Job ${jobId} ${validation.hasStructuredData ? 'succeeded' : 'failed (no data)'} — confidence=${confidence ?? 'n/a'}, fields=${validation.fieldCount}`,
      );
    } catch (err: any) {
      await this.prisma.aiTireSpecJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: err?.message ?? 'Unexpected execution error',
          completedAt: new Date(),
        },
      }).catch(() => {});
      this.logger.error(`[AiTireSpec] Job ${jobId} execution error: ${err?.message}`);
    }
  }
}
