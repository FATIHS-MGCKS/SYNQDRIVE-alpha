import type { DocumentExtractionType } from '@prisma/client';
import type {
  DocumentActionPlannerActionTemplate,
  DocumentActionPlannerBuildContext,
  DocumentActionPlannerInput,
  DocumentEntityCandidateSnapshot,
  DocumentFollowUpCandidateType,
} from './document-action-planner.types';

function confirmedFieldSnapshot(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  return {
    routingType: ctx.routingType,
    confirmedFieldKeys: Object.keys(ctx.input.confirmedData).sort(),
  };
}

function serviceEventPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    ...confirmedFieldSnapshot(ctx),
    eventDate: data.eventDate ?? null,
    odometerKm: data.odometerKm ?? null,
    workshopName: data.workshopName ?? null,
    description: data.description ?? null,
    costCents: data.costCents ?? null,
  };
}

function inspectionPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    ...confirmedFieldSnapshot(ctx),
    eventDate: data.eventDate ?? null,
    validUntil: data.validUntil ?? null,
    reportNumber: data.reportNumber ?? null,
    result: data.result ?? null,
  };
}

function tirePayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  return {
    ...confirmedFieldSnapshot(ctx),
    treadDepthMm: ctx.input.confirmedData.treadDepthMm ?? null,
    odometerKm: ctx.input.confirmedData.odometerKm ?? null,
  };
}

function brakePayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    ...confirmedFieldSnapshot(ctx),
    serviceKind: data.serviceKind ?? null,
    scopeCsv: data.scopeCsv ?? null,
    frontPadMm: data.frontPadMm ?? null,
    rearPadMm: data.rearPadMm ?? null,
    frontDiscMm: data.frontDiscMm ?? null,
    rearDiscMm: data.rearDiscMm ?? null,
  };
}

function batteryPayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    ...confirmedFieldSnapshot(ctx),
    recordKind: data.recordKind ?? null,
    scope: data.scope ?? null,
    voltageV: data.voltageV ?? null,
    sohPercent: data.sohPercent ?? null,
  };
}

function damagePayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    ...confirmedFieldSnapshot(ctx),
    description: data.description ?? null,
    severity: data.severity ?? null,
    damageType: data.damageType ?? null,
    eventDate: data.eventDate ?? null,
  };
}

function invoicePayload(ctx: DocumentActionPlannerBuildContext): Record<string, unknown> {
  const data = ctx.input.confirmedData;
  return {
    ...confirmedFieldSnapshot(ctx),
    invoiceNumber: data.invoiceNumber ?? null,
    totalCents: data.totalCents ?? null,
    eventDate: data.eventDate ?? data.invoiceDate ?? null,
    vendorName: data.vendorName ?? null,
  };
}

const ACTION_TEMPLATES_BY_TYPE: Partial<
  Record<DocumentExtractionType, DocumentActionPlannerActionTemplate[]>
> = {
  SERVICE: [
    {
      actionType: 'CREATE_SERVICE_EVENT',
      requirement: 'REQUIRED',
      capabilityKey: 'serviceEvents',
      targetEntityType: 'VEHICLE',
      buildPayload: serviceEventPayload,
      buildPreview: (ctx) => ({ wouldCreate: 'vehicle_service_event', ...serviceEventPayload(ctx) }),
    },
  ],
  OIL_CHANGE: [
    {
      actionType: 'CREATE_SERVICE_EVENT',
      requirement: 'REQUIRED',
      capabilityKey: 'serviceEvents',
      targetEntityType: 'VEHICLE',
      buildPayload: serviceEventPayload,
    },
  ],
  TUV_REPORT: [
    {
      actionType: 'CREATE_SERVICE_EVENT',
      requirement: 'REQUIRED',
      capabilityKey: 'serviceEvents',
      targetEntityType: 'VEHICLE',
      buildPayload: serviceEventPayload,
    },
    {
      actionType: 'UPDATE_VEHICLE_INSPECTION',
      requirement: 'REQUIRED',
      capabilityKey: 'vehicleInspections',
      targetEntityType: 'VEHICLE',
      buildPayload: inspectionPayload,
      buildPreview: (ctx) => ({
        wouldUpdate: 'vehicle_tuv_dates',
        note: 'validUntil on document is advisory; apply uses domain rules',
        ...inspectionPayload(ctx),
      }),
    },
  ],
  BOKRAFT_REPORT: [
    {
      actionType: 'CREATE_SERVICE_EVENT',
      requirement: 'REQUIRED',
      capabilityKey: 'serviceEvents',
      targetEntityType: 'VEHICLE',
      buildPayload: serviceEventPayload,
    },
    {
      actionType: 'UPDATE_VEHICLE_INSPECTION',
      requirement: 'REQUIRED',
      capabilityKey: 'vehicleInspections',
      targetEntityType: 'VEHICLE',
      buildPayload: inspectionPayload,
      buildPreview: (ctx) => ({
        wouldUpdate: 'vehicle_bokraft_dates',
        ...inspectionPayload(ctx),
      }),
    },
  ],
  BRAKE: [
    {
      actionType: 'RECORD_BRAKE_EVIDENCE',
      requirement: 'REQUIRED',
      capabilityKey: 'brakeEvidence',
      targetEntityType: 'VEHICLE',
      buildPayload: brakePayload,
    },
  ],
  TIRE: [
    {
      actionType: 'RECORD_TIRE_MEASUREMENT',
      requirement: 'REQUIRED',
      capabilityKey: 'tireMeasurements',
      targetEntityType: 'VEHICLE',
      buildPayload: tirePayload,
    },
  ],
  BATTERY: [
    {
      actionType: 'RECORD_BATTERY_EVIDENCE',
      requirement: 'REQUIRED',
      capabilityKey: 'batteryEvidence',
      targetEntityType: 'VEHICLE',
      buildPayload: batteryPayload,
    },
  ],
  DAMAGE: [
    {
      actionType: 'CREATE_DAMAGE',
      requirement: 'REQUIRED',
      capabilityKey: 'damages',
      targetEntityType: 'VEHICLE',
      buildPayload: damagePayload,
    },
  ],
  ACCIDENT: [
    {
      actionType: 'CREATE_DAMAGE',
      requirement: 'REQUIRED',
      capabilityKey: 'damages',
      targetEntityType: 'VEHICLE',
      buildPayload: damagePayload,
    },
  ],
  INVOICE: [
    {
      actionType: 'CREATE_INVOICE',
      requirement: 'REQUIRED',
      capabilityKey: 'invoices',
      targetEntityType: 'VEHICLE',
      buildPayload: invoicePayload,
    },
  ],
  OTHER: [
    {
      actionType: 'ARCHIVE_ONLY',
      requirement: 'INFORMATIONAL',
      capabilityKey: 'serviceEvents',
      buildPayload: confirmedFieldSnapshot,
    },
  ],
};

