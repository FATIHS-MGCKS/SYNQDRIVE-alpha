import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../dimo/dimo-segments.service';
import { EventContextEnrichmentService } from './event-context/event-context-enrichment.service';
import { LteR1BehaviorEnrichmentService } from './trips/lte-r1-behavior-enrichment.service';
import { VehicleIntelligenceModule } from './vehicle-intelligence.module';

describe('VehicleIntelligenceModule — EventContext DI', () => {
  it('registers EventContextEnrichmentService as a provider', () => {
    const providers: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, VehicleIntelligenceModule) ?? [];
    expect(providers).toContain(EventContextEnrichmentService);
    expect(providers).toContain(LteR1BehaviorEnrichmentService);
  });

  it('exports EventContextEnrichmentService', () => {
    const exports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, VehicleIntelligenceModule) ?? [];
    expect(exports).toContain(EventContextEnrichmentService);
  });

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

  it('wires EventContextEnrichmentService into LteR1BehaviorEnrichmentService', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LteR1BehaviorEnrichmentService,
        EventContextEnrichmentService,
        { provide: PrismaService, useValue: { drivingEvent: {} } },
        { provide: DimoSegmentsService, useValue: { fetchHighFrequency: jest.fn() } },
      ],
    }).compile();

    const lte = moduleRef.get(LteR1BehaviorEnrichmentService);
    const eventContext = moduleRef.get(EventContextEnrichmentService);
    expect(lte).toBeDefined();
    expect(eventContext).toBeDefined();
    expect((lte as any).eventContext).toBe(eventContext);
  });
});
