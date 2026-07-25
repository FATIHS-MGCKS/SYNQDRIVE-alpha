import {
  HANDOVER_DRAFT_SCHEMA_VERSION,
  HANDOVER_DRAFT_STEPS,
  type HandoverDraftFormData,
  type HandoverDraftStepId,
  type HandoverSessionDraftPayload,
  type HandoverDraftSignatureStatus,
  type HandoverDraftUploadRef,
  type HandoverDraftTechnicalObservation,
} from './handover-session-draft.types';

export function createEmptyHandoverDraftPayload(
  step: HandoverDraftStepId = 'vehicle',
  stationId: string | null = null,
): HandoverSessionDraftPayload {
  return {
    schemaVersion: HANDOVER_DRAFT_SCHEMA_VERSION,
    currentStep: step,
    form: {
      odometerKm: '',
      fuelPercent: 50,
      fuelFull: false,
      performedAtLocal: '',
      checks: {
        exteriorClean: true,
        interiorClean: true,
        tiresSeasonOk: true,
        warningLightsOn: false,
        documentsAcknowledged: false,
      },
      warningLightsNotes: '',
      notes: '',
      staffId: '',
      staffName: '',
      actualStationId: stationId ?? '',
      selectedDamageIds: [],
      tireMeasurementCaptured: false,
      technicalObservationDrafts: [],
    },
    uploadRefs: [],
    signatureStatus: {
      customer: { name: null, captured: false },
      staff: { name: null, captured: false },
    },
  };
}

function parseStep(value: unknown): HandoverDraftStepId {
  if (typeof value === 'string' && (HANDOVER_DRAFT_STEPS as readonly string[]).includes(value)) {
    return value as HandoverDraftStepId;
  }
  return 'vehicle';
}

function parseFormData(raw: unknown, stationId: string | null): HandoverDraftFormData {
  const f = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const checksRaw =
    f.checks && typeof f.checks === 'object' ? (f.checks as Record<string, unknown>) : {};
  const damageIds = Array.isArray(f.selectedDamageIds)
    ? f.selectedDamageIds.filter((v): v is string => typeof v === 'string')
    : [];
  const observations: HandoverDraftTechnicalObservation[] = Array.isArray(f.technicalObservationDrafts)
    ? f.technicalObservationDrafts
        .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === 'object')
        .map((o) => ({
          id: typeof o.id === 'string' ? o.id : cryptoRandomId(),
          description: typeof o.description === 'string' ? o.description : '',
          category: typeof o.category === 'string' ? o.category : null,
          affectedArea: typeof o.affectedArea === 'string' ? o.affectedArea : null,
          severity: typeof o.severity === 'string' ? o.severity : null,
          blocksRental: o.blocksRental === true,
        }))
    : [];

  return {
    odometerKm: typeof f.odometerKm === 'string' ? f.odometerKm : String(f.odometerKm ?? ''),
    fuelPercent:
      typeof f.fuelPercent === 'number' && Number.isFinite(f.fuelPercent)
        ? Math.max(0, Math.min(100, Math.round(f.fuelPercent)))
        : 50,
    fuelFull: f.fuelFull === true,
    performedAtLocal: typeof f.performedAtLocal === 'string' ? f.performedAtLocal : '',
    checks: {
      exteriorClean: checksRaw.exteriorClean !== false,
      interiorClean: checksRaw.interiorClean !== false,
      tiresSeasonOk: checksRaw.tiresSeasonOk !== false,
      warningLightsOn: checksRaw.warningLightsOn === true,
      documentsAcknowledged: checksRaw.documentsAcknowledged === true,
    },
    warningLightsNotes: typeof f.warningLightsNotes === 'string' ? f.warningLightsNotes : '',
    notes: typeof f.notes === 'string' ? f.notes : '',
    staffId: typeof f.staffId === 'string' ? f.staffId : '',
    staffName: typeof f.staffName === 'string' ? f.staffName : '',
    actualStationId:
      typeof f.actualStationId === 'string' && f.actualStationId.trim()
        ? f.actualStationId.trim()
        : stationId ?? '',
    selectedDamageIds: damageIds,
    tireMeasurementCaptured: f.tireMeasurementCaptured === true,
    technicalObservationDrafts: observations,
  };
}

