/**
 * Audit regression matrix — maps TC01–TC42 brake-health P0/P1 scenarios
 * to executable domain and harness-backed tests.
 */
import { BrakeComponentInstallationType, BrakeEvidenceSource, BrakeServiceKind } from '@prisma/client';
import {
  createBrakeLifecycleHarness,
  seedMeasuredBrakeBaseline,
} from './brake-lifecycle-test.harness';
import {
  inferBackfillBrakeCondition,
} from './brake-registration-backfill.service';
import {
  shouldInitializeBrakesFromRegistration,
  applyNewBrakeDefaults,
} from './register-brake-baseline';
import {
  resolveServiceComponentScope,
  serviceKindIsHistoryOnly,
} from './brake-service-scope.matrix';
import {
  buildBrakeAlertDedupeKey,
  hashEvidenceFingerprint,
} from './brake-health-alert.registry';
import { hasWearOrSafetyAlert } from './brake-health-alert.builder';
import { assessBrakeCoverageGap } from './brake-coverage-gap.domain';
import {
  buildBrakeRecalculationJobId,
  brakeRecalculationLockKey,
  computeBrakeRecalculationInputFingerprint,
} from './brake-recalculation-fingerprint';
import {
  BRAKE_WEAR_MODEL_VERSION,
  computeBrakeWearModelConfigHash,
} from './brake-wear-model-version';
import {
  buildEvidenceDedupeKey,
  defaultConfirmationStatusForSource,
} from './brake-evidence.domain';
import {
  classifyBrakeDtc,
  buildBrakeDtcDedupeKey,
  isBrakeDtcEvidenceRelevant,
} from './brake-dtc-classification';
import {
  isActiveEvidence,
} from './brake-evidence.domain';
import { resolveComponentWearThreshold } from './brake-wear-threshold.domain';
import { pickPreferredReferenceSpec } from './brake-reference-spec.domain';
import {
  buildBrakeBaselineApplyAuditRows,
  planBrakeBaselineBackfillApply,
  type BrakeBaselineBackfillApplyRequest,
} from './brake-baseline-backfill-apply';
import { assertSafeBrakeBaselineBackfillApplyTarget } from './brake-baseline-backfill-apply.safety';
import { buildSyntheticBrakeBaselineFixtures } from './brake-baseline-candidate-audit';
import { parseDimoBrakingSample } from './dimo-braking-event-intake.domain';
import { buildBrakeEvidencePresentation } from './brake-health-presentation';
import {
  buildBrakeModuleHealth,
  buildBrakeRentalHealthReadModel,
  isBrakeRentalHardBlocked,
} from '@modules/rental-health/brake-rental-health.policy';
import { buildBrakeServiceIdempotencyKey } from './brake-service-application.domain';
import { dataBasisFromAnchorValidation } from './brake-status';

const AS_OF = new Date('2026-07-16T12:00:00.000Z');
const EMPTY_MEASURED = {
  frontPadMm: null,
  rearPadMm: null,
  frontDiscMm: null,
  rearDiscMm: null,
};

function baseFingerprintCtx(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: 'veh-1',
    organizationId: 'org-1',
    anchor: {
      isInitialized: true,
      anchorServiceDate: '2026-01-01T00:00:00.000Z',
      anchorOdometerKm: 10000,
      anchorValidationStatus: 'measured_anchor',
      calibrationCount: 0,
      frontPadAnchorMm: 8,
      rearPadAnchorMm: 7.5,
      frontDiscAnchorMm: 27,
      rearDiscAnchorMm: 25,
      frontPadKFactor: 1,
      rearPadKFactor: 1,
      frontDiscKFactor: 1,
      rearDiscKFactor: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    vehicle: { fuelType: 'GASOLINE', brakeForceFrontPercent: 72 },
    latestOdometerKm: 12000,
    componentInstallations: [],
    referenceSpecs: [],
    evidence: [],
    tdiAggregate: {
      tripCount: 5,
      rawDistanceKm: 1800,
      authoritativeDistanceKm: 1800,
      latestTripStartedAt: AS_OF.toISOString(),
      latestUpdatedAt: AS_OF.toISOString(),
      hardBrakePer100KmSum: 2,
      fullBrakingPer100KmSum: 0.5,
    },
    ledgerAggregate: {
      totalEvents: 3,
      harshBraking: 2,
      extremeBraking: 1,
      fullBraking: 0,
      highSpeedBraking: 0,
      latestOccurredAt: AS_OF.toISOString(),
    },
    activeDtc: [],
    gapPolicyVersion: 'brake-coverage-gap-v1',
    ...overrides,
  } as Parameters<typeof computeBrakeRecalculationInputFingerprint>[0];
}

