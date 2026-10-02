import { Test } from '@nestjs/testing';
import { defaultRawFuelRefuelFallbackConfigForTests } from '@config/raw-fuel-refuel-fallback.config';
import { DimoSegmentsService } from '@modules/dimo/dimo-segments.service';
import { RawRefuelCandidateService } from '../raw-refuel-candidate/raw-refuel-candidate.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';

/**
 * Production deploy boot-check gate (SYNQDRIVE_BOOT_CHECK=1) resolves the full
 * AppModule graph. RawFuelRefuelFallbackRuntimeService is a normal
 * VehicleIntelligenceModule provider — a function-typed constructor parameter
 * must not appear on Nest's injectable surface.
 */
describe('RawFuelRefuelFallbackRuntimeService Nest DI bootstrap', () => {
  it('resolves through Nest TestingModule without a configLoader provider token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RawFuelRefuelFallbackRuntimeService,
        {
          provide: DimoSegmentsService,
          useValue: { fetchFuelLevelSamplesWithOutcome: jest.fn() },
        },
        {
          provide: RawRefuelCandidateService,
          useValue: { resolveOrCreateCandidate: jest.fn() },
        },
      ],
    }).compile();

    expect(moduleRef.get(RawFuelRefuelFallbackRuntimeService)).toBeInstanceOf(
      RawFuelRefuelFallbackRuntimeService,
    );
  });

  it('withConfigLoader overrides config without Nest DI token', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RawFuelRefuelFallbackRuntimeService,
        {
          provide: DimoSegmentsService,
          useValue: { fetchFuelLevelSamplesWithOutcome: jest.fn() },
        },
        {
          provide: RawRefuelCandidateService,
          useValue: { resolveOrCreateCandidate: jest.fn() },
        },
      ],
    }).compile();

    const service = moduleRef
      .get(RawFuelRefuelFallbackRuntimeService)
      .withConfigLoader(() =>
        defaultRawFuelRefuelFallbackConfigForTests({
          masterEnabled: true,
          persistEnabled: false,
        }),
      );

    const result = await service.scanIfEnabled({
      organizationId: 'org',
      vehicleId: 'veh',
      tokenId: 0,
      windowFrom: new Date(),
      windowTo: new Date(),
      fuelType: 'GASOLINE' as never,
      requestContext: { organizationId: 'org', vehicleId: 'veh', tokenId: 0 },
    });

    expect(result.skipReason).toBe('no_dimo_token');
  });
});