export function listActionTemplatesForRoutingType(
  routingType: DocumentExtractionType | null,
): DocumentActionPlannerActionTemplate[] {
  if (!routingType) return [];
  return ACTION_TEMPLATES_BY_TYPE[routingType] ?? [];
}

const FOLLOW_UP_BY_TYPE: Partial<Record<DocumentExtractionType, DocumentFollowUpCandidateType[]>> = {
  INVOICE: ['CREATE_TASK', 'REQUEST_CUSTOMER_INFO'],
  TUV_REPORT: ['SCHEDULE_INSPECTION', 'CREATE_TASK'],
  BOKRAFT_REPORT: ['SCHEDULE_INSPECTION'],
  SERVICE: ['CREATE_TASK'],
  DAMAGE: ['CREATE_TASK', 'MANUAL_REVIEW'],
  ACCIDENT: ['CREATE_TASK', 'MANUAL_REVIEW'],
  OTHER: ['MANUAL_REVIEW'],
};

function hasConfirmedEntityLink(
  entityLinks: DocumentActionPlannerInput['entityLinks'],
  entityType: string,
): boolean {
  return entityLinks.some(
    (link) =>
      String(link.entityType).toUpperCase() === entityType.toUpperCase() && link.entityId?.trim(),
  );
}

function hasCandidate(
  candidates: DocumentEntityCandidateSnapshot[],
  entityType: string,
): boolean {
  return candidates.some(
    (candidate) => String(candidate.entityType).toUpperCase() === entityType.toUpperCase(),
  );
}

export function resolveFollowUpCandidateTypes(
  routingType: DocumentExtractionType | null,
  input: Pick<DocumentActionPlannerInput, 'entityLinks' | 'entityCandidates' | 'confirmedData'>,
  isBlocked: boolean,
): DocumentFollowUpCandidateType[] {
  if (!routingType) {
    return isBlocked ? ['MANUAL_REVIEW'] : [];
  }

  const base = [...(FOLLOW_UP_BY_TYPE[routingType] ?? [])];

  if (routingType === 'INVOICE' && !hasConfirmedEntityLink(input.entityLinks, 'VENDOR')) {
    if (!hasCandidate(input.entityCandidates, 'VENDOR') && !base.includes('REQUEST_CUSTOMER_INFO')) {
      base.push('REQUEST_CUSTOMER_INFO');
    }
  }

  if (
    (routingType === 'TUV_REPORT' || routingType === 'BOKRAFT_REPORT') &&
    typeof input.confirmedData.defects === 'string' &&
    input.confirmedData.defects.trim()
  ) {
    if (!base.includes('SCHEDULE_INSPECTION')) base.push('SCHEDULE_INSPECTION');
  }

  if (isBlocked && !base.includes('MANUAL_REVIEW')) {
    base.push('MANUAL_REVIEW');
  }

  return [...new Set(base)].sort();
}

export function buildPlannerSummary(
  routingType: DocumentExtractionType | null,
  actionCount: number,
  isBlocked: boolean,
): string {
  if (isBlocked) {
    return routingType
      ? `Blocked action plan for ${routingType}; downstream apply is not executable.`
      : 'Blocked action plan; routing type unresolved or requirements missing.';
  }
  if (!routingType) {
    return 'No downstream actions — document category does not map to a concrete apply type.';
  }
  if (actionCount === 0) {
    return `No executable actions for ${routingType}.`;
  }
  return `Planned ${actionCount} action(s) for ${routingType}.`;
}
