import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, type TestingModule } from '@nestjs/testing';
import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT } from '@modules/vehicle-intelligence/ports/rental-driving-analysis-recompute-trigger.port';
import { RentalDrivingAnalysisModule } from './rental-driving-analysis.module';
import { RentalDrivingAnalysisRecomputeTriggerService } from './rental-driving-analysis-recompute.trigger';
import { rentalDrivingAnalysisRecomputeTriggerPortProviders } from './rental-driving-analysis-recompute-trigger.providers';
import { DrivingIntelligenceJobDispatcherService } from '@modules/vehicle-intelligence/driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('RentalDrivingAnalysisRecomputeTriggerPort — scoped runtime DI', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        ...rentalDrivingAnalysisRecomputeTriggerPortProviders,
        RentalDrivingAnalysisRecomputeTriggerService,
        {
          provide: PrismaService,
          useValue: { booking: { findFirst: jest.fn() }, vehicleTrip: { findFirst: jest.fn() } },
        },
        {
          provide: DrivingIntelligenceJobDispatcherService,
          useValue: { enqueue: jest.fn() },
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('RentalDrivingAnalysisModule exports RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT', () => {
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, RentalDrivingAnalysisModule) as
      | unknown[]
      | undefined;
    expect(exports).toContain(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT);
  });

  it('resolves port to the same instance as RentalDrivingAnalysisRecomputeTriggerService', () => {
    const port = moduleRef.get(RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT);
    const trigger = moduleRef.get(RentalDrivingAnalysisRecomputeTriggerService);
    expect(port).toBe(trigger);
  });
});