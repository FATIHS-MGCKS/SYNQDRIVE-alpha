import { BadRequestException } from '@nestjs/common';
import { EnrichmentJobType } from '@prisma/client';
import { EnrichmentJobsService } from './enrichment-jobs.service';

const mockPrisma = {
  vehicleEnrichmentJob: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
} as any;

const svc = new EnrichmentJobsService(mockPrisma);

describe('EnrichmentJobsService BRAKE producer guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects new BRAKE enrichment job creation', async () => {
    await expect(
      svc.create('veh-1', { jobType: EnrichmentJobType.BRAKE, status: 'PENDING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.vehicleEnrichmentJob.create).not.toHaveBeenCalled();
  });

  it('still allows non-BRAKE enrichment job creation', async () => {
    mockPrisma.vehicleEnrichmentJob.create.mockResolvedValue({ id: 'job-1' });

    await svc.create('veh-1', { jobType: EnrichmentJobType.BATTERY, status: 'PENDING' });

    expect(mockPrisma.vehicleEnrichmentJob.create).toHaveBeenCalledTimes(1);
  });
});
