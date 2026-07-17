import type { BrakeAxle } from '@prisma/client';
import {
  evidenceRef,
  type BrakeBaselineComponent,
  type BrakeThicknessSignal,
  type OdometerSignal,
  type VehicleBrakeBaselineAuditInput,
} from './brake-baseline-candidate-audit';
import {
  inferBackfillBrakeCondition,
  isRegistrationBrakeSpecSource,
} from './brake-registration-backfill.service';
import { applyNewBrakeDefaults, normalizeRegistrationBrakeCondition } from './register-brake-baseline';

const BRAKE_DTC_PREFIXES = ['C0', 'C1', 'B1'];

export interface RawBrakeEvidenceRow {
  id: string;
  source: string;
  axle: string;
  measuredPadMm: string;
  measuredDiscMm: string;
  mileageAtMeasurementKm: string;
  measuredAt: string;
  confidence: string;
}

export interface RawServiceEventRow {
  id: string;
  eventDate: string;
  odometerKm: string;
  brakeServiceKind: string;
  brakeServiceScope: string;
  brakeMeasuredSnapshot: string;
}

export interface RawDocumentRow {
  id: string;
  confirmedAt: string;
  odometerKm: string;
  status: string;
}

export interface RawOdometerRow {
  source: string;
  odometerKm: string;
  observedAt: string;
  refId: string;
}

export interface RawEnrichmentJobRow {
  status: string;
  classification: string | null;
}

export interface BuildVehicleAuditInputArgs {
  vehicleId: string;
  organizationId: string | null;
  registeredAt: string;
  registrationMileageKm: number | null;
  brakeHealthCurrent: VehicleBrakeBaselineAuditInput['brakeHealthCurrent'];
  referenceSpec: VehicleBrakeBaselineAuditInput['referenceSpec'];
  evidence: RawBrakeEvidenceRow[];
  serviceEvents: RawServiceEventRow[];
  documents: RawDocumentRow[];
  odometerSignals: RawOdometerRow[];
  enrichmentJobs: RawEnrichmentJobRow[];
  tripCountSinceRegistration: number;
  activeDtcCount: number;
  auditSalt: string;
}

function parseJsonArray(raw: string): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function num(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function axleToPadComponent(axle: string): BrakeBaselineComponent | null {
  const key = axle.toUpperCase();
  if (key === 'FRONT') return 'FRONT_PADS';
  if (key === 'REAR') return 'REAR_PADS';
  return null;
}

function scopeIncludes(scope: string[], token: string): boolean {
  return scope.some((s) => String(s).toUpperCase().includes(token));
}

function snapshotComponent(
  snapshot: Record<string, unknown>,
  component: BrakeBaselineComponent,
): number | null {
  switch (component) {
    case 'FRONT_PADS':
      return num(snapshot.frontPadMm as string) ?? num(snapshot.frontPadThickness as string);
    case 'REAR_PADS':
      return num(snapshot.rearPadMm as string) ?? num(snapshot.rearPadThickness as string);
    case 'FRONT_DISCS':
      return num(snapshot.frontDiscMm as string) ?? num(snapshot.frontRotorWidth as string);
    case 'REAR_DISCS':
      return num(snapshot.rearDiscMm as string) ?? num(snapshot.rearRotorWidth as string);
    default:
      return null;
  }
}

function evidenceConfidence(raw: string): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' {
  const key = raw.toUpperCase();
  if (key === 'HIGH') return 'HIGH';
  if (key === 'MEDIUM') return 'MEDIUM';
  if (key === 'LOW') return 'LOW';
  return 'UNKNOWN';
}