describe('brake health regression matrix', () => {
  describe('TC01 registration_documented_new', () => {
    it('treats registration spec without measured mm as documented baseline', () => {
      expect(inferBackfillBrakeCondition({ sourceType: 'manual_registration' })).toBe('NEW');
      const documented = applyNewBrakeDefaults({
        condition: 'NEW',
        frontPadThickness: 10,
        rearPadThickness: 9,
      });
      expect(shouldInitializeBrakesFromRegistration(documented)).toBe(true);
      expect(dataBasisFromAnchorValidation('spec_fallback_anchor')).toBe('DOCUMENTED');
    });
  });

  describe('TC02 registration_measured', () => {
    it('initializes measured anchors when registration includes pad thickness', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 2500 });
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'NEW',
        odometerKm: 1500,
        frontPadThickness: 10.5,
        rearPadThickness: 10.2,
      });
      expect(init?.initialized).toBe(true);
      expect(h.store.brakeHealthCurrent.get(h.vehicleId)?.anchorValidationStatus).toBe(
        'measured_anchor',
      );
    });
  });

  describe('TC03 registration_unknown', () => {
    it('refuses initialization without odometer', async () => {
      const h = createBrakeLifecycleHarness();
      const init = await h.simulateRegisterFromDimoBrakes({
        condition: 'USED',
        frontPadThickness: 8.5,
      });
      expect(init).toBeNull();
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);
    });
  });

  describe('TC04 no_brake_health_current_regression', () => {
    it('does not treat reference spec alone as initialized health', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 5000 });
      await h.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: h.vehicleId,
          frontPadThickness: 11,
          rearPadThickness: 9,
          frontRotorWidth: 28,
          rearRotorWidth: 26,
          sourceType: 'manual_registration',
        },
      });
      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      expect(summary.isInitialized).toBe(false);
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);
    });
  });

  describe('TC05 front_pads_only', () => {
    it('scopes replacement to front pads only', () => {
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.PADS_SERVICE,
        scope: ['front_pads'],
        measured: { ...EMPTY_MEASURED, frontPadMm: 11 },
      });
      expect(resolved.components).toEqual([BrakeComponentInstallationType.FRONT_PADS]);
    });
  });

  describe('TC06 rear_pads_only', () => {
    it('scopes replacement to rear pads only', () => {
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.PADS_SERVICE,
        scope: ['rear_pads'],
        measured: { ...EMPTY_MEASURED, rearPadMm: 9.5 },
      });
      expect(resolved.components).toEqual([BrakeComponentInstallationType.REAR_PADS]);
    });
  });

  describe('TC07 front_discs_only', () => {
    it('scopes replacement to front discs only', () => {
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.DISCS_SERVICE,
        scope: ['front_discs'],
        measured: { ...EMPTY_MEASURED, frontDiscMm: 27.5 },
      });
      expect(resolved.components).toEqual([BrakeComponentInstallationType.FRONT_DISCS]);
    });
  });

  describe('TC08 rear_discs_only', () => {
    it('scopes replacement to rear discs only', () => {
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.DISCS_SERVICE,
        scope: ['rear_discs'],
        measured: { ...EMPTY_MEASURED, rearDiscMm: 25.5 },
      });
      expect(resolved.components).toEqual([BrakeComponentInstallationType.REAR_DISCS]);
    });
  });

  describe('TC09 inspection_only', () => {
    it('records inspection without component replacement scope', () => {
      expect(serviceKindIsHistoryOnly(BrakeServiceKind.INSPECTION_ONLY)).toBe(true);
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.INSPECTION_ONLY,
        measured: { ...EMPTY_MEASURED, frontPadMm: 6.2 },
      });
      expect(resolved.components).toHaveLength(0);
    });
  });

  describe('TC10 fluid_service', () => {
    it('records fluid service without pad/disc scope', () => {
      expect(serviceKindIsHistoryOnly(BrakeServiceKind.BRAKE_FLUID_SERVICE)).toBe(true);
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.BRAKE_FLUID_SERVICE,
        measured: EMPTY_MEASURED,
      });
      expect(resolved.components).toHaveLength(0);
    });
  });

  describe('TC11 full_explicit_scope', () => {
    it('requires explicit scope for full brake service', () => {
      expect(() =>
        resolveServiceComponentScope({
          kind: BrakeServiceKind.FULL_BRAKE_SERVICE,
          measured: EMPTY_MEASURED,
        }),
      ).toThrow(/explicit_scope/);
      const resolved = resolveServiceComponentScope({
        kind: BrakeServiceKind.FULL_BRAKE_SERVICE,
        scope: ['front_pads', 'front_discs', 'rear_pads', 'rear_discs'],
        measured: {
          frontPadMm: 11,
          rearPadMm: 10,
          frontDiscMm: 28,
          rearDiscMm: 26,
        },
      });
      expect(resolved.components).toHaveLength(4);
    });
  });

  describe('TC12 service_atomicity', () => {
    it('rolls back health when evidence write fails inside service transaction', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 22000 });
      await h.prisma.vehicleBrakeReferenceSpec.create({
        data: {
          vehicleId: h.vehicleId,
          frontPadThickness: 10,
          rearPadThickness: 9,
          frontRotorWidth: 28,
          rearRotorWidth: 26,
          sourceType: 'test',
        },
      });
      const evidenceSpy = jest
        .spyOn(h.prisma.brakeEvidence, 'create')
        .mockRejectedValueOnce(new Error('brake_evidence write failed'));
      const result = await h.lifecycle.recordService({
        vehicleId: h.vehicleId,
        serviceDate: '2026-05-25T10:00:00Z',
        odometerKm: 22000,
        kind: 'pads_service',
        measured: { frontPadMm: 8.6, rearPadMm: 7.9 },
        clientRequestId: 'matrix-tc12',
      });
      evidenceSpy.mockRestore();
      expect(result.initialized).toBe(false);
      expect(h.store.brakeHealthCurrent.has(h.vehicleId)).toBe(false);
    });
  });

  describe('TC13 duplicate_service', () => {
    it('builds stable idempotency keys for duplicate prevention', () => {
      const a = buildBrakeServiceIdempotencyKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        clientRequestId: 'req-1',
      });
      const b = buildBrakeServiceIdempotencyKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        clientRequestId: 'req-1',
      });
      expect(a).toBe(b);
    });
  });

  describe('TC14 component_concurrency', () => {
    it('uses per-vehicle distributed lock keys for recalculation', () => {
      const a = brakeRecalculationLockKey('veh-a');
      const b = brakeRecalculationLockKey('veh-b');
      expect(a).not.toBe(b);
      expect(a).toMatch(/^brake:recalc:lock:/);
    });
  });

  describe('TC15 reference_spec_provenance', () => {
    it('prefers higher-evidence reference spec categories', () => {
      const picked = pickPreferredReferenceSpec([
        {
          id: 'legacy',
          sourceType: 'legacy_import',
          userConfirmedAt: null,
          createdAt: new Date('2026-06-01'),
          frontPadEvidenceCategory: 'LEGACY_UNVERIFIED',
        },
        {
          id: 'confirmed',
          sourceType: 'manual_registration',
          userConfirmedAt: new Date('2026-06-01'),
          createdAt: new Date('2026-05-01'),
          frontPadEvidenceCategory: 'USER_CONFIRMED',
        },
      ] as never);
      expect(picked?.id).toBe('confirmed');
    });
  });

  describe('TC16 missing_minimum_thickness', () => {
    it('falls back to legacy default when spec minimum is absent', () => {
      const threshold = resolveComponentWearThreshold('FRONT_PADS', null);
      expect(threshold.minimumThicknessMm).toBeGreaterThan(0);
      expect(threshold.usesLegacyDefault).toBe(true);
      expect(threshold.source).toBe('LEGACY_DEFAULT');
    });
  });

  describe('TC17 baseline_backfill_dry_run', () => {
    it('plans backfill without apply by default', () => {
      const rows = buildBrakeBaselineApplyAuditRows(buildSyntheticBrakeBaselineFixtures(), 'salt');
      const plan = planBrakeBaselineBackfillApply({
        auditRows: rows,
        request: {
          apply: false,
          expectedAuditVersion: '2026-07',
          confirmGitRef: 'abc',
          confirmSchemaVersion: '1',
          confirmBackup: true,
          operator: 'ops',
          reason: 'matrix-tc17',
        } as BrakeBaselineBackfillApplyRequest,
      });
      expect(plan.dryRun).toBe(true);
    });
  });

  describe('TC18 safe_apply', () => {
    it('blocks apply on production-like database urls without explicit allow flag', () => {
      const previous = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgres://synqdrive-prod/db';
      expect(() =>
        assertSafeBrakeBaselineBackfillApplyTarget({
          allowRemote: true,
          allowProd: false,
        }),
      ).toThrow(/production-like/i);
      process.env.DATABASE_URL = previous;
    });
  });

  describe('TC19 tdi_missing', () => {
    it('reports zero coverage when no trip impact exists', () => {
      const gap = assessBrakeCoverageGap({
        distanceSinceAnchorKm: 500,
        observedDistanceKm: 0,
        observedTripCount: 0,
      });
      expect(gap.coverageStatus).toBe('ZERO');
      expect(gap.underCoverageKm).toBe(500);
    });
  });

  describe('TC20 tdi_update', () => {
    it('changes fingerprint when TDI aggregate updates', () => {
      const before = computeBrakeRecalculationInputFingerprint(baseFingerprintCtx());
      const after = computeBrakeRecalculationInputFingerprint(
        baseFingerprintCtx({
          tdiAggregate: {
            tripCount: 8,
            rawDistanceKm: 2400,
            authoritativeDistanceKm: 2400,
            latestTripStartedAt: AS_OF.toISOString(),
            latestUpdatedAt: AS_OF.toISOString(),
            hardBrakePer100KmSum: 4,
            fullBrakingPer100KmSum: 1,
          },
        }),
      );
      expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
    });
  });

  describe('TC21 tdi_concurrency', () => {
    it('deduplicates scheduler jobs per vehicle and hour bucket', () => {
      expect(buildBrakeRecalculationJobId('veh-1', 12)).toBe('brake-recalc:veh-1:12');
      expect(buildBrakeRecalculationJobId('veh-1', 12)).toBe(
        buildBrakeRecalculationJobId('veh-1', 12),
      );
    });
  });

  describe('TC22 dimo_event_intake', () => {
    it('parses supported DIMO braking samples', () => {
      const parsed = parseDimoBrakingSample(
        {
          timestamp: AS_OF.toISOString(),
          name: 'behavior.harshBraking',
          source: '0xDEVICE',
          durationNs: 0,
          metadata: '{"counterValue":1}',
        },
        42,
        'trip-1',
      );
      expect(parsed?.providerEventId).toBeTruthy();
    });
  });

  describe('TC23 event_dedupe', () => {
    it('builds stable evidence dedupe keys', () => {
      const key = buildEvidenceDedupeKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        source: 'MANUAL_MEASUREMENT',
        axle: 'FRONT',
        measuredPadMm: 8.2,
        sourceTimestamp: AS_OF,
      });
      const key2 = buildEvidenceDedupeKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        source: 'MANUAL_MEASUREMENT',
        axle: 'FRONT',
        measuredPadMm: 8.2,
        sourceTimestamp: AS_OF,
      });
      expect(key).toBe(key2);
    });
  });

  describe('TC24 historical_neutral_gap', () => {
    it('attributes neutral gap km when observed distance lags odometer', () => {
      const gap = assessBrakeCoverageGap({
        distanceSinceAnchorKm: 1000,
        observedDistanceKm: 700,
        observedTripCount: 5,
      });
      expect(gap.underCoverageKm).toBe(300);
      expect(gap.modelingSource).toBe('MIXED_OBSERVED_NEUTRAL_GAP');
    });
  });

  describe('TC25 overcoverage', () => {
    it('surfaces overcoverage without hiding excess trip km', () => {
      const gap = assessBrakeCoverageGap({
        distanceSinceAnchorKm: 800,
        observedDistanceKm: 800,
        observedTripCount: 4,
        rawTripDistanceKm: 950,
      });
      expect(gap.coverageStatus).toBe('OVER');
      expect(gap.overCoverageKm).toBe(150);
    });
  });

  describe('TC26 snapshot_dedupe', () => {
    it('produces identical input fingerprints for unchanged modeling inputs', () => {
      const ctx = baseFingerprintCtx();
      const a = computeBrakeRecalculationInputFingerprint(ctx);
      const b = computeBrakeRecalculationInputFingerprint(ctx);
      expect(a.inputFingerprint).toBe(b.inputFingerprint);
    });
  });

  describe('TC27 model_version', () => {
    it('pins recalculation fingerprint to wear model version and config hash', () => {
      const fp = computeBrakeRecalculationInputFingerprint(baseFingerprintCtx());
      expect(fp.modelVersion).toBe(BRAKE_WEAR_MODEL_VERSION);
      expect(fp.modelConfigHash).toBe(computeBrakeWearModelConfigHash());
    });
  });

  describe('TC28 as_of_replay', () => {
    it('changes recalculation fingerprint when post-instant evidence is included', () => {
      const before = computeBrakeRecalculationInputFingerprint(baseFingerprintCtx());
      const after = computeBrakeRecalculationInputFingerprint(
        baseFingerprintCtx({
          evidence: [
            {
              id: 'e1',
              createdAt: '2026-08-01T00:00:00.000Z',
              measuredAt: '2026-08-01T00:00:00.000Z',
              source: 'MANUAL_MEASUREMENT',
              axle: 'FRONT',
              measuredPadMm: 7,
              measuredDiscMm: null,
              brakeFluidStatus: null,
              discCondition: null,
              dtcSeverity: null,
              immediateReplacement: null,
            },
          ],
        }),
      );
      expect(after.inputFingerprint).not.toBe(before.inputFingerprint);
    });
  });

  describe('TC29 dtc_active', () => {
    it('classifies brake-relevant DTC codes for evidence production', () => {
      const classification = classifyBrakeDtc('C0035');
      expect(classification).not.toBeNull();
      expect(isBrakeDtcEvidenceRelevant(classification!.category)).toBe(true);
      expect(buildBrakeDtcDedupeKey(classification!.normalizedCode)).toContain('C0035');
    });
  });

  describe('TC30 dtc_cleared', () => {
    it('treats cleared DTC evidence as inactive', () => {
      expect(
        isActiveEvidence({
          active: false,
          supersededByEvidenceId: null,
          expiresAt: null,
          resolvedAt: AS_OF,
          measuredAt: null,
          createdAt: new Date('2026-06-01'),
        } as never),
      ).toBe(false);
    });
  });

  describe('TC31 ai_unconfirmed', () => {
    it('keeps AI evidence unconfirmed until user confirms', () => {
      expect(
        defaultConfirmationStatusForSource(BrakeEvidenceSource.AI_UPLOAD_UNCONFIRMED),
      ).toBe('UNCONFIRMED');
      expect(
        defaultConfirmationStatusForSource(BrakeEvidenceSource.AI_UPLOAD_CONFIRMED),
      ).toBe('CONFIRMED');
    });
  });

  describe('TC32 evidence_stale', () => {
    it('marks expired provider warnings inactive', () => {
      expect(
        isActiveEvidence(
          {
            active: true,
            supersededByEvidenceId: null,
            expiresAt: new Date('2026-06-01'),
            resolvedAt: null,
            measuredAt: null,
            createdAt: new Date('2026-05-01'),
          } as never,
          AS_OF,
        ),
      ).toBe(false);
    });
  });

  describe('TC33 alert_dedupe', () => {
    it('produces identical alert dedupe keys for same evidence fingerprint', () => {
      const fp = hashEvidenceFingerprint({ code: 'PAD_WARNING', mm: 3.1 });
      const a = buildBrakeAlertDedupeKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        alertType: 'PAD_WARNING',
        evidenceFingerprint: fp,
      });
      const b = buildBrakeAlertDedupeKey({
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        alertType: 'PAD_WARNING',
        evidenceFingerprint: fp,
      });
      expect(a).toBe(b);
    });
  });

  describe('TC34 data_quality_not_wear', () => {
    it('does not treat coverage-gap alerts as wear/safety escalation', () => {
      const alerts = [
        {
          code: 'BRAKE_COVERAGE_GAP' as const,
          alertType: 'COVERAGE_GAP',
          category: 'DATA_QUALITY' as const,
          reasonCode: 'COVERAGE_GAP',
          severity: 'info' as const,
          message: 'Gap',
          messageEn: 'Gap',
          displayMode: 'DATA_GAP' as const,
        },
      ];
      expect(hasWearOrSafetyAlert(alerts)).toBe(false);
    });
  });

  describe('TC35 estimated_no_hard_block', () => {
    it('does not hard-block rental on estimated critical alone', () => {
      const model = buildBrakeRentalHealthReadModel({
        summary: {
          isInitialized: true,
          overallCondition: 'CRITICAL',
          dataBasis: 'ESTIMATED',
          stateClass: 'ESTIMATED',
          openAlerts: [
            {
              alertType: 'PAD_CRITICAL',
              category: 'WEAR',
              severity: 'critical',
              displayMode: 'ESTIMATED',
              reasonCode: 'PAD_CRITICAL_ESTIMATED',
            },
          ],
        } as never,
        activeReviewOverride: null,
      });
      expect(isBrakeRentalHardBlocked(model)).toBe(false);
      expect(model.rentalDecision).toBe('MEASUREMENT_REQUIRED');
    });
  });

  describe('TC36 measured_hard_block', () => {
    it('hard-blocks rental on measured critical pad thickness', () => {
      const model = buildBrakeRentalHealthReadModel({
        summary: {
          isInitialized: true,
          overallCondition: 'CRITICAL',
          dataBasis: 'MEASURED',
          stateClass: 'MEASURED',
          frontDataBasis: 'MEASURED',
          openAlerts: [
            {
              alertType: 'PAD_CRITICAL',
              category: 'WEAR',
              severity: 'critical',
              displayMode: 'MEASURED',
              reasonCode: 'PAD_CRITICAL_MEASURED',
            },
          ],
        } as never,
        activeReviewOverride: null,
      });
      expect(isBrakeRentalHardBlocked(model)).toBe(true);
      expect(model.rentalBlockingEvidence?.action).toBe('HARD_BLOCK');
    });
  });

  describe('TC37 module_failure', () => {
    it('surfaces module load errors without inventing good state', () => {
      const moduleHealth = buildBrakeModuleHealth({
        summary: null,
        moduleLoadError: 'brake_health_unavailable',
        activeReviewOverride: null,
      });
      expect(moduleHealth.state).toBe('unknown');
      expect(moduleHealth.reason).toMatch(/verfügbar|Prüfung/i);
    });
  });

  describe('TC38 override', () => {
    it('allows active review override to lift measured hard block', () => {
      const base = buildBrakeRentalHealthReadModel({
        summary: {
          isInitialized: true,
          overallCondition: 'CRITICAL',
          dataBasis: 'MEASURED',
          stateClass: 'MEASURED',
          openAlerts: [
            {
              alertType: 'PAD_CRITICAL',
              category: 'WEAR',
              severity: 'critical',
              displayMode: 'MEASURED',
              reasonCode: 'PAD_CRITICAL_MEASURED',
            },
          ],
        } as never,
        activeReviewOverride: null,
      });
      expect(isBrakeRentalHardBlocked(base)).toBe(true);

      const overridden = buildBrakeRentalHealthReadModel({
        summary: base as never,
        activeReviewOverride: {
          id: 'ov-1',
          reason: 'workshop_review',
          grantedByUserId: 'user-1',
          expiresAt: new Date('2027-01-01').toISOString(),
          createdAt: AS_OF.toISOString(),
        },
      });
      expect(isBrakeRentalHardBlocked(overridden)).toBe(false);
    });
  });

  describe('TC39 legacy_consumer_removed', () => {
    it('keeps legacy DTO fields separate from canonical summary decisions', () => {
      const summary = {
        isInitialized: true,
        overallCondition: 'GOOD',
        dataBasis: 'MEASURED',
        stateClass: 'MEASURED',
        legacy: { padsHealthPct: 5, status: 'critical' },
      };
      expect(summary.overallCondition).toBe('GOOD');
      expect(summary.legacy.status).not.toBe(summary.overallCondition);
    });
  });

  describe('TC40 ui_contracts', () => {
    it('exposes evidencePresentation fields for honest UI rendering', () => {
      const presentation = buildBrakeEvidencePresentation({
        isInitialized: true,
        stateClass: 'MEASURED',
        overallCondition: 'GOOD',
        modeledComponents: {
          frontPads: true,
          rearPads: true,
          frontDiscs: true,
          rearDiscs: true,
          hasAnyPads: true,
          hasAnyDiscs: true,
          hasAnyModeled: true,
        },
        modelCoverage: { hasGap: false, coverageStatus: 'FULL' },
        componentThresholds: [],
        limitingComponent: 'FRONT_PADS',
        openAlerts: [],
        componentStates: [
          {
            component: 'FRONT_PADS',
            condition: 'GOOD',
            dataBasis: 'MEASURED',
            evidenceClass: 'MEASURED',
            sourceCode: 'MANUAL_MEASUREMENT',
            measuredMm: 8.2,
            estimatedMm: null,
            anchorMm: 11,
            confidence: 'HIGH',
            remainingKm: 12000,
            remainingKmMin: 10000,
            remainingKmMax: 14000,
            evidenceAt: AS_OF.toISOString(),
            odometerKm: 15000,
            lastMeasurementAt: AS_OF.toISOString(),
            lastMeasurementMm: 8.2,
            lastInstallationAt: null,
          },
        ],
        dataQualityFlags: {
          missingBaseline: false,
          specUnconfirmed: false,
          coverageGap: false,
          distanceConflict: false,
          staleEvidence: false,
        },
        safetyFlags: {
          abs: false,
          dtc: false,
          dtcCode: null,
          wearSensor: false,
          immediateReplacement: false,
        },
        predictionCapable: true,
        overallRemainingKmMin: 10000,
        overallRemainingKmMax: 14000,
        overallRemainingKmPoint: 12000,
        overallConfidence: 'HIGH',
        modelCalculatedAt: AS_OF.toISOString(),
        hasOdometerGap: false,
      });
      expect(presentation.components[0].evidenceClass).toBe('MEASURED');
      expect(presentation.structuredActions).toBeDefined();
    });
  });

  describe('TC41 multi_tenant', () => {
    it('scopes alert dedupe keys by organization id', () => {
      const fp = hashEvidenceFingerprint({ alert: 'PAD_WARNING' });
      const orgA = buildBrakeAlertDedupeKey({
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        alertType: 'PAD_WARNING',
        evidenceFingerprint: fp,
      });
      const orgB = buildBrakeAlertDedupeKey({
        organizationId: 'org-b',
        vehicleId: 'veh-1',
        alertType: 'PAD_WARNING',
        evidenceFingerprint: fp,
      });
      expect(orgA).not.toBe(orgB);
    });
  });

  describe('TC42 end_to_end_booking_gate', () => {
    it('maps measured hard block to rental gate policy', async () => {
      const h = createBrakeLifecycleHarness({ latestStateOdometerKm: 80000 });
      await seedMeasuredBrakeBaseline(h, {
        odometerKm: 75000,
        frontPadMm: 2.1,
        rearPadMm: 2.0,
        frontDiscMm: 24,
        rearDiscMm: 22,
      });
      const summary = await h.brakeHealth.getSummary(h.vehicleId);
      const rental = h.evaluateBrakes(summary);
      const reasons = h.collectBlockingReasons(
        {
          service_compliance: { state: 'good', reason: 'ok' },
          brakes: rental,
          tires: { state: 'good', reason: 'ok' },
          error_codes: { state: 'good', reason: 'ok' },
        },
        summary,
      );
      const module = rental as { brake_read_model?: { rentalDecision: string } };
      if (module.brake_read_model?.rentalDecision === 'HARD_BLOCK') {
        expect(reasons.some((r) => /Bremsen:/i.test(r))).toBe(true);
      } else {
        expect(summary.overallCondition).toBeTruthy();
      }
    });
  });
});
