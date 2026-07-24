/**
 * Entity reference extraction, deduplication, and analytics counting for Business Insights.
 */
import type {
  InsightEntityAwareRow,
  InsightEntityBreakdown,
  InsightEntityCountSummary,
  InsightEntityReference,
  InsightEntityRelationType,
  InsightEntityType,
} from './insight-entity-references.contract';

const BOOKING_SCOPED_INSIGHT_TYPES = new Set<string>([
  'PICKUP_OVERDUE',
  'TIGHT_HANDOVER',
  'RETURN_NEEDS_INSPECTION',
  'SERVICE_BEFORE_BOOKING',
]);

const ORG_WIDE_INSIGHT_TYPES = new Set<string>(['STATION_SHORTAGE', 'LOW_UTILIZATION', 'SERVICE_WINDOW']);

export function mapEntityScopeToType(scope: string | null | undefined): InsightEntityType {
  switch ((scope ?? '').toUpperCase()) {
    case 'STATION':
      return 'STATION';
    case 'FLEET':
    case 'VEHICLE_GROUP':
      return 'ORGANIZATION';
    case 'BOOKING':
      return 'BOOKING';
    case 'VEHICLE':
    default:
      return 'VEHICLE';
  }
}

function refKey(ref: Pick<InsightEntityReference, 'entityType' | 'entityId' | 'relationType'>): string {
  return `${ref.entityType}:${ref.entityId}:${ref.relationType}`;
}

