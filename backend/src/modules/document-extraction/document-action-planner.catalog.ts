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

const ACTION_TEMPLATES_BY_TYPE: Partial<
  Record<DocumentExtractionType, DocumentActionPlannerActionTemplate[]>
> = {
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