function parseUploadRefs(raw: unknown): HandoverDraftUploadRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
    .map((r) => ({
      extractionId: typeof r.extractionId === 'string' ? r.extractionId : '',
      documentType: typeof r.documentType === 'string' ? r.documentType : null,
      confirmedAt: typeof r.confirmedAt === 'string' ? r.confirmedAt : null,
    }))
    .filter((r) => r.extractionId.length > 0);
}

function parseSignatureStatus(raw: unknown): HandoverDraftSignatureStatus {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const customer =
    s.customer && typeof s.customer === 'object' ? (s.customer as Record<string, unknown>) : {};
  const staff =
    s.staff && typeof s.staff === 'object' ? (s.staff as Record<string, unknown>) : {};
  return {
    customer: {
      name: typeof customer.name === 'string' ? customer.name : null,
      captured: customer.captured === true,
    },
    staff: {
      name: typeof staff.name === 'string' ? staff.name : null,
      captured: staff.captured === true,
    },
  };
}

export function parseHandoverSessionDraftPayload(
  raw: unknown,
  stationId: string | null,
): HandoverSessionDraftPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return createEmptyHandoverDraftPayload('vehicle', stationId);
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion === HANDOVER_DRAFT_SCHEMA_VERSION && record.form) {
    return {
      schemaVersion: HANDOVER_DRAFT_SCHEMA_VERSION,
      currentStep: parseStep(record.currentStep),
      form: parseFormData(record.form, stationId),
      uploadRefs: parseUploadRefs(record.uploadRefs),
      signatureStatus: parseSignatureStatus(record.signatureStatus),
    };
  }
  return mergeHandoverDraftPayload(createEmptyHandoverDraftPayload('vehicle', stationId), raw, stationId);
}

export function mergeHandoverDraftPayload(
  existing: HandoverSessionDraftPayload,
  patch: unknown,
  stationId: string | null,
): HandoverSessionDraftPayload {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return existing;
  }
  const p = patch as Record<string, unknown>;
  const nextStep = p.currentStep != null ? parseStep(p.currentStep) : existing.currentStep;
  const formPatch = p.form ?? p;
  const mergedForm = {
    ...existing.form,
    ...parseFormData({ ...existing.form, ...(formPatch as object) }, stationId),
  };
  const uploadRefs =
    p.uploadRefs !== undefined ? parseUploadRefs(p.uploadRefs) : existing.uploadRefs;
  const signatureStatus =
    p.signatureStatus !== undefined
      ? parseSignatureStatus(p.signatureStatus)
      : existing.signatureStatus;

  return {
    schemaVersion: HANDOVER_DRAFT_SCHEMA_VERSION,
    currentStep: nextStep,
    form: mergedForm,
    uploadRefs,
    signatureStatus,
  };
}

export function draftPayloadToProtocolFields(
  draft: HandoverSessionDraftPayload,
): Record<string, unknown> {
  const { form, signatureStatus } = draft;
  return {
    odometerKm: form.odometerKm ? Number(form.odometerKm) : 0,
    fuelPercent: form.fuelPercent,
    fuelFull: form.fuelFull,
    exteriorClean: form.checks.exteriorClean,
    interiorClean: form.checks.interiorClean,
    tiresSeasonOk: form.checks.tiresSeasonOk,
    warningLightsOn: form.checks.warningLightsOn,
    warningLightsNotes: form.warningLightsNotes || null,
    notes: form.notes || null,
    documentsAcknowledged: form.checks.documentsAcknowledged,
    damageIds: form.selectedDamageIds,
    technicalObservations: form.technicalObservationDrafts.map((o) => ({
      description: o.description,
      category: o.category,
      affectedArea: o.affectedArea,
      severity: o.severity,
      blocksRental: o.blocksRental,
    })),
    actualStationId: form.actualStationId || null,
    performedAt: form.performedAtLocal || null,
    customerSignatureName: signatureStatus.customer.name,
    staffSignatureName: signatureStatus.staff.name,
  };
}

function cryptoRandomId(): string {
  return `obs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