export function dedupeEntityReferences(refs: InsightEntityReference[]): InsightEntityReference[] {
  const seen = new Set<string>();
  const out: InsightEntityReference[] = [];
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function sanitizeEntityReferences(
  refs: InsightEntityReference[],
  organizationId: string,
): InsightEntityReference[] {
  return dedupeEntityReferences(
    refs.filter((ref) => ref.organizationId === organizationId && ref.entityId.trim().length > 0),
  );
}

function pushRef(
  refs: InsightEntityReference[],
  partial: Omit<InsightEntityReference, 'organizationId'> & { organizationId?: string },
  organizationId: string,
): void {
  refs.push({
    organizationId,
    stationId: partial.stationId ?? null,
    entityType: partial.entityType,
    entityId: partial.entityId,
    relationType: partial.relationType,
  });
}

/** Build typed references from a detector candidate or persisted insight row (legacy fallback). */
export function buildEntityReferencesFromRow(
  row: InsightEntityAwareRow,
  organizationId: string,
): InsightEntityReference[] {
  if (row.entityReferences?.length) {
    return sanitizeEntityReferences(row.entityReferences, organizationId);
  }

  const refs: InsightEntityReference[] = [];
  const m = row.metrics ?? {};
  const tc = row.timeContext ?? {};
  const primaryType = mapEntityScopeToType(row.entityScope);
  const stationId =
    (typeof m.stationId === 'string' ? m.stationId : null) ??
    (typeof tc.pickupStationId === 'string' ? tc.pickupStationId : null) ??
    (typeof tc.returnStationId === 'string' ? tc.returnStationId : null) ??
    null;

  for (const entityId of row.entityIds ?? []) {
    pushRef(refs, { entityType: primaryType, entityId, stationId, relationType: 'PRIMARY' }, organizationId);
  }

  const bookingId =
    (typeof m.bookingId === 'string' ? m.bookingId : null) ??
    (typeof tc.bookingId === 'string' ? tc.bookingId : null);
  if (bookingId) {
    pushRef(
      refs,
      {
        entityType: 'BOOKING',
        entityId: bookingId,
        stationId,
        relationType: BOOKING_SCOPED_INSIGHT_TYPES.has(row.type) ? 'PRIMARY' : 'AFFECTED',
      },
      organizationId,
    );
  }

  const bookingIds = Array.isArray(m.bookingIds) ? m.bookingIds : [];
  for (const rawId of bookingIds) {
    if (typeof rawId !== 'string' || !rawId) continue;
    pushRef(
      refs,
      {
        entityType: 'BOOKING',
        entityId: rawId,
        stationId,
        relationType: BOOKING_SCOPED_INSIGHT_TYPES.has(row.type) ? 'PRIMARY' : 'AFFECTED',
      },
      organizationId,
    );
  }

  const customerId = typeof m.customerId === 'string' ? m.customerId : null;
  if (customerId) {
    pushRef(refs, { entityType: 'CUSTOMER', entityId: customerId, stationId, relationType: 'CONTEXT' }, organizationId);
  }

  const affectedVehicleId = typeof m.affectedVehicleId === 'string' ? m.affectedVehicleId : null;
  if (affectedVehicleId) {
    pushRef(
      refs,
      { entityType: 'VEHICLE', entityId: affectedVehicleId, stationId, relationType: 'AFFECTED' },
      organizationId,
    );
  }

  const entities = Array.isArray(m.entities) ? m.entities : [];
  for (const raw of entities) {
    if (!raw || typeof raw !== 'object') continue;
    const entity = raw as Record<string, unknown>;
    const nestedMetrics =
      entity.metrics && typeof entity.metrics === 'object'
        ? (entity.metrics as Record<string, unknown>)
        : null;
    const nestedBookingId =
      typeof nestedMetrics?.bookingId === 'string' ? nestedMetrics.bookingId : null;
    if (nestedBookingId) {
      pushRef(
        refs,
        {
          entityType: 'BOOKING',
          entityId: nestedBookingId,
          stationId:
            (typeof entity.stationId === 'string' ? entity.stationId : null) ?? stationId,
          relationType: BOOKING_SCOPED_INSIGHT_TYPES.has(row.type) ? 'PRIMARY' : 'AFFECTED',
        },
        organizationId,
      );
    }

    const entityId = typeof entity.id === 'string' ? entity.id : null;
    if (!entityId) continue;
    pushRef(
      refs,
      { entityType: primaryType, entityId, stationId, relationType: 'GROUP_MEMBER' },
      organizationId,
    );
  }

  if (primaryType === 'STATION' && ORG_WIDE_INSIGHT_TYPES.has(row.type) && refs.length === 0) {
    // station shortage always has entityIds — defensive
  }

  return sanitizeEntityReferences(refs, organizationId);
}

export function resolveInsightEventCount(row: InsightEntityAwareRow): number {
  const m = row.metrics ?? {};
  if (typeof m.groupedCount === 'number' && m.groupedCount > 0) return m.groupedCount;
  if (typeof m.eventCount === 'number' && m.eventCount > 0) return m.eventCount;
  if (row.isGrouped && typeof row.groupCount === 'number' && row.groupCount > 1) {
    return row.groupCount;
  }
  return 1;
}

export function computeGroupCountFromReferences(
  refs: InsightEntityReference[],
  entityScope: string | null | undefined,
): number {
  const primaryType = mapEntityScopeToType(entityScope);
  const countable = refs.filter(
    (r) =>
      r.entityType === primaryType &&
      (r.relationType === 'PRIMARY' || r.relationType === 'GROUP_MEMBER' || r.relationType === 'AFFECTED'),
  );
  const unique = new Set(countable.map((r) => r.entityId));
  return Math.max(unique.size, refs.length > 0 ? 1 : 0);
}

export function buildInsightEntityBreakdown(
  row: InsightEntityAwareRow,
  organizationId: string,
): InsightEntityBreakdown {
  const references = buildEntityReferencesFromRow(row, organizationId);
  const groupCount =
    typeof row.groupCount === 'number' && row.groupCount > 0
      ? row.groupCount
      : computeGroupCountFromReferences(references, row.entityScope);
  return {
    eventCount: resolveInsightEventCount(row),
    groupCount,
    references,
  };
}

function hasBookingReference(refs: InsightEntityReference[]): boolean {
  return refs.some(
    (r) => r.entityType === 'BOOKING' && (r.relationType === 'PRIMARY' || r.relationType === 'AFFECTED'),
  );
}

function uniqueByType(refs: InsightEntityReference[], type: InsightEntityType): number {
  return new Set(refs.filter((r) => r.entityType === type).map((r) => r.entityId)).size;
}

function uniqueEntities(refs: InsightEntityReference[]): number {
  return new Set(refs.map((r) => `${r.entityType}:${r.entityId}`)).size;
}

export function computeInsightEntityCountSummary(
  rows: InsightEntityAwareRow[],
  organizationId: string,
  isVisible: (row: InsightEntityAwareRow) => boolean = () => true,
): InsightEntityCountSummary {
  const visible = rows.filter(isVisible);
  let events = 0;
  let criticalBookings = 0;
  let orgWideRisks = 0;
  let bookingScopedRisks = 0;

  const allRefs: InsightEntityReference[] = [];

  for (const row of visible) {
    const breakdown = buildInsightEntityBreakdown(row, organizationId);
    events += breakdown.eventCount;
    allRefs.push(...breakdown.references);

    const bookingScoped = hasBookingReference(breakdown.references);
    if (bookingScoped) bookingScopedRisks += 1;
    else orgWideRisks += 1;

    if (row.severity === 'CRITICAL' && bookingScoped) {
      const criticalBookingIds = new Set(
        breakdown.references
          .filter(
            (r) =>
              r.entityType === 'BOOKING' &&
              (r.relationType === 'PRIMARY' || r.relationType === 'AFFECTED'),
          )
          .map((r) => r.entityId),
      );
      criticalBookings += criticalBookingIds.size;
    }
  }

  const sanitized = sanitizeEntityReferences(allRefs, organizationId);

  return {
    insightGroups: visible.length,
    events,
    affectedVehicles: uniqueByType(sanitized, 'VEHICLE'),
    affectedBookings: uniqueByType(sanitized, 'BOOKING'),
    affectedCustomers: uniqueByType(sanitized, 'CUSTOMER'),
    affectedStations: uniqueByType(sanitized, 'STATION'),
    uniqueEntities: uniqueEntities(sanitized),
    criticalBookings,
    orgWideRisks,
    bookingScopedRisks,
  };
}

export function mergeGroupedEntityReferences(
  items: Array<{ refs: InsightEntityReference[]; relationType?: InsightEntityRelationType }>,
  organizationId: string,
): InsightEntityReference[] {
  const merged: InsightEntityReference[] = [];
  for (const item of items) {
    for (const ref of item.refs) {
      const relationType =
        ref.relationType === 'PRIMARY'
          ? 'GROUP_MEMBER'
          : item.relationType ?? ref.relationType;
      merged.push({ ...ref, organizationId, relationType });
    }
  }
  return sanitizeEntityReferences(merged, organizationId);
}
