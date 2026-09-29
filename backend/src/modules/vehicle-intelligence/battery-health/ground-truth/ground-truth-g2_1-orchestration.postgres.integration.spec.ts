import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  DocumentExtractionStatus,
  PrismaClient,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentActionExecutorRegistry } from '@modules/document-extraction/document-action-executor.registry';
import { DocumentActionOrchestratorService } from '@modules/document-extraction/document-action-orchestrator.service';
import { DocumentExtractionObservabilityService } from '@modules/document-extraction/document-extraction-observability.service';
import { DocumentFollowUpSuggestionService } from '@modules/document-extraction/document-follow-up-suggestion.service';
import { ArchiveDocumentActionExecutor } from '@modules/document-extraction/executors/archive-document-action.executor';
import { ApplyBatteryMeasurementDocumentActionExecutor } from '@modules/document-extraction/executors/apply-technical-document-action.executor';
import { LinkEntityDocumentActionExecutor } from '@modules/document-extraction/executors/link-entity-document-action.executor';
import { BatteryEvidenceService } from '../battery-evidence.service';
import { BatteryHealthService } from '../battery-health.service';
import { ServiceEventsService } from '../../service-events/service-events.service';
import { GroundTruthEmissionFailedError } from './ground-truth-emission.errors';
import {
  assertGtPostgresReachable,
  buildGroundTruthStack,
  createGtOrgVehicle,
  createGtTestUser,
} from './ground-truth-postgres.fixture';

const LIVE = process.env.BATTERY_V2_GROUND_TRUTH_INTEGRATION === '1';

const BATTERY_LV_REPLACEMENT_CONFIRMED = {
  measurementDate: '2026-06-15',
  eventDate: '2026-06-15',
  scope: 'lv',
  recordKind: 'replacement',
  workshopName: 'GT Werkstatt',
  odometerKm: 12000,
};

