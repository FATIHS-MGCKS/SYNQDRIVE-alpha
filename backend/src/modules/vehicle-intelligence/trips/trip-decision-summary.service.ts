import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type {
  DriverAttributionType,
  DrivingAttributionConfidence,
  DrivingDecisionRecommendation,
  TripAssessabilityDimensionStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DrivingBehaviorEnforcementService } from '@modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.service';
import {
  DRIVING_BEHAVIOR_DATA_CATEGORY,
  DRIVING_BEHAVIOR_PATH,
  DRIVING_BEHAVIOR_PURPOSE,
  DRIVING_BEHAVIOR_SERVICE_IDENTITY,
} from '@modules/data-authorizations/driving-behavior-enforcement/driving-behavior-enforcement.constants';
import { buildDrivingAnalysisInputFingerprint } from '../driving-analysis-run/driving-analysis-run.fingerprint';
import { DrivingAnalysisRunService } from '../driving-analysis-run/driving-analysis-run.service';
import { DriverAttributionService } from '../driver-attribution/driver-attribution.service';
import { readTripDrivingImpactProvenance } from '../driving-impact/driving-impact-provenance.reader';
import { classifyStressLevel } from '../driving-impact/stress-level.util';
import { TripAssessabilityService } from '../trip-assessability/trip-assessability.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { parseBehaviorSummaryJson } from './trip-analysis-status';
import {
  TRIP_DECISION_SUMMARY_MODEL_VERSION,
  type AttributionSummaryLevel,
  type DataBasisLevel,
  type TripDecisionSummary,
  type TripListBadge,
} from './trip-decision-summary.types';

@Injectable()
export class TripDecisionSummaryService {
  private readonly logger = new Logger(TripDecisionSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assessabilityService: TripAssessabilityService,
    private readonly attributionService: DriverAttributionService,
    private readonly analysisRunService: DrivingAnalysisRunService,
    @Optional() private readonly tripMetrics?: TripMetricsService,
    @Optional() private readonly behaviorEnforcement?: DrivingBehaviorEnforcementService,
  ) {}

  async findByTrip(organizationId: string, tripId: string): Promise<TripDecisionSummary | null> {
    const run = await this.prisma.drivingAnalysisRun.findFirst({
      where: {
        organizationId,
        tripId,
        analysisType: 'TRIP_DECISION_SUMMARY',
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });
    if (!run?.stageSummaryJson || typeof run.stageSummaryJson !== 'object') return null;
    return run.stageSummaryJson as unknown as TripDecisionSummary;
  }

  async computeAndPersist(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    analysisRunId?: string | null;
  }): Promise<TripDecisionSummary> {
    if (this.behaviorEnforcement) {
      const trip = await this.prisma.vehicleTrip.findUnique({
        where: { id: input.tripId },
        select: { startTime: true },
      });
      const mayProfile = await this.behaviorEnforcement.mayProfile({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        dataCategory: DRIVING_BEHAVIOR_DATA_CATEGORY.DRIVING_BEHAVIOR,
        purpose: DRIVING_BEHAVIOR_PURPOSE.AUTOMATED_ASSESSMENT,
        processingPath: DRIVING_BEHAVIOR_PATH.TRIP_DECISION_SUMMARY,
        serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.TRIP_DECISION_API,
        correlationId: `trip-decision:${input.tripId}`,
        tripId: input.tripId,
        effectiveTimestamp: trip?.startTime ?? null,
        isReprocess: true,
      });
      if (!mayProfile) {
        this.logger.warn(`Trip decision summary profile denied trip=${input.tripId}`);
        return this.buildDeniedSummary(input.tripId);
      }
    }

    const summary = await this.buildSummary(input.organizationId, input.vehicleId, input.tripId);
    const fingerprint = buildDrivingAnalysisInputFingerprint({
      organizationId: input.organizationId,
      tripId: input.tripId,
      vehicleId: input.vehicleId,
      analysisType: 'TRIP_DECISION_SUMMARY',
      capabilityVersion: summary.modelVersion,
      inputTags: [summary.dataBasis, summary.recommendation.level],
    });

    const runResult = await this.analysisRunService.resolveOrBeginRun({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tripId: input.tripId,
      analysisType: 'TRIP_DECISION_SUMMARY',
      modelVersion: TRIP_DECISION_SUMMARY_MODEL_VERSION,
      capabilityVersion: TRIP_DECISION_SUMMARY_MODEL_VERSION,
      inputIdentity: {
        organizationId: input.organizationId,
        tripId: input.tripId,
        vehicleId: input.vehicleId,
        analysisType: 'TRIP_DECISION_SUMMARY',
        capabilityVersion: TRIP_DECISION_SUMMARY_MODEL_VERSION,
        inputTags: [summary.dataBasis, summary.recommendation.level],
      },
      maturity: 'SHADOW',
    });

    await this.analysisRunService.completeRun({
      organizationId: input.organizationId,
      runId: runResult.run.id,
      stageSummary: summary as unknown as Record<string, unknown>,
    });

    this.tripMetrics?.drivingDecisionSummaryComputed.inc({
      data_basis: summary.dataBasis,
      recommendation: summary.recommendation.level,
    });

    this.logger.log(
      `Trip decision summary persisted trip=${input.tripId} recommendation=${summary.recommendation.level}`,
    );

    return { ...summary, inputFingerprint: fingerprint };
  }

