import { Injectable } from '@nestjs/common';
import { EnrichmentJobStatus, EnrichmentJobType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isRegistrationBrakeSpecSource } from './brake-registration-backfill.service';
import type {
  LegacyBrakeEnrichmentJobClassification,
  LegacyBrakeEnrichmentJobDiagnostic,
  LegacyBrakeEnrichmentJobDiagnosticsReport,
  LegacyBrakeEnrichmentJobRecommendedAction,
} from './brake-initialization-workflow.types';

const TERMINAL_STATUSES = new Set<EnrichmentJobStatus>([
  EnrichmentJobStatus.COMPLETED,
  EnrichmentJobStatus.FAILED,
]);

@Injectable()
export class BrakeEnrichmentJobDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only classification of legacy `vehicle_enrichment_jobs` rows with
   * jobType=BRAKE. Does not enqueue, mutate, or replay jobs.
   */
  async diagnoseLegacyBrakeJobs(options?: {
    organizationId?: string;
    vehicleId?: string;
    status?: EnrichmentJobStatus;
    limit?: number;
  }): Promise<LegacyBrakeEnrichmentJobDiagnosticsReport> {
    const jobs = await this.prisma.vehicleEnrichmentJob.findMany({
      where: {
        jobType: EnrichmentJobType.BRAKE,
        ...(options?.vehicleId ? { vehicleId: options.vehicleId } : {}),
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.organizationId
          ? { vehicle: { organizationId: options.organizationId } }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: options?.limit,
      include: {
        vehicle: {
          select: {
            id: true,
            organizationId: true,
            brakeHealthCurrent: { select: { isInitialized: true } },
            brakeSpecs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { id: true, sourceType: true },
            },
          },
        },
      },
    });

    const summary = {
      ORPHAN_LEGACY_NO_PROCESSOR: 0,
      SUPERSEDED_ALREADY_INITIALIZED: 0,
      REPLAY_CANDIDATE_VIA_BACKFILL: 0,
      STALE_INCOMPATIBLE: 0,
      COMPLETED_OR_TERMINAL: 0,
    } satisfies Record<LegacyBrakeEnrichmentJobClassification, number>;

    const diagnostics = jobs.map((job) => {
      const diagnostic = this.classifyJob(job);
      summary[diagnostic.classification] += 1;
      return diagnostic;
    });

    return {
      generatedAt: new Date().toISOString(),
      mode: 'read_only',
      jobsScanned: diagnostics.length,
      summary,
      jobs: diagnostics,
    };
  }

  private classifyJob(job: {
    id: string;
    vehicleId: string | null;
    status: EnrichmentJobStatus;
    createdAt: Date;
    resultJson: unknown;
    errorMessage: string | null;
    vehicle: {
      id: string;
      organizationId: string;
      brakeHealthCurrent: { isInitialized: boolean } | null;
      brakeSpecs: Array<{ id: string; sourceType: string | null }>;
    } | null;
  }): LegacyBrakeEnrichmentJobDiagnostic {
    const notes: string[] = [];
    const brakeHealthInitialized = job.vehicle?.brakeHealthCurrent?.isInitialized === true;
    const latestSpec = job.vehicle?.brakeSpecs[0] ?? null;
    const hasRegistrationSpec =
      latestSpec != null && isRegistrationBrakeSpecSource(latestSpec.sourceType);

    if (!job.vehicleId || !job.vehicle) {
      notes.push('Job has no resolvable vehicle relation.');
      return this.buildDiagnostic(job, {
        organizationId: null,
        brakeHealthInitialized: false,
        hasRegistrationSpec: false,
        classification: 'STALE_INCOMPATIBLE',
        recommendedAction: 'ignore_orphan',
        replayCompatible: false,
        notes,
      });
    }

    if (TERMINAL_STATUSES.has(job.status)) {
      notes.push('Job is already in a terminal status.');
      return this.buildDiagnostic(job, {
        organizationId: job.vehicle.organizationId,
        brakeHealthInitialized,
        hasRegistrationSpec,
        classification: 'COMPLETED_OR_TERMINAL',
        recommendedAction: 'no_action',
        replayCompatible: false,
        notes,
      });
    }

    if (brakeHealthInitialized) {
      notes.push(
        'BrakeHealthCurrent is already initialized — legacy PENDING job is superseded by direct lifecycle workflow.',
      );
      return this.buildDiagnostic(job, {
        organizationId: job.vehicle.organizationId,
        brakeHealthInitialized,
        hasRegistrationSpec,
        classification: 'SUPERSEDED_ALREADY_INITIALIZED',
        recommendedAction: 'mark_superseded_via_runbook',
        replayCompatible: false,
        notes,
      });
    }

    if (hasRegistrationSpec) {
      notes.push(
        'Vehicle has a registration/manual brake reference spec but no initialized baseline.',
      );
      notes.push(
        'Replay-compatible via controlled ops backfill (`backfill-brake-health-from-registration-specs.ts`).',
      );
      notes.push('No BullMQ processor exists for jobType=BRAKE — do not auto-run legacy rows.');
      return this.buildDiagnostic(job, {
        organizationId: job.vehicle.organizationId,
        brakeHealthInitialized,
        hasRegistrationSpec,
        classification: 'REPLAY_CANDIDATE_VIA_BACKFILL',
        recommendedAction: 'controlled_replay_via_backfill',
        replayCompatible: true,
        notes,
      });
    }

    notes.push('Legacy BRAKE enrichment job has no processor and no replay-compatible spec anchor.');
    return this.buildDiagnostic(job, {
      organizationId: job.vehicle.organizationId,
      brakeHealthInitialized,
      hasRegistrationSpec,
      classification: 'ORPHAN_LEGACY_NO_PROCESSOR',
      recommendedAction: 'ignore_orphan',
      replayCompatible: false,
      notes,
    });
  }

  private buildDiagnostic(
    job: {
      id: string;
      vehicleId: string | null;
      status: EnrichmentJobStatus;
      createdAt: Date;
    },
    input: {
      organizationId: string | null;
      brakeHealthInitialized: boolean;
      hasRegistrationSpec: boolean;
      classification: LegacyBrakeEnrichmentJobClassification;
      recommendedAction: LegacyBrakeEnrichmentJobRecommendedAction;
      replayCompatible: boolean;
      notes: string[];
    },
  ): LegacyBrakeEnrichmentJobDiagnostic {
    return {
      jobId: job.id,
      vehicleId: job.vehicleId,
      organizationId: input.organizationId,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      classification: input.classification,
      recommendedAction: input.recommendedAction,
      replayCompatible: input.replayCompatible,
      brakeHealthInitialized: input.brakeHealthInitialized,
      hasRegistrationSpec: input.hasRegistrationSpec,
      notes: input.notes,
    };
  }
}
