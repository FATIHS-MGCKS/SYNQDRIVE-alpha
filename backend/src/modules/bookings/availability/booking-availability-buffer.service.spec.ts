import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DEFAULT_POLICY } from '@modules/business-insights/insight.types';
import { BookingAvailabilityBufferService } from './booking-availability-buffer.service';

describe('BookingAvailabilityBufferService', () => {
  let service: BookingAvailabilityBufferService;
  let prisma: { tenantInsightPolicy: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { tenantInsightPolicy: { findUnique: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [
        BookingAvailabilityBufferService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(BookingAvailabilityBufferService);
  });

  it('returns policy override handoverBufferMin when set', async () => {
    prisma.tenantInsightPolicy.findUnique.mockResolvedValue({
      policyOverrides: { handoverBufferMin: 45 },
    });
    await expect(service.resolveTurnaroundBufferMinutes('org-1')).resolves.toBe(45);
  });

  it('falls back to DEFAULT_POLICY when policy missing', async () => {
    prisma.tenantInsightPolicy.findUnique.mockResolvedValue(null);
    await expect(service.resolveTurnaroundBufferMinutes('org-1')).resolves.toBe(
      DEFAULT_POLICY.handoverBufferMin,
    );
  });

  it('rejects negative override values', async () => {
    prisma.tenantInsightPolicy.findUnique.mockResolvedValue({
      policyOverrides: { handoverBufferMin: -5 },
    });
    await expect(service.resolveTurnaroundBufferMinutes('org-1')).resolves.toBe(
      DEFAULT_POLICY.handoverBufferMin,
    );
  });
});