(LIVE ? describe : describe.skip)('BatteryGroundTruth G2.1 orchestration PostgreSQL', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await assertGtPostgresReachable();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function buildBatteryOrchestrator() {
    const prismaService = prisma as unknown as PrismaService;
    const { emission, gtService } = buildGroundTruthStack(prisma);
    const guard = buildGroundTruthStack(prisma).guard;
    const serviceEvents = new ServiceEventsService(
      prismaService,
      { onServiceHistoryChanged: jest.fn().mockResolvedValue(undefined) } as any,
      guard,
    );
    const batteryEvidence = new BatteryEvidenceService(prismaService);
    const batteryHealth = new BatteryHealthService(
      prismaService,
      batteryEvidence,
      serviceEvents,
      emission,
    );
    const registry = new DocumentActionExecutorRegistry();
    registry.register(
      new ArchiveDocumentActionExecutor({
        recordArchive: jest.fn(),
      } as any),
    );
    registry.register(new LinkEntityDocumentActionExecutor());
    registry.register(new ApplyBatteryMeasurementDocumentActionExecutor(batteryHealth));

    const noop = { execute: jest.fn() } as any;
    const orchestrator = new DocumentActionOrchestratorService(
      prismaService,
      registry,
      new ArchiveDocumentActionExecutor({ recordArchive: jest.fn() } as any),
      new LinkEntityDocumentActionExecutor(),
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      new ApplyBatteryMeasurementDocumentActionExecutor(batteryHealth),
      { syncForActionPlan: jest.fn().mockResolvedValue(undefined) } as DocumentFollowUpSuggestionService,
      {
        recordActionPlan: jest.fn(),
        recordActionExecution: jest.fn(),
        recordPartialApply: jest.fn(),
      } as unknown as DocumentExtractionObservabilityService,
    );
    return { orchestrator, gtService, emission, batteryHealth };
  }

  it('G2H-A — CONFIRMED action execution emits GT before APPLIED transition', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const extractionId = randomUUID();
    await prisma.vehicleDocumentExtraction.create({
      data: {
        id: extractionId,
        organizationId,
        vehicleId,
        effectiveDocumentType: 'BATTERY',
        status: DocumentExtractionStatus.READY_FOR_REVIEW,
        confirmedData: BATTERY_LV_REPLACEMENT_CONFIRMED as object,
        plausibility: {},
      },
    });

    await prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: DocumentExtractionStatus.CONFIRMED,
        confirmedById: actor.id,
        confirmedData: BATTERY_LV_REPLACEMENT_CONFIRMED as object,
      },
    });

    const { orchestrator } = buildBatteryOrchestrator();

    await prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { contentSha256: 'sha-g2h-a', confirmedById: actor.id },
    });

    const result = await orchestrator.executeConfirmedPlan({
      extractionId,
      organizationId,
      vehicleId,
      documentType: 'BATTERY',
      confirmedData: BATTERY_LV_REPLACEMENT_CONFIRMED,
      sourceFileUrl: 'storage://battery.pdf',
      confirmedById: actor.id,
      plausibilityChecks: [],
      plausibility: {},
    });

    const afterPlan = await prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
    });
    expect(afterPlan?.status).toBe(DocumentExtractionStatus.CONFIRMED);
    expect(result.detail?.groundTruthEventIds?.length).toBe(1);
    expect(result.detail?.groundTruthEventIds?.[0]).toBeTruthy();
    expect(await prisma.batteryGroundTruthEvent.count({ where: { vehicleId } })).toBe(1);

    await prisma.vehicleDocumentExtraction.updateMany({
      where: { id: extractionId, status: DocumentExtractionStatus.CONFIRMED },
      data: { status: DocumentExtractionStatus.APPLIED, appliedAt: new Date(), appliedById: actor.id },
    });
    expect(
      (await prisma.vehicleDocumentExtraction.findUnique({ where: { id: extractionId } }))?.status,
    ).toBe(DocumentExtractionStatus.APPLIED);
  });

  it('G2H-B — GT failure then orchestration retry converges to one GT', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const actor = await createGtTestUser(prisma, organizationId);
    const extractionId = randomUUID();
    await prisma.vehicleDocumentExtraction.create({
      data: {
        id: extractionId,
        organizationId,
        vehicleId,
        effectiveDocumentType: 'BATTERY',
        status: DocumentExtractionStatus.CONFIRMED,
        confirmedById: actor.id,
        confirmedData: BATTERY_LV_REPLACEMENT_CONFIRMED as object,
        contentSha256: 'sha-g2h-b',
        plausibility: {},
      },
    });

    const { orchestrator, gtService } = buildBatteryOrchestrator();
    const originalAdmit = gtService.admitAndPersist.bind(gtService);
    let admitCalls = 0;
    jest.spyOn(gtService, 'admitAndPersist').mockImplementation(async (candidate) => {
      admitCalls += 1;
      if (admitCalls === 1) {
        throw new GroundTruthEmissionFailedError('GT_REPLACEMENT_EMISSION_FAILED', 'injected');
      }
      return originalAdmit(candidate);
    });

    await expect(
      orchestrator.executeConfirmedPlan({
        extractionId,
        organizationId,
        vehicleId,
        documentType: 'BATTERY',
        confirmedData: BATTERY_LV_REPLACEMENT_CONFIRMED,
        sourceFileUrl: 'storage://battery.pdf',
        confirmedById: actor.id,
        plausibilityChecks: [],
        plausibility: {},
      }),
    ).rejects.toThrow();

    const mid = await prisma.vehicleDocumentExtraction.findUnique({ where: { id: extractionId } });
    expect(mid?.status).toBe(DocumentExtractionStatus.CONFIRMED);

    jest.spyOn(gtService, 'admitAndPersist').mockImplementation(originalAdmit);
    const retry = await orchestrator.executeConfirmedPlan({
      extractionId,
      organizationId,
      vehicleId,
      documentType: 'BATTERY',
      confirmedData: BATTERY_LV_REPLACEMENT_CONFIRMED,
      sourceFileUrl: 'storage://battery.pdf',
      confirmedById: actor.id,
      plausibilityChecks: [],
      plausibility: mid?.plausibility ?? {},
    });

    expect(retry.detail?.groundTruthEventIds?.length).toBe(1);
    expect(await prisma.batteryGroundTruthEvent.count({ where: { vehicleId } })).toBe(1);
  });

  it('G2H-C — READY_FOR_REVIEW cannot emit GT via convergence', async () => {
    const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
    const { emission } = buildGroundTruthStack(prisma);
    const doc = await prisma.vehicleDocumentExtraction.create({
      data: {
        organizationId,
        vehicleId,
        status: DocumentExtractionStatus.READY_FOR_REVIEW,
        effectiveDocumentType: 'BATTERY',
      },
    });
    await expect(
      emission.convergeDocumentApplyGroundTruth({
        organizationId,
        vehicleId,
        documentExtractionId: doc.id,
        scope: BatteryEvidenceScope.LV,
        isReplacement: true,
        observedAt: new Date('2026-06-15'),
        odometerKm: null,
        workshopName: null,
        notes: null,
        measurementType: null,
        sohPercent: null,
        voltageV: null,
        restingVoltage: null,
        crankingVoltage: null,
        chargingVoltage: null,
        temperatureC: null,
        serviceEventId: randomUUID(),
        evidenceIds: [],
      }),
    ).rejects.toMatchObject({ code: 'GT_DOCUMENT_STATUS_NOT_ELIGIBLE' });
  });
});
