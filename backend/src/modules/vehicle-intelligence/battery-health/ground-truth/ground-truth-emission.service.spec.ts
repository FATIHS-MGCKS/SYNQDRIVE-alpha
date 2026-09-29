import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  DocumentExtractionStatus,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { BatteryGroundTruthEmissionService } from './ground-truth-emission.service';
import {
  GroundTruthEmissionFailedError,
  ManualGroundTruthConfirmationConflictError,
} from './ground-truth-emission.errors';
import { PIPELINE_PLAUSIBILITY_KEY } from '@modules/document-extraction/document-content-cache.util';
import { GROUND_TRUTH_ADMISSION_LEVEL } from './ground-truth-admission.types';

describe('BatteryGroundTruthEmissionService', () => {
  const org = 'org-1';
  const veh = 'veh-1';
  const docId = 'doc-1';
  const observedAt = new Date('2026-06-01T10:00:00.000Z');

  function createHarness() {
    const prisma = {
      vehicleDocumentExtraction: { findUnique: jest.fn() },
      batteryEvidence: { findMany: jest.fn() },
      vehicleServiceEvent: { findFirst: jest.fn() },
      batteryGroundTruthEvent: { findFirst: jest.fn() },
    };
    const groundTruth = { admitAndPersist: jest.fn() };
    const groundTruthRepository = {
      findActiveReplacementBySourceScope: jest.fn().mockResolvedValue(null),
      findActiveReplacementBySourceEvent: jest.fn().mockResolvedValue(null),
    };
    const svc = new BatteryGroundTruthEmissionService(
      prisma as any,
      groundTruth as any,
      groundTruthRepository as any,
    );
    return { svc, prisma, groundTruth, groundTruthRepository };
  }

  beforeEach(() => jest.clearAllMocks());

  describe('document apply convergence', () => {
    function appliedDocument() {
      return {
        id: docId,
        status: DocumentExtractionStatus.APPLIED,
        organizationId: org,
        vehicleId: veh,
        contentSha256: 'sha-doc',
        confirmedById: 'user-confirmer',
        appliedById: 'user-applier',
        plausibility: {
          [PIPELINE_PLAUSIBILITY_KEY]: {
            actionPlan: {
              confirmedAt: '2026-05-20T08:00:00.000Z',
              fingerprint: 'fp-doc',
            },
          },
        },
      };
    }

    function confirmedExecutionAuthority() {
      return {
        mode: 'CONFIRMED_ACTION_EXECUTION' as const,
        confirmedAt: new Date('2026-05-20T08:00:00.000Z'),
        confirmedByUserId: 'user-confirmer',
        actionPlanFingerprint: 'fp-doc',
        documentActionIdempotencyKey: 'idem-1',
      };
    }

    it('G2H-D — CONFIRMED status with action authority emits GT', async () => {
      const { svc, prisma, groundTruth } = createHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
        ...appliedDocument(),
        status: DocumentExtractionStatus.CONFIRMED,
      });
      groundTruth.admitAndPersist.mockResolvedValue({
        outcome: 'PERSISTED',
        groundTruthEventId: 'gt-confirmed',
        admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
      });

      const ids = await svc.convergeDocumentApplyGroundTruth({
        organizationId: org,
        vehicleId: veh,
        documentExtractionId: docId,
        confirmationAuthority: confirmedExecutionAuthority(),
        scope: BatteryEvidenceScope.LV,
        isReplacement: true,
        observedAt,
        odometerKm: null,
        workshopName: null,
        notes: null,
        measurementType: 'REPLACEMENT',
        sohPercent: null,
        voltageV: null,
        restingVoltage: null,
        crankingVoltage: null,
        chargingVoltage: null,
        temperatureC: null,
        serviceEventId: 'evt-1',
        evidenceIds: [],
      });
      expect(ids).toEqual(['gt-confirmed']);
    });

    it('G2H-E — confirmedAt is not derived from observedAt', async () => {
      const { svc, prisma, groundTruth } = createHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
        ...appliedDocument(),
        status: DocumentExtractionStatus.CONFIRMED,
      });
      groundTruth.admitAndPersist.mockResolvedValue({
        outcome: 'PERSISTED',
        groundTruthEventId: 'gt-time',
        admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
      });

      await svc.convergeDocumentApplyGroundTruth({
        organizationId: org,
        vehicleId: veh,
        documentExtractionId: docId,
        confirmationAuthority: confirmedExecutionAuthority(),
        scope: BatteryEvidenceScope.LV,
        isReplacement: true,
        observedAt: new Date('2010-01-01T00:00:00.000Z'),
        odometerKm: null,
        workshopName: null,
        notes: null,
        measurementType: 'REPLACEMENT',
        sohPercent: null,
        voltageV: null,
        restingVoltage: null,
        crankingVoltage: null,
        chargingVoltage: null,
        temperatureC: null,
        serviceEventId: 'evt-1',
        evidenceIds: [],
      });

      expect(groundTruth.admitAndPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          effectiveAt: new Date('2010-01-01T00:00:00.000Z'),
          confirmedAt: new Date('2026-05-20T08:00:00.000Z'),
        }),
      );
    });

    it('DOC-A/DOC-C — confirmed LV/HV replacement emits one GT without numeric evidence', async () => {
      for (const scope of [BatteryEvidenceScope.LV, BatteryEvidenceScope.HV]) {
        const { svc, prisma, groundTruth } = createHarness();
        prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue(appliedDocument());
        groundTruth.admitAndPersist.mockResolvedValue({
          outcome: 'PERSISTED',
          groundTruthEventId: `gt-${scope}`,
          admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
        });

        const ids = await svc.convergeDocumentApplyGroundTruth({
          organizationId: org,
          vehicleId: veh,
          documentExtractionId: docId,
          scope,
          isReplacement: true,
          observedAt,
          odometerKm: null,
          workshopName: null,
          notes: null,
          measurementType: 'REPLACEMENT',
          sohPercent: null,
          voltageV: null,
          restingVoltage: null,
          crankingVoltage: null,
          chargingVoltage: null,
          temperatureC: null,
          serviceEventId: 'evt-1',
          evidenceIds: [],
        });

        expect(ids).toEqual([`gt-${scope}`]);
        expect(groundTruth.admitAndPersist).toHaveBeenCalledTimes(1);
      }
    });

    it('DOC-D — unapplied / unconfirmed document emits zero GT or fails closed', async () => {
      const { svc, prisma, groundTruth } = createHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
        ...appliedDocument(),
        status: DocumentExtractionStatus.READY_FOR_REVIEW,
      });

      await expect(
        svc.convergeDocumentApplyGroundTruth({
          organizationId: org,
          vehicleId: veh,
          documentExtractionId: docId,
          scope: BatteryEvidenceScope.LV,
          isReplacement: true,
          observedAt,
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
          serviceEventId: 'evt-1',
          evidenceIds: [],
        }),
      ).rejects.toMatchObject({ code: 'GT_DOCUMENT_STATUS_NOT_ELIGIBLE' });
      expect(groundTruth.admitAndPersist).not.toHaveBeenCalled();
    });

    it('DOC-E/F — workshop measurement emits per admissible evidence row', async () => {
      const { svc, prisma, groundTruth } = createHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue(appliedDocument());
      prisma.batteryEvidence.findMany.mockResolvedValue([
        {
          id: 'ev-soh',
          scope: BatteryEvidenceScope.HV,
          numericValue: 88,
          valueType: BatteryEvidenceValueType.SOH_PERCENT,
          sourceType: BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
          observedAt,
        },
        {
          id: 'ev-v',
          scope: BatteryEvidenceScope.LV,
          numericValue: 12.5,
          valueType: BatteryEvidenceValueType.VOLTAGE_V,
          sourceType: BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
          observedAt,
        },
      ]);
      groundTruth.admitAndPersist
        .mockResolvedValueOnce({
          outcome: 'PERSISTED',
          groundTruthEventId: 'gt-soh',
          admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
        })
        .mockResolvedValueOnce({
          outcome: 'PERSISTED',
          groundTruthEventId: 'gt-v',
          admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
        });

      const ids = await svc.convergeDocumentApplyGroundTruth({
        organizationId: org,
        vehicleId: veh,
        documentExtractionId: docId,
        scope: BatteryEvidenceScope.HV,
        isReplacement: false,
        observedAt,
        odometerKm: null,
        workshopName: null,
        notes: null,
        measurementType: 'HV_BMS_REPORT',
        sohPercent: 88,
        voltageV: null,
        restingVoltage: null,
        crankingVoltage: null,
        chargingVoltage: null,
        temperatureC: null,
        serviceEventId: null,
        evidenceIds: ['ev-soh', 'ev-v'],
      });

      expect(ids).toEqual(['gt-soh']);
      expect(groundTruth.admitAndPersist).toHaveBeenCalledTimes(1);
    });

    it('DOC-I — multiple evidence rows still yield one replacement GT', async () => {
      const { svc, prisma, groundTruth } = createHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue(appliedDocument());
      groundTruth.admitAndPersist.mockResolvedValue({
        outcome: 'PERSISTED',
        groundTruthEventId: 'gt-repl',
        admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
      });

      const ids = await svc.convergeDocumentApplyGroundTruth({
        organizationId: org,
        vehicleId: veh,
        documentExtractionId: docId,
        scope: BatteryEvidenceScope.LV,
        isReplacement: true,
        observedAt,
        odometerKm: null,
        workshopName: null,
        notes: null,
        measurementType: null,
        sohPercent: 12.4,
        voltageV: 12.4,
        restingVoltage: null,
        crankingVoltage: null,
        chargingVoltage: null,
        temperatureC: null,
        serviceEventId: 'evt-1',
        evidenceIds: ['ev-1', 'ev-2', 'ev-3'],
      });

      expect(ids).toEqual(['gt-repl']);
      expect(groundTruth.admitAndPersist).toHaveBeenCalledTimes(1);
    });

    it('DOC-J — cross-tenant document fails closed', async () => {
      const { svc, prisma } = createHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
        ...appliedDocument(),
        organizationId: 'org-other',
      });

      await expect(
        svc.convergeDocumentApplyGroundTruth({
          organizationId: org,
          vehicleId: veh,
          documentExtractionId: docId,
          scope: BatteryEvidenceScope.LV,
          isReplacement: true,
          observedAt,
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
          serviceEventId: 'evt-1',
          evidenceIds: [],
        }),
      ).rejects.toBeInstanceOf(GroundTruthEmissionFailedError);
    });
  });

  describe('manual confirmation', () => {
    const eventRow = {
      id: 'evt-man-1',
      eventType: ServiceEventType.BATTERY_REPLACEMENT,
      eventDate: observedAt,
      origin: ServiceEventOrigin.MANUAL,
      organizationId: org,
      vehicleId: veh,
    };

    it('MAN-B/C — explicit confirmed replacement admitted', async () => {
      const { svc, prisma, groundTruth, groundTruthRepository } = createHarness();
      prisma.vehicleServiceEvent.findFirst.mockResolvedValue(eventRow);
      groundTruthRepository.findActiveReplacementBySourceEvent.mockResolvedValue(null);
      prisma.batteryGroundTruthEvent.findFirst.mockResolvedValue(null);
      groundTruth.admitAndPersist.mockResolvedValue({
        outcome: 'PERSISTED',
        groundTruthEventId: 'gt-man',
        admission: { level: GROUND_TRUTH_ADMISSION_LEVEL.ADMIT_VALIDATION_GROUND_TRUTH, reasons: [] },
      });

      const result = await svc.confirmManualBatteryReplacement({
        organizationId: org,
        vehicleId: veh,
        serviceEventId: 'evt-man-1',
        batteryScope: BatteryEvidenceScope.LV,
        actorUserId: 'user-1',
      });

      expect(result.groundTruthEventId).toBe('gt-man');
      expect(groundTruth.admitAndPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAuthority: 'MANUAL_CONFIRMED',
          manualConfirmationTrusted: true,
          confirmedByUserId: 'user-1',
        }),
      );
    });

    it('MAN-E — wrong event type rejected', async () => {
      const { svc, prisma } = createHarness();
      prisma.vehicleServiceEvent.findFirst.mockResolvedValue({
        ...eventRow,
        eventType: ServiceEventType.FULL_SERVICE,
      });

      await expect(
        svc.confirmManualBatteryReplacement({
          organizationId: org,
          vehicleId: veh,
          serviceEventId: 'evt-man-1',
          batteryScope: BatteryEvidenceScope.LV,
          actorUserId: 'user-1',
        }),
      ).rejects.toMatchObject({ code: 'GT_WRONG_SERVICE_EVENT_TYPE' });
    });

    it('MAN-H — repeated confirm is idempotent', async () => {
      const { svc, prisma, groundTruth, groundTruthRepository } = createHarness();
      prisma.vehicleServiceEvent.findFirst.mockResolvedValue(eventRow);
      groundTruthRepository.findActiveReplacementBySourceEvent.mockResolvedValue({
        id: 'gt-existing',
        batteryScope: BatteryEvidenceScope.LV,
      });

      const result = await svc.confirmManualBatteryReplacement({
        organizationId: org,
        vehicleId: veh,
        serviceEventId: 'evt-man-1',
        batteryScope: BatteryEvidenceScope.LV,
        actorUserId: 'user-1',
      });

      expect(result.groundTruthEventId).toBe('gt-existing');
      expect(groundTruth.admitAndPersist).not.toHaveBeenCalled();
    });

    it('MAN-I — conflicting scope fails closed', async () => {
      const { svc, prisma, groundTruthRepository } = createHarness();
      prisma.vehicleServiceEvent.findFirst.mockResolvedValue(eventRow);
      groundTruthRepository.findActiveReplacementBySourceEvent.mockResolvedValue({
        id: 'gt-hv',
        batteryScope: BatteryEvidenceScope.HV,
      });

      await expect(
        svc.confirmManualBatteryReplacement({
          organizationId: org,
          vehicleId: veh,
          serviceEventId: 'evt-man-1',
          batteryScope: BatteryEvidenceScope.LV,
          actorUserId: 'user-1',
        }),
      ).rejects.toBeInstanceOf(ManualGroundTruthConfirmationConflictError);
    });
  });
});
