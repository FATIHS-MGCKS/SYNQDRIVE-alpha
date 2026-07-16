import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../dimo/dimo-segments.service';
import { EventContextEnrichmentService } from './event-context/event-context-enrichment.service';
import { DrivingEventContextJobService } from './event-context/driving-event-context-job.service';
import { LteR1BehaviorEnrichmentService } from './trips/lte-r1-behavior-enrichment.service';
import { DimoNativeDrivingEventPersistenceService } from './dimo-native-driving-events/dimo-native-driving-event-persistence.service';
import { VehicleDrivingCapabilityResolverService } from './driving-capability/vehicle-driving-capability-resolver.service';

describe('VehicleIntelligenceModule — EventContext DI', () => {
  it('instantiates EventContextEnrichmentService with Prisma + DimoSegments', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EventContextEnrichmentService,
        { provide: PrismaService, useValue: { drivingEvent: {} } },
        { provide: DimoSegmentsService, useValue: { fetchHighFrequency: jest.fn() } },
      ],
    }).compile();

    expect(moduleRef.get(EventContextEnrichmentService)).toBeInstanceOf(
      EventContextEnrichmentService,
    );
  });

  it('wires DrivingEventContextJobService into LteR1BehaviorEnrichmentService', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LteR1BehaviorEnrichmentService,
        { provide: PrismaService, useValue: { drivingEvent: {}, drivingAnalysisRun: {} } },
        { provide: DimoSegmentsService, useValue: { fetchDrivingEvents: jest.fn() } },
        {
          provide: DrivingEventContextJobService,
          useValue: { scheduleContextEnrichmentForTrip: jest.fn() },
        },
        {
          provide: VehicleDrivingCapabilityResolverService,
          useValue: { resolveForVehicle: jest.fn() },
        },
        {
          provide: DimoNativeDrivingEventPersistenceService,
          useValue: { upsertNativeEvents: jest.fn(), reconcileUnassignedEvents: jest.fn() },
        },
      ],
    }).compile();

    const lte = moduleRef.get(LteR1BehaviorEnrichmentService);
    const contextJobs = moduleRef.get(DrivingEventContextJobService);
    expect(lte).toBeDefined();
    expect(contextJobs).toBeDefined();
    expect((lte as any).contextJobs).toBe(contextJobs);
  });
});