  async buildSummary(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<TripDecisionSummary> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId }, vehicleId },
      select: {
        id: true,
        distanceKm: true,
        durationMinutes: true,
        behaviorEnrichmentStatus: true,
        behaviorSummaryJson: true,
        analysisStagesJson: true,
        tripAnalysisStatus: true,
        drivingImpactStatus: true,
        hardBrakingEvents: true,
        hardAccelerationEvents: true,
        isPrivateTrip: true,
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    const [assessabilityRows, attribution, impact, misuseCases] = await Promise.all([
      this.assessabilityService.findByTrip(organizationId, tripId),
      this.attributionService.resolveCanonicalForTrip(organizationId, tripId),
      this.prisma.tripDrivingImpact.findUnique({ where: { tripId } }),
      this.prisma.misuseCase.findMany({
        where: { organizationId, tripId },
        select: { id: true, severity: true, category: true },
      }),
    ]);

    const behaviorSummary = parseBehaviorSummaryJson(trip.behaviorSummaryJson);
    const stages =
      trip.analysisStagesJson && typeof trip.analysisStagesJson === 'object'
        ? Object.fromEntries(
            Object.entries(trip.analysisStagesJson as Record<string, string>).map(([k, v]) => [
              k,
              typeof v === 'string' ? v : null,
            ]),
          )
        : {};

    const dataBasis = this.deriveDataBasis(assessabilityRows, behaviorSummary);
    const vehicleLoad = this.deriveVehicleLoad(impact, trip.distanceKm);
    const driverConduct = this.deriveDriverConduct(
      assessabilityRows,
      trip,
      behaviorSummary,
      impact,
    );
    const misuseEvidence = this.deriveMisuseEvidence(misuseCases);
    const attributionSummary = this.deriveAttribution(attribution, trip.isPrivateTrip);
    const recommendation = this.deriveRecommendation({
      dataBasis,
      vehicleLoad,
      driverConduct,
      misuseEvidence,
      attribution: attributionSummary,
      deviceQualityDegraded: behaviorSummary.deviceQualityWarning === true,
    });

    const partial =
      trip.tripAnalysisStatus === 'PARTIAL' ||
      trip.tripAnalysisStatus === 'IN_PROGRESS' ||
      Object.values(stages).some((v) => v === 'failed' || v === 'pending');

    return {
      modelVersion: TRIP_DECISION_SUMMARY_MODEL_VERSION,
      inputFingerprint: '',
      computedAt: new Date().toISOString(),
      dataBasis,
      dataBasisReasons: this.dataBasisReasons(assessabilityRows, behaviorSummary),
      vehicleLoad,
      driverConduct,
      misuseEvidence,
      attribution: attributionSummary,
      recommendation,
      partial,
      stages,
    };
  }

  toListBadge(summary: TripDecisionSummary): TripListBadge {
    return {
      recommendation: summary.recommendation.level,
      dataBasis: summary.dataBasis,
    };
  }

  private deriveDataBasis(
    rows: Array<{ dimension: string; status: TripAssessabilityDimensionStatus }>,
    behaviorSummary: ReturnType<typeof parseBehaviorSummaryJson>,
  ): DataBasisLevel {
    if (behaviorSummary.deviceQualityWarning) return 'EINGESCHRAENKT';
    if (rows.length === 0) return 'UNZUREICHEND';

    const statuses = rows.map((r) => r.status);
    if (statuses.every((s) => s === 'UNSUPPORTED' || s === 'NOT_APPLICABLE')) return 'NICHT_UNTERSTUETZT';
    if (statuses.some((s) => s === 'INSUFFICIENT_DATA' || s === 'LIMITED' || s === 'PROVIDER_ERROR')) {
      return 'EINGESCHRAENKT';
    }
    if (statuses.filter((s) => s === 'ASSESSABLE').length >= 4) return 'BELASTBAR';
    return 'UNZUREICHEND';
  }

  private dataBasisReasons(
    rows: Array<{ dimension: string; status: TripAssessabilityDimensionStatus; reasonsJson?: unknown }>,
    behaviorSummary: ReturnType<typeof parseBehaviorSummaryJson>,
  ): string[] {
    const reasons: string[] = [];
    if (behaviorSummary.deviceQualityWarning) {
      reasons.push('DEVICE_NATIVE_EVENT_QUALITY');
    }
    for (const row of rows) {
      if (row.status === 'LIMITED' || row.status === 'INSUFFICIENT_DATA' || row.status === 'PROVIDER_ERROR') {
        reasons.push(`${row.dimension}:${row.status}`);
      }
    }
    return reasons.slice(0, 8);
  }

  private deriveVehicleLoad(
    impact: {
      drivingStressScore: number | null;
      hardBrakePer100Km: number | null;
      hardAccelPer100Km: number | null;
      healthEligibility: string | null;
      sourceSummaryJson: unknown;
    } | null,
    distanceKm: number | null,
  ): TripDecisionSummary['vehicleLoad'] {
    if (!impact) return null;

    const provenance = readTripDrivingImpactProvenance(impact as any);
    const stressLevel = classifyStressLevel(impact.drivingStressScore);
    const level = (
      stressLevel === 'critical'
        ? 'STARK_ERHOHT'
        : stressLevel === 'high'
          ? 'ERHOHT'
          : stressLevel === 'moderate'
            ? 'NORMAL'
            : 'SCHONEND'
    ) as NonNullable<TripDecisionSummary['vehicleLoad']>['level'];

    return {
      level,
      score: impact.drivingStressScore,
      per100km: {
        hardBrakes: impact.hardBrakePer100Km ?? 0,
        hardAccelerations: impact.hardAccelPer100Km ?? 0,
      },
      evidenceStrength:
        provenance.healthEligibility === 'HIGH'
          ? 'HIGH'
          : provenance.healthEligibility === 'MEDIUM'
            ? 'MEDIUM'
            : provenance.healthEligibility === 'LOW'
              ? 'LOW'
              : 'NONE',
    };
  }

  private deriveDriverConduct(
    rows: Array<{ dimension: string; status: TripAssessabilityDimensionStatus }>,
    trip: {
      hardBrakingEvents: number;
      hardAccelerationEvents: number;
      distanceKm: number | null;
    },
    behaviorSummary: ReturnType<typeof parseBehaviorSummaryJson>,
    impact: { drivingStressScore: number | null; sourceSummaryJson: unknown } | null,
  ): TripDecisionSummary['driverConduct'] {
    const conductRow = rows.find((r) => r.dimension === 'DRIVER_CONDUCT');
    const nativeRow = rows.find((r) => r.dimension === 'NATIVE_BEHAVIOR');

    if (conductRow?.status === 'INSUFFICIENT_DATA' || conductRow?.status === 'UNSUPPORTED' || conductRow?.status === 'NOT_APPLICABLE') {
      return {
        level: 'NICHT_BEWERTBAR',
        primaryEvidence: 'NONE',
        eventCountVisible: 0,
        per100km: null,
      };
    }

    if (behaviorSummary.deviceQualityWarning) {
      return {
        level: 'NICHT_BEWERTBAR',
        primaryEvidence: 'NATIVE',
        eventCountVisible: Number(behaviorSummary.nativeEventCount ?? 0),
        per100km: null,
      };
    }

    const eventCount =
      (trip.hardBrakingEvents ?? 0) + (trip.hardAccelerationEvents ?? 0);
    const distance = trip.distanceKm ?? 0;
    const per100km = distance > 0 ? (eventCount / distance) * 100 : null;

    const provenance = impact ? readTripDrivingImpactProvenance(impact as any) : null;
    const primaryEvidence =
      provenance?.primarySource === 'PROVIDER_CLASSIFIED'
        ? 'NATIVE'
        : provenance?.primarySource === 'RECONSTRUCTED'
          ? 'RECONSTRUCTED'
          : provenance?.primarySource === 'STRESS_ONLY'
            ? 'STRESS_ONLY'
            : nativeRow?.status === 'ASSESSABLE'
              ? 'NATIVE'
              : 'RECONSTRUCTED';

    const stress = impact?.drivingStressScore ?? null;
    let level: NonNullable<TripDecisionSummary['driverConduct']>['level'] = 'UNAUFFAELLIG';
    if (eventCount >= 8 || (stress != null && stress >= 70)) level = 'STARK_AUFFAELLIG';
    else if (eventCount >= 4 || (stress != null && stress >= 50)) level = 'AUFFAELLIG';
    else if (eventCount >= 2 || (stress != null && stress >= 35)) level = 'DYNAMISCH';

    return { level, primaryEvidence, eventCountVisible: eventCount, per100km };
  }

  private deriveMisuseEvidence(
    cases: Array<{ severity: string }>,
  ): TripDecisionSummary['misuseEvidence'] {
    const caseCount = cases.length;
    let level: TripDecisionSummary['misuseEvidence']['level'] = 'KEINE';
    if (caseCount >= 3) level = 'STARKER_VERDACHT';
    else if (caseCount === 2) level = 'MEHRERE_BELASTBARE_HINWEISE';
    else if (caseCount === 1) level = 'EINZELNER_HINWEIS';

    return { level, caseCount, informationalOnly: true };
  }

  private deriveAttribution(
    attribution: {
      attributionType: DriverAttributionType;
      confidence: DrivingAttributionConfidence;
    } | null,
    isPrivateTrip: boolean,
  ): TripDecisionSummary['attribution'] {
    if (isPrivateTrip) {
      return {
        level: 'PRIVAT_NICHT_ZUGEORDNET',
        confidence: 'LOW',
        customerChargeable: false,
        attributionType: null,
      };
    }

    const type = attribution?.attributionType ?? null;
    const confidence = attribution?.confidence ?? 'LOW';

    let level: AttributionSummaryLevel = 'UNKLAR';
    if (type === 'CONFIRMED_DRIVER') level = 'BESTAETIGTER_FAHRER';
    else if (type === 'BOOKING_CUSTOMER_ONLY') level = 'BUCHUNGSKUNDE';
    else if (type === 'ASSIGNED_DRIVER') level = 'ZUGEWIESENER_FAHRER';
    else if (type === 'VEHICLE_ONLY' || type === 'STAFF_MOVEMENT') level = 'FAHRZEUGBEZOGEN';

    const customerChargeable =
      (type === 'BOOKING_CUSTOMER_ONLY' || type === 'CONFIRMED_DRIVER') && confidence !== 'LOW';

    return { level, confidence, customerChargeable, attributionType: type };
  }

  private deriveRecommendation(input: {
    dataBasis: DataBasisLevel;
    vehicleLoad: TripDecisionSummary['vehicleLoad'];
    driverConduct: TripDecisionSummary['driverConduct'];
    misuseEvidence: TripDecisionSummary['misuseEvidence'];
    attribution: TripDecisionSummary['attribution'];
    deviceQualityDegraded: boolean;
  }): TripDecisionSummary['recommendation'] {
    const reasons: string[] = [];
    let level: DrivingDecisionRecommendation = 'KEINE_MASSNAHME';

    if (input.deviceQualityDegraded || input.dataBasis === 'EINGESCHRAENKT') {
      level = 'TECHNISCHE_DATENPRUEFUNG';
      reasons.push('Datenqualität eingeschränkt');
    } else if (input.dataBasis === 'UNZUREICHEND' || input.dataBasis === 'NICHT_UNTERSTUETZT') {
      level = 'TECHNISCHE_DATENPRUEFUNG';
      reasons.push('Unzureichende Datenbasis');
    } else if (input.misuseEvidence.level === 'STARKER_VERDACHT') {
      level = 'FAHRZEUGPRUEFUNG';
      reasons.push('Mehrere Missbrauchshinweise');
    } else if (
      input.driverConduct?.level === 'STARK_AUFFAELLIG' ||
      input.vehicleLoad?.level === 'STARK_ERHOHT'
    ) {
      level = 'FAHRZEUGPRUEFUNG';
      reasons.push('Erhöhte Belastung oder auffälliges Fahrverhalten');
    } else if (
      input.driverConduct?.level === 'AUFFAELLIG' ||
      input.vehicleLoad?.level === 'ERHOHT' ||
      input.misuseEvidence.caseCount > 0
    ) {
      level = 'BEOBACHTEN';
      reasons.push('Beobachtungswürdige Signale');
    } else if (input.attribution.customerChargeable) {
      level = 'KEINE_MASSNAHME';
      reasons.push('Belastbare Zuordnung, keine Auffälligkeiten');
    }

    const primaryReason = reasons[0] ?? 'Keine besonderen Hinweise';

    return {
      level,
      primaryReason,
      reasons,
      ctas: [
        {
          action: 'MANUAL_RENTAL_APPROVAL',
          label: 'Manuelle Mietfreigabe',
          eligible: input.attribution.customerChargeable && level !== 'TECHNISCHE_DATENPRUEFUNG',
        },
        {
          action: 'VEHICLE_INSPECTION',
          label: 'Fahrzeugprüfung anlegen',
          eligible: level === 'FAHRZEUGPRUEFUNG',
        },
      ],
    };
  }

  private buildDeniedSummary(tripId: string): TripDecisionSummary {
    return {
      modelVersion: TRIP_DECISION_SUMMARY_MODEL_VERSION,
      inputFingerprint: `denied:${tripId}`,
      computedAt: new Date().toISOString(),
      dataBasis: 'NICHT_UNTERSTUETZT',
      dataBasisReasons: ['BEHAVIOR_PROFILE_DENIED'],
      vehicleLoad: null,
      driverConduct: null,
      misuseEvidence: {
        level: 'KEINE',
        caseCount: 0,
        informationalOnly: true,
      },
      attribution: {
        level: 'UNKLAR',
        confidence: 'LOW',
        customerChargeable: false,
        attributionType: null,
      },
      recommendation: {
        level: 'TECHNISCHE_DATENPRUEFUNG',
        primaryReason: 'Bewertung nicht autorisiert',
        reasons: ['BEHAVIOR_PROFILE_DENIED'],
        ctas: [],
      },
      partial: true,
      stages: {},
      accessDenied: true,
    } as TripDecisionSummary & { accessDenied: boolean };
  }
}
