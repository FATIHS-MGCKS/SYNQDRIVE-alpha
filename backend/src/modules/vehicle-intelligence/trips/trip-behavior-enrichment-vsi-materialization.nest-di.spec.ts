import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { TripBehaviorEnrichmentService } from './trip-behavior-enrichment.service';
import { LteR1BehaviorEnrichmentService } from './lte-r1-behavior-enrichment.service';
import { TripAssignmentService } from './trip-assignment.service';
import { HfMirrorService } from './hf-mirror.service';
import { TripChEvidenceMirrorCoordinator } from './trip-ch-evidence-mirror.coordinator';
import { VsiReadonlySignalComposerModule } from '../vehicle-signal-intelligence/vsi-readonly-composer.module';
import { VsiSignalProfileMaterializationService } from '../vehicle-signal-intelligence/vsi-profile-materialization.service';
import { WorkersModule } from '@workers/workers.module';
import { SchedulerLeaderGuardService } from '@shared/scheduler-leader/scheduler-leader-guard.service';
import { VsiProfileLifecycleOutboxWorker } from '../vehicle-signal-intelligence/vsi-profile-lifecycle.worker';

function createEnrichmentVsiTestingModule(extraProviders: unknown[]) {
  return Test.createTestingModule({
    imports: [VsiReadonlySignalComposerModule],
    providers: extraProviders as never[],
  })
    .overrideProvider(SchedulerLeaderGuardService)
    .useValue({ shouldRun: jest.fn(() => false), runIfLeader: jest.fn() })
    .overrideProvider(VsiProfileLifecycleOutboxWorker)
    .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() });
}

/**
 * Production @ 864e858a: TripBehaviorEnrichmentService used `import type` + @Optional()
 * for VsiSignalProfileMaterializationService — Nest emitted no runtime token, so workers
 * silently skipped RPM cadence with VSI_MATERIALIZATION_UNAVAILABLE.
 */
describe('TripBehaviorEnrichmentService VSI materialization Nest DI', () => {
  const enrichmentParamTypes: unknown[] =
    Reflect.getMetadata('design:paramtypes', TripBehaviorEnrichmentService) ?? [];

  it('emits VsiSignalProfileMaterializationService in constructor design:paramtypes (runtime DI token)', () => {
    expect(enrichmentParamTypes).toContain(VsiSignalProfileMaterializationService);
  });

  it('WorkersModule imports VsiReadonlySignalComposerModule for worker-side VSI providers', () => {
    const workerImports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, WorkersModule) ?? [];
    expect(workerImports).toContain(VsiReadonlySignalComposerModule);
  });

  it('resolves the same VsiSignalProfileMaterializationService instance into TripBehaviorEnrichmentService', async () => {
    const prismaMock = {
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({ id: 'link-1' }),
      },
    };

    const moduleRef = await createEnrichmentVsiTestingModule([
      TripBehaviorEnrichmentService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: DimoSegmentsService, useValue: {} },
      { provide: LteR1BehaviorEnrichmentService, useValue: {} },
      { provide: TripAssignmentService, useValue: {} },
      {
        provide: HfMirrorService,
        useValue: { isEnabled: false, mirrorTripHf: jest.fn() },
      },
      {
        provide: TripChEvidenceMirrorCoordinator,
        useValue: { schedulePostTripEvidence: jest.fn() },
      },
    ]).compile();

    const enrichment = moduleRef.get(TripBehaviorEnrichmentService);
    const materialization = moduleRef.get(VsiSignalProfileMaterializationService);

    expect(materialization).toBeInstanceOf(VsiSignalProfileMaterializationService);
    expect(
      (enrichment as unknown as { vsiProfileMaterialization: unknown }).vsiProfileMaterialization,
    ).toBe(materialization);
  });

  it('fails Nest bootstrap when VsiSignalProfileMaterializationService is not registered', async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          TripBehaviorEnrichmentService,
          { provide: PrismaService, useValue: {} },
          { provide: DimoSegmentsService, useValue: {} },
          { provide: LteR1BehaviorEnrichmentService, useValue: {} },
          { provide: TripAssignmentService, useValue: {} },
          { provide: HfMirrorService, useValue: { isEnabled: false } },
          { provide: TripChEvidenceMirrorCoordinator, useValue: {} },
        ],
      }).compile(),
    ).rejects.toThrow(/VsiSignalProfileMaterializationService|Nest can't resolve dependencies/i);
  });

  it('post-trip hook can invoke TRIP_FINALIZED_RPM_CADENCE materialization when HF evidence is ready', async () => {
    const prismaMock = {
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({ id: 'link-audi' }),
      },
    };

    const moduleRef = await createEnrichmentVsiTestingModule([
      TripBehaviorEnrichmentService,
      { provide: PrismaService, useValue: prismaMock },
      { provide: DimoSegmentsService, useValue: {} },
      { provide: LteR1BehaviorEnrichmentService, useValue: {} },
      { provide: TripAssignmentService, useValue: {} },
      {
        provide: HfMirrorService,
        useValue: { isEnabled: true, mirrorTripHf: jest.fn() },
      },
      {
        provide: TripChEvidenceMirrorCoordinator,
        useValue: { schedulePostTripEvidence: jest.fn() },
      },
    ]).compile();

    const enrichment = moduleRef.get(TripBehaviorEnrichmentService);
    const materialization = moduleRef.get(VsiSignalProfileMaterializationService);
    const materializeSpy = jest
      .spyOn(materialization, 'materializeFromPersistedEvidence')
      .mockResolvedValue({} as never);

    await (enrichment as unknown as {
      scheduleVsiRpmCadenceAfterTrip: (input: {
        organizationId: string;
        vehicleId: string;
        tripId: string;
        hfTripPointsReady: boolean;
      }) => Promise<void>;
    }).scheduleVsiRpmCadenceAfterTrip({
      organizationId: 'org-1',
      vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      tripId: '7f00471e-a99d-400c-9ee3-4e91ed4739bb',
      hfTripPointsReady: true,
    });

    expect(materializeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
        rpmCadenceTripId: '7f00471e-a99d-400c-9ee3-4e91ed4739bb',
        providerSourceLinkId: 'link-audi',
      }),
    );
  });
});