function buildSpecSignals(
  spec: NonNullable<VehicleBrakeBaselineAuditInput['referenceSpec']>,
  auditSalt: string,
  vehicleId: string,
  registrationMileageKm: number | null,
): BrakeThicknessSignal[] {
  const manual = {
    condition: inferBackfillBrakeCondition({ sourceType: spec.sourceType }),
    serviceDate: spec.createdAt,
    frontPadThickness: spec.frontPadThickness,
    rearPadThickness: spec.rearPadThickness,
    frontRotorWidth: spec.frontRotorWidth,
    rearRotorWidth: spec.rearRotorWidth,
    source: spec.sourceType ?? 'manual_registration',
  };
  const condition = normalizeRegistrationBrakeCondition(manual.condition);
  const withDefaults = applyNewBrakeDefaults(manual, condition);
  const observedAt = spec.createdAt;
  const odometerKm = registrationMileageKm;

  const rows: Array<{ component: BrakeBaselineComponent; mm: number | null }> = [
    { component: 'FRONT_PADS', mm: withDefaults.frontPadThickness ?? null },
    { component: 'REAR_PADS', mm: withDefaults.rearPadThickness ?? null },
    { component: 'FRONT_DISCS', mm: withDefaults.frontRotorWidth ?? null },
    { component: 'REAR_DISCS', mm: withDefaults.rearRotorWidth ?? null },
  ];

  return rows
    .filter((r) => r.mm != null)
    .map((r) => ({
      component: r.component,
      thicknessMm: r.mm,
      source: isRegistrationBrakeSpecSource(spec.sourceType)
        ? ('REGISTRATION_SPEC' as const)
        : ('REFERENCE_SPEC_NOMINAL' as const),
      observedAt,
      odometerKm,
      evidenceRef: evidenceRef('spec', `${vehicleId}:${r.component}`, auditSalt),
      isNominalSpec: true,
    }));
}

