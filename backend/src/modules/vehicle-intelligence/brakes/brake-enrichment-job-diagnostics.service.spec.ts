import { EnrichmentJobStatus } from '@prisma/client';
import { BrakeEnrichmentJobDiagnosticsService } from './brake-enrichment-job-diagnostics.service';

const mockPrisma = {
  vehicleEnrichmentJob: {
    findMany: jest.fn(),
  },
} as any;

const svc = new BrakeEnrichmentJobDiagnosticsService(mockPrisma);

describe('BrakeEnrichmentJobDiagnosticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseJob = {
    id: 'job-1',
    vehicleId: 'veh-1',
    status: EnrichmentJobStatus.PENDING,
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    resultJson: null,
    errorMessage: null,
    vehicle: {
      id: 'veh-1',
      organizationId: 'org-1',
      brakeHealthCurrent: null,
      brakeSpecs: [{ id: 'spec-1', sourceType: 'manual_registration' }],
    },
  };

  it('classifies orphan PENDING jobs without processor as replay candidates when spec exists', async () => {
    mockPrisma.vehicleEnrichmentJob.findMany.mockResolvedValue([baseJob]);

    const report = await svc.diagnoseLegacyBrakeJobs({ status: EnrichmentJobStatus.PENDING });

    expect(report.mode).toBe('read_only');
    expect(report.jobs).toHaveLength(1);
    expect(report.jobs[0].classification).toBe('REPLAY_CANDIDATE_VIA_BACKFILL');
    expect(report.jobs[0].replayCompatible).toBe(true);
    expect(report.jobs[0].recommendedAction).toBe('controlled_replay_via_backfill');
  });

  it('marks legacy jobs superseded when brake health is already initialized', async () => {
    mockPrisma.vehicleEnrichmentJob.findMany.mockResolvedValue([
      {
        ...baseJob,
        vehicle: {
          ...baseJob.vehicle,
          brakeHealthCurrent: { isInitialized: true },
        },
      },
    ]);

    const report = await svc.diagnoseLegacyBrakeJobs();

    expect(report.jobs[0].classification).toBe('SUPERSEDED_ALREADY_INITIALIZED');
    expect(report.jobs[0].replayCompatible).toBe(false);
  });

  it('classifies incompatible legacy jobs without vehicle or spec as stale', async () => {
    mockPrisma.vehicleEnrichmentJob.findMany.mockResolvedValue([
      {
        ...baseJob,
        vehicleId: null,
        vehicle: null,
      },
    ]);

    const report = await svc.diagnoseLegacyBrakeJobs();

    expect(report.jobs[0].classification).toBe('STALE_INCOMPATIBLE');
    expect(report.jobs[0].replayCompatible).toBe(false);
  });

  it('supports multi-tenant filtering by organizationId', async () => {
    mockPrisma.vehicleEnrichmentJob.findMany.mockResolvedValue([]);

    await svc.diagnoseLegacyBrakeJobs({ organizationId: 'org-2' });

    expect(mockPrisma.vehicleEnrichmentJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          jobType: 'BRAKE',
          vehicle: { organizationId: 'org-2' },
        }),
      }),
    );
  });

  it('treats FAILED jobs as terminal dead-letter state without replay', async () => {
    mockPrisma.vehicleEnrichmentJob.findMany.mockResolvedValue([
      {
        ...baseJob,
        status: EnrichmentJobStatus.FAILED,
        errorMessage: 'legacy processor missing',
      },
    ]);

    const report = await svc.diagnoseLegacyBrakeJobs({ status: EnrichmentJobStatus.FAILED });

    expect(report.jobs[0].classification).toBe('COMPLETED_OR_TERMINAL');
    expect(report.jobs[0].recommendedAction).toBe('no_action');
  });
});
