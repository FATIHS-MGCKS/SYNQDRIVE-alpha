import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { FixedRawRefuelCandidateClock } from './raw-refuel-candidate-clock';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';

describe('RawRefuelCandidateService — Nest DI', () => {
  it('resolves RawRefuelCandidateService with injected PrismaService', async () => {
    const prismaMock = {
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const moduleRef = await Test.createTestingModule({
      providers: [
        RawRefuelCandidateService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    const service = moduleRef.get(RawRefuelCandidateService);
    expect(service).toBeInstanceOf(RawRefuelCandidateService);
    expect((service as unknown as { prisma: PrismaService }).prisma).toBe(prismaMock);
  });

  it('supports deterministic test clocks without changing Nest constructor contract', () => {
    const prismaMock = { $transaction: jest.fn() } as unknown as PrismaService;
    const fixed = new Date('2026-09-06T10:00:00.000Z');
    const service = RawRefuelCandidateService.withFixedClock(prismaMock, fixed);
    const observed = (service as unknown as { clock: { now(): Date } }).clock.now();
    expect(observed.toISOString()).toBe(fixed.toISOString());
  });
});