export function buildVehicleBrakeBaselineAuditInput(
  args: BuildVehicleAuditInputArgs,
): VehicleBrakeBaselineAuditInput {
  const signals: BrakeThicknessSignal[] = [];
  const odometerSignals: OdometerSignal[] = args.odometerSignals
    .map((row) => ({
      odometerKm: num(row.odometerKm) ?? 0,
      observedAt: row.observedAt,
      source: row.source,
      evidenceRef: evidenceRef('odo', row.refId, args.auditSalt),
    }))
    .filter((row) => Number.isFinite(row.odometerKm));

  if (args.registrationMileageKm != null) {
    odometerSignals.push({
      odometerKm: args.registrationMileageKm,
      observedAt: args.registeredAt,
      source: 'REGISTRATION_MILEAGE',
      evidenceRef: evidenceRef('reg', args.vehicleId, args.auditSalt),
    });
  }

  for (const ev of args.evidence) {
    const padComponent = axleToPadComponent(ev.axle);
    const padMm = num(ev.measuredPadMm);
    const discMm = num(ev.measuredDiscMm);
    const observedAt = ev.measuredAt || args.registeredAt;
    const odometerKm = num(ev.mileageAtMeasurementKm);
    const confidence = evidenceConfidence(ev.confidence);

    if (padComponent && padMm != null) {
      signals.push({
        component: padComponent,
        thicknessMm: padMm,
        source: 'BRAKE_EVIDENCE_MEASUREMENT',
        observedAt,
        odometerKm,
        evidenceRef: evidenceRef('ev', ev.id, args.auditSalt),
        confidence,
      });
    }
    if (padComponent === 'FRONT_PADS' && discMm != null) {
      signals.push({
        component: 'FRONT_DISCS',
        thicknessMm: discMm,
        source: 'BRAKE_EVIDENCE_MEASUREMENT',
        observedAt,
        odometerKm,
        evidenceRef: evidenceRef('ev_disc', ev.id, args.auditSalt),
        confidence,
      });
    }
    if (padComponent === 'REAR_PADS' && discMm != null) {
      signals.push({
        component: 'REAR_DISCS',
        thicknessMm: discMm,
        source: 'BRAKE_EVIDENCE_MEASUREMENT',
        observedAt,
        odometerKm,
        evidenceRef: evidenceRef('ev_disc', ev.id, args.auditSalt),
        confidence,
      });
    }
  }

  for (const event of args.serviceEvents) {
    const scope = parseJsonArray(event.brakeServiceScope);
    const snapshot = parseJsonObject(event.brakeMeasuredSnapshot);
    const observedAt = event.eventDate;
    const odometerKm = num(event.odometerKm);
    if (odometerKm != null) {
      odometerSignals.push({
        odometerKm,
        observedAt,
        source: 'SERVICE_EVENT',
        evidenceRef: evidenceRef('svc', event.id, args.auditSalt),
      });
    }

    const isReplacement = String(event.brakeServiceKind ?? '')
      .toUpperCase()
      .match(/PADS|DISCS|FULL/);

    for (const component of ['FRONT_PADS', 'REAR_PADS', 'FRONT_DISCS', 'REAR_DISCS'] as const) {
      const inScope =
        scope.length === 0 ||
        scopeIncludes(scope, component) ||
        scopeIncludes(scope, component.split('_')[0]);
      if (!inScope && scope.length > 0) continue;

      const mm = snapshotComponent(snapshot, component);
      if (mm != null) {
        signals.push({
          component,
          thicknessMm: mm,
          source: 'SERVICE_EVENT_MEASUREMENT',
          observedAt,
          odometerKm,
          evidenceRef: evidenceRef('svc_mm', `${event.id}:${component}`, args.auditSalt),
          confidence: 'HIGH',
          serviceScope: scope,
        });
        continue;
      }

      if (isReplacement) {
        signals.push({
          component,
          thicknessMm: null,
          source: 'SERVICE_EVENT_REPLACEMENT',
          observedAt,
          odometerKm,
          evidenceRef: evidenceRef('svc_rep', `${event.id}:${component}`, args.auditSalt),
          isDocumentedReplacement: true,
          serviceScope: scope,
        });
      }
    }
  }

  for (const doc of args.documents) {
    const odometerKm = num(doc.odometerKm);
    if (odometerKm != null) {
      odometerSignals.push({
        odometerKm,
        observedAt: doc.confirmedAt,
        source: 'AI_DOCUMENT',
        evidenceRef: evidenceRef('doc', doc.id, args.auditSalt),
      });
    }
    signals.push({
      component: 'FRONT_PADS',
      thicknessMm: null,
      source: 'AI_DOCUMENT_CONFIRMED',
      observedAt: doc.confirmedAt,
      odometerKm,
      evidenceRef: evidenceRef('doc_brake', doc.id, args.auditSalt),
      confidence: 'MEDIUM',
      isDocumentedReplacement: true,
    });
  }

  if (args.referenceSpec) {
    signals.push(
      ...buildSpecSignals(
        args.referenceSpec,
        args.auditSalt,
        args.vehicleId,
        args.registrationMileageKm,
      ),
    );
  }

  const registrationCondition = args.referenceSpec
    ? inferBackfillBrakeCondition({ sourceType: args.referenceSpec.sourceType })
    : null;

  if (registrationCondition === 'NEW') {
    for (const component of ['FRONT_PADS', 'REAR_PADS', 'FRONT_DISCS', 'REAR_DISCS'] as const) {
      const already = signals.some((s) => s.component === component);
      if (!already) {
        signals.push({
          component,
          thicknessMm: null,
          source: 'REGISTRATION_ASSERTION',
          observedAt: args.referenceSpec?.createdAt ?? args.registeredAt,
          odometerKm: args.registrationMileageKm,
          evidenceRef: evidenceRef('assert', `${args.vehicleId}:${component}`, args.auditSalt),
        });
      }
    }
  }

  const pendingEnrichmentJobs = args.enrichmentJobs.filter(
    (j) => String(j.status).toUpperCase() === 'PENDING',
  ).length;

  return {
    vehicleId: args.vehicleId,
    organizationId: args.organizationId,
    registeredAt: args.registeredAt,
    registrationMileageKm: args.registrationMileageKm,
    registrationBrakeCondition: registrationCondition,
    registrationBrakeSource: args.referenceSpec?.sourceType ?? null,
    brakeHealthCurrent: args.brakeHealthCurrent,
    referenceSpec: args.referenceSpec,
    thicknessSignals: signals,
    odometerSignals,
    pendingEnrichmentJobs,
    legacyJobClassification: args.enrichmentJobs[0]?.classification ?? null,
    tripCountSinceRegistration: args.tripCountSinceRegistration,
    brakeServiceEventCount: args.serviceEvents.length,
    brakeEvidenceCount: args.evidence.length,
    activeDtcCount: args.activeDtcCount,
    confirmedDocumentCount: args.documents.length,
  };
}

export function isBrakeRelatedDtcCode(code: string): boolean {
  const upper = code.toUpperCase();
  return BRAKE_DTC_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

export function mapEvidenceAxle(axle: BrakeAxle | string): BrakeBaselineComponent | null {
  return axleToPadComponent(String(axle));
}
